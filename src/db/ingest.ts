/**
 * ingest.ts - Data ingestion script for Kolko Kosta
 *
 * Downloads the daily ZIP archive from api.cijene.dev and loads all
 * stores, products, and prices into the SQLite database.
 *
 * Usage:
 *   bun run src/db/ingest.ts                    # Ingest today's data
 *   bun run src/db/ingest.ts --date 2025-06-01  # Ingest a specific date
 *   bun run src/db/ingest.ts --force             # Re-ingest even if already done
 *
 * Cron job (daily at 2am):
 *   0 2 * * * cd /path/to/app && bun run src/db/ingest.ts >> /var/log/ingest.log 2>&1
 */

import { db } from "./index";
import { stores, products, prices, ingestionLog } from "./schema";
import {
  fetchArchiveList,
  getTodayDate,
  parseCSVText,
  CHAINS,
} from "../lib/cijene";
import { eq } from "drizzle-orm";

// ZIP parsing utilities (duplicated here so this script can run standalone)
interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressionMethod: number;
}

function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readUint16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

async function fetchRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Range request failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

async function getZipEntries(url: string, fileSize: number): Promise<ZipEntry[]> {
  const tailSize = Math.min(65536 + 22, fileSize);
  const tailStart = fileSize - tailSize;
  const tailBuffer = await fetchRange(url, tailStart, fileSize - 1);
  const tailView = new DataView(tailBuffer);

  let eocdOffset = -1;
  for (let i = tailBuffer.byteLength - 22; i >= 0; i--) {
    if (
      tailView.getUint8(i) === 0x50 &&
      tailView.getUint8(i + 1) === 0x4b &&
      tailView.getUint8(i + 2) === 0x05 &&
      tailView.getUint8(i + 3) === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) throw new Error("Could not find ZIP End of Central Directory");

  const cdSize = readUint32LE(tailView, eocdOffset + 12);
  const cdOffset = readUint32LE(tailView, eocdOffset + 16);

  const cdBuffer = await fetchRange(url, cdOffset, cdOffset + cdSize - 1);
  const cdView = new DataView(cdBuffer);

  const entries: ZipEntry[] = [];
  let pos = 0;

  while (pos < cdBuffer.byteLength - 4) {
    if (
      cdView.getUint8(pos) !== 0x50 ||
      cdView.getUint8(pos + 1) !== 0x4b ||
      cdView.getUint8(pos + 2) !== 0x01 ||
      cdView.getUint8(pos + 3) !== 0x02
    ) break;

    const compressionMethod = readUint16LE(cdView, pos + 10);
    const compressedSize = readUint32LE(cdView, pos + 20);
    const uncompressedSize = readUint32LE(cdView, pos + 24);
    const filenameLength = readUint16LE(cdView, pos + 28);
    const extraLength = readUint16LE(cdView, pos + 30);
    const commentLength = readUint16LE(cdView, pos + 32);
    const localHeaderOffset = readUint32LE(cdView, pos + 42);

    const filenameBytes = new Uint8Array(cdBuffer, pos + 46, filenameLength);
    const filename = new TextDecoder().decode(filenameBytes);

    entries.push({ filename, compressedSize, uncompressedSize, localHeaderOffset, compressionMethod });
    pos += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

async function decompressDeflate(data: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(new Uint8Array(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const result = await reader.read();
    if (result.done) done = true;
    else chunks.push(result.value);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8").decode(combined);
}

async function fetchZipFile(url: string, entry: ZipEntry): Promise<string> {
  const localHeaderBuffer = await fetchRange(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  const localHeaderView = new DataView(localHeaderBuffer);
  const localFilenameLength = readUint16LE(localHeaderView, 26);
  const localExtraLength = readUint16LE(localHeaderView, 28);
  const dataOffset = entry.localHeaderOffset + 30 + localFilenameLength + localExtraLength;

  const compressedBuffer = await fetchRange(url, dataOffset, dataOffset + entry.compressedSize - 1);

  if (entry.compressionMethod === 0) {
    return new TextDecoder("utf-8").decode(compressedBuffer);
  } else if (entry.compressionMethod === 8) {
    return decompressDeflate(compressedBuffer);
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }
}

// Batch insert helper to avoid SQLite limits
async function batchInsert<T>(
  items: T[],
  batchSize: number,
  insertFn: (batch: T[]) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await insertFn(batch);
  }
}

async function ingestDate(date: string, force = false): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Starting ingestion for ${date}`);

  // Check if already ingested
  if (!force) {
    const existing = await db
      .select()
      .from(ingestionLog)
      .where(eq(ingestionLog.date, date))
      .limit(1);

    if (existing.length > 0 && existing[0].status === "success") {
      console.log(`  ✓ Already ingested (${existing[0].productCount} products, ${existing[0].priceCount} prices). Use --force to re-ingest.`);
      return;
    }
  }

  const url = `https://api.cijene.dev/v0/archive/${date}.zip`;

  try {
    // Get file size
    console.log(`  → Fetching archive metadata...`);
    const headRes = await fetch(url, { method: "HEAD" });
    if (!headRes.ok) {
      throw new Error(`Archive not found for ${date}: ${headRes.status}`);
    }
    const contentLength = headRes.headers.get("content-length");
    if (!contentLength) throw new Error("Could not determine archive size");
    const fileSize = parseInt(contentLength, 10);
    console.log(`  → Archive size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

    // Get ZIP central directory
    console.log(`  → Reading ZIP directory...`);
    const entries = await getZipEntries(url, fileSize);
    const entryMap = new Map<string, ZipEntry>();
    for (const entry of entries) entryMap.set(entry.filename, entry);

    // Determine available chains
    const availableChains = new Set<string>();
    for (const entry of entries) {
      const parts = entry.filename.split("/");
      if (parts.length >= 2 && parts[1]) availableChains.add(parts[0]);
    }
    console.log(`  → Found ${availableChains.size} chains: ${[...availableChains].join(", ")}`);

    // Delete existing data for this date (for re-ingestion)
    if (force) {
      console.log(`  → Deleting existing data for ${date}...`);
      await db.delete(stores).where(eq(stores.date, date));
      await db.delete(products).where(eq(products.date, date));
      await db.delete(prices).where(eq(prices.date, date));
    }

    let totalStores = 0;
    let totalProducts = 0;
    let totalPrices = 0;

    // Process each chain
    const CONCURRENCY = 5;
    const chainList = [...availableChains];

    for (let i = 0; i < chainList.length; i += CONCURRENCY) {
      const batch = chainList.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (chain) => {
          try {
            // Fetch and insert stores
            const storesEntry = entryMap.get(`${chain}/stores.csv`);
            if (storesEntry) {
              const text = await fetchZipFile(url, storesEntry);
              const rows = parseCSVText(text);
              const storeRows = rows.map((r) => ({
                storeId: r.store_id || "",
                chain,
                type: r.type || "",
                address: r.address || "",
                city: r.city || "",
                zipcode: r.zipcode || "",
                date,
              }));
              if (storeRows.length > 0) {
                await batchInsert(storeRows, 500, async (b) => {
                  await db.insert(stores).values(b);
                });
                totalStores += storeRows.length;
              }
            }

            // Fetch and insert products
            const productsEntry = entryMap.get(`${chain}/products.csv`);
            if (productsEntry) {
              const text = await fetchZipFile(url, productsEntry);
              const rows = parseCSVText(text);
              const productRows = rows.map((r) => ({
                productId: r.product_id || "",
                barcode: r.barcode || "",
                name: r.name || "",
                brand: r.brand || "",
                category: r.category || "",
                unit: r.unit || "",
                quantity: r.quantity || "",
                chain,
                date,
              }));
              if (productRows.length > 0) {
                await batchInsert(productRows, 500, async (b) => {
                  await db.insert(products).values(b);
                });
                totalProducts += productRows.length;
              }
            }

            // Fetch and insert prices
            const pricesEntry = entryMap.get(`${chain}/prices.csv`);
            if (pricesEntry) {
              const text = await fetchZipFile(url, pricesEntry);
              const rows = parseCSVText(text);
              const priceRows = rows.map((r) => ({
                storeId: r.store_id || "",
                productId: r.product_id || "",
                chain,
                price: parseFloat(r.price) || 0,
                unitPrice: r.unit_price ? parseFloat(r.unit_price) : null,
                bestPrice30: r.best_price_30 ? parseFloat(r.best_price_30) : null,
                anchorPrice: r.anchor_price ? parseFloat(r.anchor_price) : null,
                specialPrice: r.special_price ? parseFloat(r.special_price) : null,
                date,
              }));
              if (priceRows.length > 0) {
                await batchInsert(priceRows, 500, async (b) => {
                  await db.insert(prices).values(b);
                });
                totalPrices += priceRows.length;
              }
            }

            console.log(`    ✓ ${chain}: stores/products/prices loaded`);
          } catch (err) {
            console.warn(`    ✗ ${chain}: ${err}`);
          }
        })
      );
    }

    // Log success
    await db
      .insert(ingestionLog)
      .values({
        date,
        storeCount: totalStores,
        productCount: totalProducts,
        priceCount: totalPrices,
        status: "success",
      })
      .onConflictDoUpdate({
        target: ingestionLog.date,
        set: {
          ingestedAt: new Date(),
          storeCount: totalStores,
          productCount: totalProducts,
          priceCount: totalPrices,
          status: "success",
          errorMessage: null,
        },
      });

    console.log(`  ✓ Done! Stores: ${totalStores}, Products: ${totalProducts}, Prices: ${totalPrices}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Ingestion failed: ${errorMessage}`);

    // Log failure
    await db
      .insert(ingestionLog)
      .values({
        date,
        storeCount: 0,
        productCount: 0,
        priceCount: 0,
        status: "error",
        errorMessage,
      })
      .onConflictDoUpdate({
        target: ingestionLog.date,
        set: {
          ingestedAt: new Date(),
          status: "error",
          errorMessage,
        },
      });

    throw err;
  }
}

// Main entry point
const args = process.argv.slice(2);
const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1] ||
  (args.includes("--date") ? args[args.indexOf("--date") + 1] : null);
const force = args.includes("--force");

let targetDate = dateArg || getTodayDate();

// If no specific date, try to get the most recent available date
if (!dateArg) {
  try {
    const archives = await fetchArchiveList();
    if (archives.length > 0) {
      targetDate = archives[0].date;
      console.log(`Using most recent available date: ${targetDate}`);
    }
  } catch {
    console.log(`Could not fetch archive list, using today: ${targetDate}`);
  }
}

await ingestDate(targetDate, force);
console.log("\nIngestion complete.");
