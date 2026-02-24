/**
 * cijene.ts - Data fetching and parsing for Croatian supermarket prices
 * Uses the cijene-api ZIP archives from https://api.cijene.dev
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

// Parse CSV text into array of objects (simple, no external deps)
export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].trim().split(",");
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (handles basic cases)
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

// Fetch a specific CSV file from the ZIP archive using range requests
// The ZIP format stores files at specific offsets, but we can't easily do range requests
// Instead, we fetch individual chain CSV files via a proxy approach

// Fetch chain data from the ZIP archive
// We use a streaming approach to avoid loading the entire 80MB ZIP
export async function fetchChainData(
  date: string,
  chain: string
): Promise<{ stores: Store[]; products: Product[]; prices: Price[] }> {
  // We need to download the ZIP and extract specific files
  // Since the ZIP is large, we use JSZip but only in server context
  const JSZip = (await import("jszip")).default;

  const url = `https://api.cijene.dev/v0/archive/${date}.zip`;
  const res = await fetch(url, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch archive for ${date}: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const stores: Store[] = [];
  const products: Product[] = [];
  const prices: Price[] = [];

  // Parse stores
  const storesFile = zip.file(`${chain}/stores.csv`);
  if (storesFile) {
    const text = await storesFile.async("text");
    const rows = parseCSVText(text);
    stores.push(
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

  // Parse products
  const productsFile = zip.file(`${chain}/products.csv`);
  if (productsFile) {
    const text = await productsFile.async("text");
    const rows = parseCSVText(text);
    products.push(
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

  // Parse prices
  const pricesFile = zip.file(`${chain}/prices.csv`);
  if (pricesFile) {
    const text = await pricesFile.async("text");
    const rows = parseCSVText(text);
    prices.push(
      ...rows.map((r) => ({
        store_id: r.store_id || "",
        product_id: r.product_id || "",
        price: parseFloat(r.price) || 0,
        unit_price: r.unit_price ? parseFloat(r.unit_price) : null,
        best_price_30: r.best_price_30 ? parseFloat(r.best_price_30) : null,
        anchor_price: r.anchor_price ? parseFloat(r.anchor_price) : null,
        special_price: r.special_price ? parseFloat(r.special_price) : null,
        chain,
      }))
    );
  }

  return { stores, products, prices };
}

// Fetch data for all chains for a given date
export async function fetchDayData(
  date: string,
  chains?: string[]
): Promise<ArchiveData> {
  const JSZip = (await import("jszip")).default;

  const url = `https://api.cijene.dev/v0/archive/${date}.zip`;
  const res = await fetch(url, {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch archive for ${date}: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const allStores: Store[] = [];
  const allProducts: Product[] = [];
  const allPrices: Price[] = [];

  // Get list of chains in the archive
  const chainFolders = new Set<string>();
  zip.forEach((path) => {
    const parts = path.split("/");
    if (parts.length >= 2 && parts[1]) {
      chainFolders.add(parts[0]);
    }
  });

  const chainsToProcess = chains
    ? [...chainFolders].filter((c) => chains.includes(c))
    : [...chainFolders];

  for (const chain of chainsToProcess) {
    // Parse stores
    const storesFile = zip.file(`${chain}/stores.csv`);
    if (storesFile) {
      const text = await storesFile.async("text");
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

    // Parse products
    const productsFile = zip.file(`${chain}/products.csv`);
    if (productsFile) {
      const text = await productsFile.async("text");
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

    // Parse prices
    const pricesFile = zip.file(`${chain}/prices.csv`);
    if (pricesFile) {
      const text = await pricesFile.async("text");
      const rows = parseCSVText(text);
      allPrices.push(
        ...rows.map((r) => ({
          store_id: r.store_id || "",
          product_id: r.product_id || "",
          price: parseFloat(r.price) || 0,
          unit_price: r.unit_price ? parseFloat(r.unit_price) : null,
          best_price_30: r.best_price_30 ? parseFloat(r.best_price_30) : null,
          anchor_price: r.anchor_price ? parseFloat(r.anchor_price) : null,
          special_price: r.special_price ? parseFloat(r.special_price) : null,
          chain,
        }))
      );
    }
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
