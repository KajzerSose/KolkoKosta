/**
 * db-queries.ts - Database query helpers for Kolko Kosta
 *
 * These functions query the SQLite database (populated by the ingest script).
 * They mirror the interface of cijene.ts but use the DB instead of ZIP range requests.
 */

import { db } from "@/db";
import { stores, products, prices, ingestionLog } from "@/db/schema";
import { eq, and, like, or, desc, sql } from "drizzle-orm";
import type { ProductWithPrices } from "./cijene";

/**
 * Check if data for a given date is available in the database.
 */
export async function isDateIngested(date: string): Promise<boolean> {
  const result = await db
    .select({ date: ingestionLog.date })
    .from(ingestionLog)
    .where(and(eq(ingestionLog.date, date), eq(ingestionLog.status, "success")))
    .limit(1);
  return result.length > 0;
}

/**
 * Get the most recent ingested date.
 */
export async function getLatestIngestedDate(): Promise<string | null> {
  const result = await db
    .select({ date: ingestionLog.date })
    .from(ingestionLog)
    .where(eq(ingestionLog.status, "success"))
    .orderBy(desc(ingestionLog.date))
    .limit(1);
  return result.length > 0 ? result[0].date : null;
}

/**
 * Search products in the database by name/brand/barcode, filtered by city.
 * Returns the same ProductWithPrices format as cijene.ts.
 */
export async function searchProductsFromDB(
  date: string,
  query: string,
  city?: string
): Promise<ProductWithPrices[]> {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  // Find matching products
  const matchingProducts = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.date, date),
        or(
          like(products.name, `%${normalizedQuery}%`),
          like(products.brand, `%${normalizedQuery}%`),
          eq(products.barcode, normalizedQuery)
        )
      )
    )
    .limit(500);

  if (matchingProducts.length === 0) return [];

  // Get unique chains from matching products
  const matchingChains = [...new Set(matchingProducts.map((p) => p.chain))];

  // Fetch stores for matching chains (filtered by city if provided)
  const storeQuery = db
    .select()
    .from(stores)
    .where(
      and(
        eq(stores.date, date),
        city
          ? and(
              sql`${stores.chain} IN (${sql.join(matchingChains.map((c) => sql`${c}`), sql`, `)})`,
              like(stores.city, `%${city}%`)
            )
          : sql`${stores.chain} IN (${sql.join(matchingChains.map((c) => sql`${c}`), sql`, `)})`
      )
    );

  const storeRows = await storeQuery;

  // Build store lookup map: "chain:store_id" -> store
  const storeMap = new Map<
    string,
    {
      store_id: string;
      type: string;
      address: string;
      city: string;
      zipcode: string;
      chain: string;
    }
  >();
  for (const s of storeRows) {
    storeMap.set(`${s.chain}:${s.storeId}`, {
      store_id: s.storeId,
      type: s.type,
      address: s.address,
      city: s.city,
      zipcode: s.zipcode,
      chain: s.chain,
    });
  }

  const cityStoreIds = new Set(storeMap.keys());

  // Get product IDs for matching products
  const productIds = matchingProducts.map((p) => p.productId);

  // Fetch prices for matching products in matching chains
  const priceRows = await db
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.date, date),
        sql`${prices.chain} IN (${sql.join(matchingChains.map((c) => sql`${c}`), sql`, `)})`,
        sql`${prices.productId} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`
      )
    );

  // Build price lookup: "chain:product_id" -> price[]
  const priceMap = new Map<string, typeof priceRows>();
  for (const p of priceRows) {
    const key = `${p.chain}:${p.productId}`;
    if (!priceMap.has(key)) priceMap.set(key, []);
    priceMap.get(key)!.push(p);
  }

  // Group by barcode to merge same products across chains
  const productsByBarcode = new Map<string, ProductWithPrices>();

  for (const product of matchingProducts) {
    const key = product.barcode || `${product.chain}:${product.productId}`;

    if (!productsByBarcode.has(key)) {
      productsByBarcode.set(key, {
        product: {
          product_id: product.productId,
          barcode: product.barcode,
          name: product.name || "Nepoznat proizvod",
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          quantity: product.quantity,
          chain: product.chain,
        },
        prices: [],
      });
    }

    const entry = productsByBarcode.get(key)!;
    const productPrices = priceMap.get(`${product.chain}:${product.productId}`) || [];

    for (const priceEntry of productPrices) {
      // Only include prices from city stores (if city filter is active)
      if (city && !cityStoreIds.has(`${priceEntry.chain}:${priceEntry.storeId}`)) {
        continue;
      }

      const store = storeMap.get(`${priceEntry.chain}:${priceEntry.storeId}`);
      if (store) {
        entry.prices.push({
          chain: product.chain,
          store,
          price: priceEntry.price,
          unit_price: priceEntry.unitPrice,
          best_price_30: priceEntry.bestPrice30,
          anchor_price: priceEntry.anchorPrice,
          special_price: priceEntry.specialPrice,
        });
      }
    }
  }

  return [...productsByBarcode.values()]
    .filter((p) => p.prices.length > 0)
    .sort((a, b) => b.prices.length - a.prices.length)
    .slice(0, 50);
}

/**
 * Get price history for a product (by barcode or name) across multiple dates.
 */
export async function getPriceHistoryFromDB(
  barcode: string | null,
  productName: string | null,
  city: string | null,
  chain: string | null,
  days: number
): Promise<
  {
    date: string;
    prices: { chain: string; minPrice: number; avgPrice: number }[];
  }[]
> {
  // Get available ingested dates (most recent first)
  const availableDates = await db
    .select({ date: ingestionLog.date })
    .from(ingestionLog)
    .where(eq(ingestionLog.status, "success"))
    .orderBy(desc(ingestionLog.date))
    .limit(days);

  if (availableDates.length === 0) return [];

  const dateList = availableDates.map((d) => d.date);

  const historyData: {
    date: string;
    prices: { chain: string; minPrice: number; avgPrice: number }[];
  }[] = [];

  for (const date of dateList) {
    // Find matching products for this date
    const matchingProducts = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.date, date),
          barcode
            ? eq(products.barcode, barcode)
            : like(products.name, `%${productName!.toLowerCase()}%`),
          chain ? eq(products.chain, chain) : undefined
        )
      )
      .limit(200);

    if (matchingProducts.length === 0) continue;

    // Get city store IDs if city filter is active
    let cityStoreIds: Set<string> | null = null;
    if (city) {
      const cityStoreRows = await db
        .select({ storeId: stores.storeId, chain: stores.chain })
        .from(stores)
        .where(and(eq(stores.date, date), like(stores.city, `%${city}%`)));
      cityStoreIds = new Set(cityStoreRows.map((s) => `${s.chain}:${s.storeId}`));
    }

    // Get prices for matching products
    const productIds = matchingProducts.map((p) => p.productId);
    const matchingChains = [...new Set(matchingProducts.map((p) => p.chain))];

    const priceRows = await db
      .select()
      .from(prices)
      .where(
        and(
          eq(prices.date, date),
          sql`${prices.chain} IN (${sql.join(matchingChains.map((c) => sql`${c}`), sql`, `)})`,
          sql`${prices.productId} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`
        )
      );

    // Group prices by chain
    const chainPrices = new Map<string, number[]>();
    for (const priceEntry of priceRows) {
      if (cityStoreIds && !cityStoreIds.has(`${priceEntry.chain}:${priceEntry.storeId}`)) {
        continue;
      }
      if (!chainPrices.has(priceEntry.chain)) chainPrices.set(priceEntry.chain, []);
      chainPrices.get(priceEntry.chain)!.push(priceEntry.price);
    }

    if (chainPrices.size === 0) continue;

    const chainSummary = [...chainPrices.entries()].map(([c, p]) => ({
      chain: c,
      minPrice: Math.min(...p),
      avgPrice: p.reduce((a, b) => a + b, 0) / p.length,
    }));

    historyData.push({ date, prices: chainSummary });
  }

  // Sort by date ascending
  return historyData.sort((a, b) => a.date.localeCompare(b.date));
}
