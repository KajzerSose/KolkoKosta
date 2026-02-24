import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Stores table - supermarket store locations
 */
export const stores = sqliteTable(
  "stores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    chain: text("chain").notNull(),
    type: text("type").notNull().default(""),
    address: text("address").notNull().default(""),
    city: text("city").notNull().default(""),
    zipcode: text("zipcode").notNull().default(""),
    date: text("date").notNull(), // YYYY-MM-DD
  },
  (t) => [
    index("stores_chain_date_idx").on(t.chain, t.date),
    index("stores_city_idx").on(t.city),
    index("stores_store_id_chain_date_idx").on(t.storeId, t.chain, t.date),
  ]
);

/**
 * Products table - product catalog per chain
 */
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    barcode: text("barcode").notNull().default(""),
    name: text("name").notNull(),
    brand: text("brand").notNull().default(""),
    category: text("category").notNull().default(""),
    unit: text("unit").notNull().default(""),
    quantity: text("quantity").notNull().default(""),
    chain: text("chain").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
  },
  (t) => [
    index("products_chain_date_idx").on(t.chain, t.date),
    index("products_barcode_date_idx").on(t.barcode, t.date),
    index("products_name_date_idx").on(t.name, t.date),
    index("products_product_id_chain_date_idx").on(t.productId, t.chain, t.date),
  ]
);

/**
 * Prices table - daily prices per product per store
 */
export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    chain: text("chain").notNull(),
    price: real("price").notNull(),
    unitPrice: real("unit_price"),
    bestPrice30: real("best_price_30"),
    anchorPrice: real("anchor_price"),
    specialPrice: real("special_price"),
    date: text("date").notNull(), // YYYY-MM-DD
  },
  (t) => [
    index("prices_chain_date_idx").on(t.chain, t.date),
    index("prices_product_id_chain_date_idx").on(t.productId, t.chain, t.date),
    index("prices_store_id_chain_date_idx").on(t.storeId, t.chain, t.date),
  ]
);

/**
 * Ingestion log - tracks which dates have been loaded into the DB
 */
export const ingestionLog = sqliteTable("ingestion_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  ingestedAt: integer("ingested_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  storeCount: integer("store_count").notNull().default(0),
  productCount: integer("product_count").notNull().default(0),
  priceCount: integer("price_count").notNull().default(0),
  status: text("status").notNull().default("success"), // 'success' | 'error'
  errorMessage: text("error_message"),
});
