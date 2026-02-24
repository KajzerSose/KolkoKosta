/**
 * cijene.ts - Data fetching and parsing for Croatian supermarket prices
 * Uses the cijene-api ZIP archives from https://api.cijene.dev
 * Uses HTTP range requests to avoid downloading the full ~83MB ZIP
 */

export const CHAINS = [
  "konzum",
  "spar",
  "studenac",
  "plodine",
  "lidl",
  "tommy",
  "kaufland",
  "eurospin",
  "dm",
  "ktc",
  "metro",
  "trgocentar",
  "vrutak",
  "ribola",
  "ntl",
  "roto",
  "boso",
  "brodokomerc",
  "jadranka_trgovina",
  "trgovina-krk",
] as const;

export type ChainCode = (typeof CHAINS)[number];

export const CHAIN_DISPLAY_NAMES: Record<string, string> = {
  konzum: "Konzum",
  spar: "Spar",
  studenac: "Studenac",
  plodine: "Plodine",
  lidl: "Lidl",
  tommy: "Tommy",
  kaufland: "Kaufland",
  eurospin: "Eurospin",
  dm: "dm",
  ktc: "KTC",
  metro: "Metro",
  trgocentar: "Trgocentar",
  vrutak: "Vrutak",
  ribola: "Ribola",
  ntl: "NTL",
  roto: "Roto",
  boso: "Boso",
  brodokomerc: "Brodokomerc",
  jadranka_trgovina: "Jadranka Trgovina",
  "trgovina-krk": "Trgovina Krk",
};

export const CHAIN_COLORS: Record<string, string> = {
  konzum: "#e31e24",
  spar: "#009a44",
  studenac: "#f7941d",
  plodine: "#0066b3",
  lidl: "#0050aa",
  tommy: "#e30613",
  kaufland: "#e30613",
  eurospin: "#ffcc00",
  dm: "#d40511",
  ktc: "#004b8d",
  metro: "#003f8a",
  trgocentar: "#00843d",
  vrutak: "#2e7d32",
  ribola: "#1565c0",
  ntl: "#6a1b9a",
  roto: "#e65100",
  boso: "#37474f",
  brodokomerc: "#00695c",
  jadranka_trgovina: "#0277bd",
  "trgovina-krk": "#558b2f",
};

export interface Store {
  store_id: string;
  type: string;
  address: string;
  city: string;
  zipcode: string;
  chain: string;
}

export interface Product {
  product_id: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  quantity: string;
  chain: string;
}

export interface Price {
  store_id: string;
  product_id: string;
  price: number;
  unit_price: number | null;
  best_price_30: number | null;
  anchor_price: number | null;
  special_price: number | null;
  chain: string;
}

export interface ProductWithPrices {
  product: Product;
  prices: {
    chain: string;
    store: Store;
    price: number;
    unit_price: number | null;
    best_price_30: number | null;
    anchor_price: number | null;
    special_price: number | null;
  }[];
}

export interface ArchiveData {
  stores: Store[];
  products: Product[];
  prices: Price[];
  date: string;
}

export interface ArchiveInfo {
  date: string;
  url: string;
  size: number;
  updated: string;
}

// ZIP central directory entry
interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressionMethod: number;
}

// Fetch list of available archives
export async function fetchArchiveList(): Promise<ArchiveInfo[]> {
  const res = await fetch("https://api.cijene.dev/v0/list", {
    next: { revalidate: 3600 }, // Cache for 1 hour
  });
  if (!res.ok) throw new Error("Failed to fetch archive list");
  const data = await res.json();
  return data.archives;
}

// Get today's date in YYYY-MM-DD format (Croatian timezone)
export function getTodayDate(): string {
  const now = new Date();
  // Croatia is UTC+1 (CET) or UTC+2 (CEST)
  const croatiaOffset = 1; // Use CET as default
  const croatiaTime = new Date(now.getTime() + croatiaOffset * 60 * 60 * 1000);
  return croatiaTime.toISOString().split("T")[0];
}

// Parse CSV text into array of objects
export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].trim().split(",");
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = (values[idx] || "").trim();
    });
    results.push(row);
  }

  return results;
}

// Read a range of bytes from a URL
async function fetchRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Range request failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

// Read a 32-bit little-endian integer from a DataView
function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

// Read a 16-bit little-endian integer from a DataView
function readUint16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

// Parse the ZIP central directory to get file entries
async function getZipEntries(url: string, fileSize: number): Promise<ZipEntry[]> {
  // Step 1: Read the last 65KB to find the End of Central Directory (EOCD)
  const tailSize = Math.min(65536 + 22, fileSize);
  const tailStart = fileSize - tailSize;
  const tailBuffer = await fetchRange(url, tailStart, fileSize - 1);
  const tailView = new DataView(tailBuffer);

  // Find EOCD signature: 0x06054b50
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

  if (eocdOffset === -1) {
    throw new Error("Could not find ZIP End of Central Directory");
  }

  const cdSize = readUint32LE(tailView, eocdOffset + 12);
  const cdOffset = readUint32LE(tailView, eocdOffset + 16);

  // Step 2: Fetch the central directory
  const cdBuffer = await fetchRange(url, cdOffset, cdOffset + cdSize - 1);
  const cdView = new DataView(cdBuffer);

  const entries: ZipEntry[] = [];
  let pos = 0;

  while (pos < cdBuffer.byteLength - 4) {
    // Check for central directory file header signature: 0x02014b50
    if (
      cdView.getUint8(pos) !== 0x50 ||
      cdView.getUint8(pos + 1) !== 0x4b ||
      cdView.getUint8(pos + 2) !== 0x01 ||
      cdView.getUint8(pos + 3) !== 0x02
    ) {
      break;
    }

    const compressionMethod = readUint16LE(cdView, pos + 10);
    const compressedSize = readUint32LE(cdView, pos + 20);
    const uncompressedSize = readUint32LE(cdView, pos + 24);
    const filenameLength = readUint16LE(cdView, pos + 28);
    const extraLength = readUint16LE(cdView, pos + 30);
    const commentLength = readUint16LE(cdView, pos + 32);
    const localHeaderOffset = readUint32LE(cdView, pos + 42);

    const filenameBytes = new Uint8Array(cdBuffer, pos + 46, filenameLength);
    const filename = new TextDecoder().decode(filenameBytes);

    entries.push({
      filename,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      compressionMethod,
    });

    pos += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

// Decompress deflate data
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
    if (result.done) {
      done = true;
    } else {
      chunks.push(result.value);
    }
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

// Fetch a specific file from a ZIP archive using range requests
async function fetchZipFile(
  url: string,
  entry: ZipEntry
): Promise<string> {
  // Read the local file header to find the actual data offset
  // Local header: signature(4) + version(2) + flags(2) + compression(2) + modtime(2) + moddate(2)
  //               + crc32(4) + compressedSize(4) + uncompressedSize(4) + filenameLen(2) + extraLen(2) = 30 bytes
  const localHeaderBuffer = await fetchRange(
    url,
    entry.localHeaderOffset,
    entry.localHeaderOffset + 29
  );
  const localHeaderView = new DataView(localHeaderBuffer);
  const localFilenameLength = readUint16LE(localHeaderView, 26);
  const localExtraLength = readUint16LE(localHeaderView, 28);
  const dataOffset =
    entry.localHeaderOffset + 30 + localFilenameLength + localExtraLength;

  // Fetch the compressed data
  const compressedBuffer = await fetchRange(
    url,
    dataOffset,
    dataOffset + entry.compressedSize - 1
  );

  // Decompress
  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return new TextDecoder("utf-8").decode(compressedBuffer);
  } else if (entry.compressionMethod === 8) {
    // Deflate
    return decompressDeflate(compressedBuffer);
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }
}

// Cache for ZIP entries (in-memory, per process)
const zipEntriesCache = new Map<string, { entries: ZipEntry[]; size: number }>();

// Get ZIP entries with caching
async function getCachedZipEntries(url: string, fileSize: number): Promise<ZipEntry[]> {
  const cached = zipEntriesCache.get(url);
  if (cached && cached.size === fileSize) {
    return cached.entries;
  }
  const entries = await getZipEntries(url, fileSize);
  zipEntriesCache.set(url, { entries, size: fileSize });
  return entries;
}

// Get ZIP entry map and available chains for a date
async function getZipInfo(date: string): Promise<{
  url: string;
  entryMap: Map<string, ZipEntry>;
  availableChains: string[];
}> {
  const url = `https://api.cijene.dev/v0/archive/${date}.zip`;

  // Get file size via HEAD request
  const headRes = await fetch(url, { method: "HEAD" });
  if (!headRes.ok) {
    throw new Error(`Archive not found for ${date}: ${headRes.status}`);
  }
  const contentLength = headRes.headers.get("content-length");
  if (!contentLength) {
    throw new Error("Could not determine archive size");
  }
  const fileSize = parseInt(contentLength, 10);

  // Get ZIP central directory entries
  const entries = await getCachedZipEntries(url, fileSize);

  // Build a map of filename -> entry
  const entryMap = new Map<string, ZipEntry>();
  for (const entry of entries) {
    entryMap.set(entry.filename, entry);
  }

  // Determine available chains
  const availableChains = new Set<string>();
  for (const entry of entries) {
    const parts = entry.filename.split("/");
    if (parts.length >= 2 && parts[1]) {
      availableChains.add(parts[0]);
    }
  }

  return { url, entryMap, availableChains: [...availableChains] };
}

// Efficient search: first fetch products only, then fetch prices/stores for matching chains
export async function searchProductsEfficient(
  date: string,
  query: string,
  city?: string
): Promise<ProductWithPrices[]> {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const { url, entryMap, availableChains } = await getZipInfo(date);

  // Step 1: Fetch products.csv for all chains in parallel
  const CONCURRENCY = 8;
  const allProducts: Product[] = [];

  for (let i = 0; i < availableChains.length; i += CONCURRENCY) {
    const batch = availableChains.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (chain) => {
        const productsEntry = entryMap.get(`${chain}/products.csv`);
        if (!productsEntry) return [];
        try {
          const text = await fetchZipFile(url, productsEntry);
          const rows = parseCSVText(text);
          return rows.map((r) => ({
            product_id: r.product_id || "",
            barcode: r.barcode || "",
            name: r.name || "",
            brand: r.brand || "",
            category: r.category || "",
            unit: r.unit || "",
            quantity: r.quantity || "",
            chain,
          }));
        } catch (err) {
          console.warn(`Failed to fetch products for chain ${chain}:`, err);
          return [];
        }
      })
    );
    for (const products of results) {
      allProducts.push(...products);
    }
  }

  // Step 2: Find matching products
  const matchingProducts = allProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(normalizedQuery) ||
      p.brand.toLowerCase().includes(normalizedQuery) ||
      p.barcode === normalizedQuery
  );

  if (matchingProducts.length === 0) return [];

  // Step 3: Determine which chains have matching products
  const matchingChains = new Set(matchingProducts.map((p) => p.chain));

  // Step 4: Fetch stores and prices only for matching chains
  const allStores: Store[] = [];
  const allPrices: Price[] = [];

  const matchingChainList = [...matchingChains];
  for (let i = 0; i < matchingChainList.length; i += CONCURRENCY) {
    const batch = matchingChainList.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (chain) => {
        try {
          // Fetch stores
          const storesEntry = entryMap.get(`${chain}/stores.csv`);
          if (storesEntry) {
            const text = await fetchZipFile(url, storesEntry);
            const rows = parseCSVText(text);
            allStores.push(
              ...rows.map((r) => ({
                store_id: r.store_id || "",
                type: r.type || "",
                address: r.address || "",
                city: r.city || "",
                zipcode: r.zipcode || "",
                chain,
              }))
            );
          }

          // Fetch prices
          const pricesEntry = entryMap.get(`${chain}/prices.csv`);
          if (pricesEntry) {
            const text = await fetchZipFile(url, pricesEntry);
            const rows = parseCSVText(text);
            allPrices.push(
              ...rows.map((r) => ({
                store_id: r.store_id || "",
                product_id: r.product_id || "",
                price: parseFloat(r.price) || 0,
                unit_price: r.unit_price ? parseFloat(r.unit_price) : null,
                best_price_30: r.best_price_30
                  ? parseFloat(r.best_price_30)
                  : null,
                anchor_price: r.anchor_price
                  ? parseFloat(r.anchor_price)
                  : null,
                special_price: r.special_price
                  ? parseFloat(r.special_price)
                  : null,
                chain,
              }))
            );
          }
        } catch (err) {
          console.warn(`Failed to fetch data for chain ${chain}:`, err);
        }
      })
    );
  }

  // Step 5: Build result using searchProducts logic
  const data: ArchiveData = {
    stores: allStores,
    products: allProducts,
    prices: allPrices,
    date,
  };

  return searchProducts(data, query, city);
}

// Fetch data for all chains for a given date using range requests
export async function fetchDayData(
  date: string,
  chains?: string[]
): Promise<ArchiveData> {
  const { url, entryMap, availableChains } = await getZipInfo(date);

  const chainsToProcess = chains
    ? availableChains.filter((c) => chains.includes(c))
    : availableChains;

  const allStores: Store[] = [];
  const allProducts: Product[] = [];
  const allPrices: Price[] = [];

  // Process chains in parallel (limit concurrency to avoid overwhelming the server)
  const CONCURRENCY = 5;
  for (let i = 0; i < chainsToProcess.length; i += CONCURRENCY) {
    const batch = chainsToProcess.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (chain) => {
        try {
          // Fetch stores
          const storesEntry = entryMap.get(`${chain}/stores.csv`);
          if (storesEntry) {
            const text = await fetchZipFile(url, storesEntry);
            const rows = parseCSVText(text);
            allStores.push(
              ...rows.map((r) => ({
                store_id: r.store_id || "",
                type: r.type || "",
                address: r.address || "",
                city: r.city || "",
                zipcode: r.zipcode || "",
                chain,
              }))
            );
          }

          // Fetch products
          const productsEntry = entryMap.get(`${chain}/products.csv`);
          if (productsEntry) {
            const text = await fetchZipFile(url, productsEntry);
            const rows = parseCSVText(text);
            allProducts.push(
              ...rows.map((r) => ({
                product_id: r.product_id || "",
                barcode: r.barcode || "",
                name: r.name || "",
                brand: r.brand || "",
                category: r.category || "",
                unit: r.unit || "",
                quantity: r.quantity || "",
                chain,
              }))
            );
          }

          // Fetch prices
          const pricesEntry = entryMap.get(`${chain}/prices.csv`);
          if (pricesEntry) {
            const text = await fetchZipFile(url, pricesEntry);
            const rows = parseCSVText(text);
            allPrices.push(
              ...rows.map((r) => ({
                store_id: r.store_id || "",
                product_id: r.product_id || "",
                price: parseFloat(r.price) || 0,
                unit_price: r.unit_price ? parseFloat(r.unit_price) : null,
                best_price_30: r.best_price_30
                  ? parseFloat(r.best_price_30)
                  : null,
                anchor_price: r.anchor_price
                  ? parseFloat(r.anchor_price)
                  : null,
                special_price: r.special_price
                  ? parseFloat(r.special_price)
                  : null,
                chain,
              }))
            );
          }
        } catch (err) {
          console.warn(`Failed to fetch data for chain ${chain}:`, err);
        }
      })
    );
  }

  return { stores: allStores, products: allProducts, prices: allPrices, date };
}

// Search products by name across all chains for a specific city
export function searchProducts(
  data: ArchiveData,
  query: string,
  city?: string
): ProductWithPrices[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  // Filter stores by city
  const cityStores = city
    ? data.stores.filter((s) =>
        s.city.toLowerCase().includes(city.toLowerCase())
      )
    : data.stores;

  const cityStoreIds = new Set(
    cityStores.map((s) => `${s.chain}:${s.store_id}`)
  );

  // Find matching products
  const matchingProducts = data.products.filter(
    (p) =>
      p.name.toLowerCase().includes(normalizedQuery) ||
      p.brand.toLowerCase().includes(normalizedQuery) ||
      p.barcode === normalizedQuery
  );

  // Group by barcode to merge same products across chains
  const productsByBarcode = new Map<string, ProductWithPrices>();

  for (const product of matchingProducts) {
    const key = product.barcode || `${product.chain}:${product.product_id}`;

    if (!productsByBarcode.has(key)) {
      productsByBarcode.set(key, {
        product: {
          ...product,
          name: product.name || "Nepoznat proizvod",
        },
        prices: [],
      });
    }

    const entry = productsByBarcode.get(key)!;

    // Find prices for this product in city stores
    const productPrices = data.prices.filter(
      (p) =>
        p.chain === product.chain &&
        p.product_id === product.product_id &&
        (city ? cityStoreIds.has(`${p.chain}:${p.store_id}`) : true)
    );

    for (const priceEntry of productPrices) {
      const store = data.stores.find(
        (s) => s.chain === product.chain && s.store_id === priceEntry.store_id
      );
      if (store) {
        entry.prices.push({
          chain: product.chain,
          store,
          price: priceEntry.price,
          unit_price: priceEntry.unit_price,
          best_price_30: priceEntry.best_price_30,
          anchor_price: priceEntry.anchor_price,
          special_price: priceEntry.special_price,
        });
      }
    }
  }

  // Sort by number of stores carrying the product (most common first)
  return [...productsByBarcode.values()]
    .filter((p) => p.prices.length > 0)
    .sort((a, b) => b.prices.length - a.prices.length)
    .slice(0, 50);
}

// Get unique cities from store data
export function getCities(stores: Store[]): string[] {
  const cities = new Set(stores.map((s) => s.city).filter(Boolean));
  return [...cities].sort((a, b) => a.localeCompare(b, "hr"));
}

// Get price summary for a product across chains in a city
export function getPriceSummary(
  productWithPrices: ProductWithPrices,
  city?: string
) {
  const filteredPrices = city
    ? productWithPrices.prices.filter((p) =>
        p.store.city.toLowerCase().includes(city.toLowerCase())
      )
    : productWithPrices.prices;

  if (filteredPrices.length === 0) return null;

  // Group by chain and get min price per chain
  const byChain = new Map<
    string,
    {
      chain: string;
      minPrice: number;
      maxPrice: number;
      avgPrice: number;
      storeCount: number;
    }
  >();

  for (const p of filteredPrices) {
    if (!byChain.has(p.chain)) {
      byChain.set(p.chain, {
        chain: p.chain,
        minPrice: p.price,
        maxPrice: p.price,
        avgPrice: p.price,
        storeCount: 1,
      });
    } else {
      const entry = byChain.get(p.chain)!;
      entry.minPrice = Math.min(entry.minPrice, p.price);
      entry.maxPrice = Math.max(entry.maxPrice, p.price);
      entry.avgPrice =
        (entry.avgPrice * entry.storeCount + p.price) / (entry.storeCount + 1);
      entry.storeCount++;
    }
  }

  const chainPrices = [...byChain.values()].sort(
    (a, b) => a.minPrice - b.minPrice
  );
  const allPrices = filteredPrices.map((p) => p.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  return {
    chainPrices,
    minPrice,
    maxPrice,
    cheapestChain: chainPrices[0]?.chain,
    priceDiff:
      chainPrices.length > 1
        ? ((chainPrices[chainPrices.length - 1].minPrice -
            chainPrices[0].minPrice) /
            chainPrices[0].minPrice) *
          100
        : 0,
  };
}
