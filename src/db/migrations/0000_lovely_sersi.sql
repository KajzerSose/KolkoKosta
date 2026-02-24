CREATE TABLE `ingestion_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`ingested_at` integer,
	`store_count` integer DEFAULT 0 NOT NULL,
	`product_count` integer DEFAULT 0 NOT NULL,
	`price_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingestion_log_date_unique` ON `ingestion_log` (`date`);--> statement-breakpoint
CREATE TABLE `prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`chain` text NOT NULL,
	`price` real NOT NULL,
	`unit_price` real,
	`best_price_30` real,
	`anchor_price` real,
	`special_price` real,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prices_chain_date_idx` ON `prices` (`chain`,`date`);--> statement-breakpoint
CREATE INDEX `prices_product_id_chain_date_idx` ON `prices` (`product_id`,`chain`,`date`);--> statement-breakpoint
CREATE INDEX `prices_store_id_chain_date_idx` ON `prices` (`store_id`,`chain`,`date`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`barcode` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`chain` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_chain_date_idx` ON `products` (`chain`,`date`);--> statement-breakpoint
CREATE INDEX `products_barcode_date_idx` ON `products` (`barcode`,`date`);--> statement-breakpoint
CREATE INDEX `products_name_date_idx` ON `products` (`name`,`date`);--> statement-breakpoint
CREATE INDEX `products_product_id_chain_date_idx` ON `products` (`product_id`,`chain`,`date`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`chain` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`zipcode` text DEFAULT '' NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stores_chain_date_idx` ON `stores` (`chain`,`date`);--> statement-breakpoint
CREATE INDEX `stores_city_idx` ON `stores` (`city`);--> statement-breakpoint
CREATE INDEX `stores_store_id_chain_date_idx` ON `stores` (`store_id`,`chain`,`date`);