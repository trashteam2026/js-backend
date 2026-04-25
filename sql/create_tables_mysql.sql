-- AWS RDS / MySQL
-- Run this after connecting to your RDS instance

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL,
  username      VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) NOT NULL,
  firstname     VARCHAR(100) DEFAULT NULL,
  lastname      VARCHAR(100) DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY idx_firebase_uid (firebase_uid),
  UNIQUE KEY idx_username     (username),
  UNIQUE KEY idx_email        (email)
);

CREATE TABLE IF NOT EXISTS barcode_mappings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  barcode     VARCHAR(50) NOT NULL,
  custom_name VARCHAR(255) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY idx_barcode (barcode)
);

CREATE TABLE IF NOT EXISTS categories (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_group  VARCHAR(20) NOT NULL,
  display_order INT NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                TEXT NOT NULL,
  category_id         INT DEFAULT NULL,
  low_stock_threshold INT NOT NULL DEFAULT 10,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS item_batches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  item_id         INT NOT NULL,
  expiration_date DATE DEFAULT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_batches_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_inventory_batch_quantity CHECK (quantity >= 0)
);

ALTER TABLE items
ADD COLUMN IF NOT EXISTS barcode VARCHAR(50) DEFAULT NULL;

CREATE UNIQUE INDEX idx_items_barcode ON items (barcode);
CREATE UNIQUE INDEX idx_item_batches_item_expiration ON item_batches (item_id, expiration_date);
