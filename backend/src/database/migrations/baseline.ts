// Frozen schema snapshot. Do not derive historical migrations from live models.
export const baseline = [
  {
    "table": "commerces",
    "create": "CREATE TABLE IF NOT EXISTS `commerces` (`id` CHAR(36) BINARY , `name` VARCHAR(120) NOT NULL, `slug` VARCHAR(120) NOT NULL UNIQUE, `active` TINYINT(1) NOT NULL DEFAULT true, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB;",
    "indexes": []
  },
  {
    "table": "users",
    "create": "CREATE TABLE IF NOT EXISTS `users` (`id` CHAR(36) BINARY , `commerce_id` CHAR(36) BINARY, `email` VARCHAR(190) NOT NULL UNIQUE, `password_hash` VARCHAR(100) NOT NULL, `name` VARCHAR(120) NOT NULL, `role` ENUM('superadmin', 'admin', 'operator', 'customer') NOT NULL, `active` TINYINT(1) NOT NULL DEFAULT true, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`commerce_id`) REFERENCES `commerces` (`id`) ON DELETE SET NULL ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": []
  },
  {
    "table": "sessions",
    "create": "CREATE TABLE IF NOT EXISTS `sessions` (`id` CHAR(36) BINARY , `user_id` CHAR(36) BINARY NOT NULL, `expires_at` DATETIME NOT NULL, `revoked_at` DATETIME, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": []
  },
  {
    "table": "categories",
    "create": "CREATE TABLE IF NOT EXISTS `categories` (`id` CHAR(36) BINARY , `commerce_id` CHAR(36) BINARY NOT NULL, `name` VARCHAR(120) NOT NULL, `description` VARCHAR(255), `active` TINYINT(1) NOT NULL DEFAULT true, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`commerce_id`) REFERENCES `commerces` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": [
      "ALTER TABLE `categories` ADD UNIQUE INDEX `uq_categories_commerce_name` (`commerce_id`, `name`)"
    ]
  },
  {
    "table": "products",
    "create": "CREATE TABLE IF NOT EXISTS `products` (`id` CHAR(36) BINARY , `commerce_id` CHAR(36) BINARY NOT NULL, `category_id` CHAR(36) BINARY, `sku` VARCHAR(80) NOT NULL, `name` VARCHAR(160) NOT NULL, `description` TEXT, `brand` VARCHAR(120), `price` DECIMAL(14,2) NOT NULL DEFAULT 0, `cost` DECIMAL(14,2), `offer_price` DECIMAL(14,2), `current_stock` INTEGER NOT NULL DEFAULT 0, `minimum_stock` INTEGER NOT NULL DEFAULT 0, `image_url` VARCHAR(500), `image_data` MEDIUMBLOB, `image_mime_type` VARCHAR(60), `published` TINYINT(1) NOT NULL DEFAULT true, `featured` TINYINT(1) NOT NULL DEFAULT false, `active` TINYINT(1) NOT NULL DEFAULT true, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`commerce_id`) REFERENCES `commerces` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": [
      "ALTER TABLE `products` ADD UNIQUE INDEX `uq_products_commerce_sku` (`commerce_id`, `sku`)",
      "ALTER TABLE `products` ADD INDEX `ix_products_commerce_category` (`commerce_id`, `category_id`)"
    ]
  },
  {
    "table": "stock_movements",
    "create": "CREATE TABLE IF NOT EXISTS `stock_movements` (`id` CHAR(36) BINARY , `commerce_id` CHAR(36) BINARY NOT NULL, `product_id` CHAR(36) BINARY NOT NULL, `user_id` CHAR(36) BINARY, `type` ENUM('initial', 'adjustment', 'sale', 'return', 'reservation', 'release') NOT NULL DEFAULT 'adjustment', `previous_stock` INTEGER NOT NULL, `quantity_change` INTEGER NOT NULL, `new_stock` INTEGER NOT NULL, `reason` VARCHAR(255), `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": [
      "ALTER TABLE `stock_movements` ADD INDEX `ix_stock_movements_product_created` (`commerce_id`, `product_id`, `created_at`)"
    ]
  },
  {
    "table": "orders",
    "create": "CREATE TABLE IF NOT EXISTS `orders` (`id` CHAR(36) BINARY , `checkout_key` VARCHAR(64), `checkout_hash` VARCHAR(64), `reservation_expires_at` DATETIME, `reservation_checked_at` DATETIME, `payment_review_required` TINYINT(1) NOT NULL DEFAULT false, `commerce_id` CHAR(36) BINARY NOT NULL, `order_number` VARCHAR(40) NOT NULL UNIQUE, `status` ENUM('pending', 'pending_payment', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending_payment', `payment_status` ENUM('pending', 'paid', 'rejected', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending', `mp_order_id` VARCHAR(100), `mp_checkout_url` VARCHAR(1000), `paid_at` DATETIME, `customer_name` VARCHAR(160) NOT NULL, `customer_email` VARCHAR(190) NOT NULL, `customer_phone` VARCHAR(60) NOT NULL, `delivery_method` ENUM('pickup', 'shipping') NOT NULL, `address` VARCHAR(300), `notes` VARCHAR(500), `subtotal` DECIMAL(14,2) NOT NULL, `total` DECIMAL(14,2) NOT NULL, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, UNIQUE `uq_orders_checkout_key` (`checkout_key`), PRIMARY KEY (`id`), FOREIGN KEY (`commerce_id`) REFERENCES `commerces` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": [
      "ALTER TABLE `orders` ADD INDEX `ix_orders_commerce_created` (`commerce_id`, `created_at`)",
      "ALTER TABLE `orders` ADD INDEX `ix_orders_commerce_status` (`commerce_id`, `status`)"
    ]
  },
  {
    "table": "order_items",
    "create": "CREATE TABLE IF NOT EXISTS `order_items` (`id` CHAR(36) BINARY , `order_id` CHAR(36) BINARY NOT NULL, `product_id` CHAR(36) BINARY NOT NULL, `sku` VARCHAR(80) NOT NULL, `product_name` VARCHAR(160) NOT NULL, `unit_price` DECIMAL(14,2) NOT NULL, `quantity` INTEGER NOT NULL, `line_total` DECIMAL(14,2) NOT NULL, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB;",
    "indexes": [
      "ALTER TABLE `order_items` ADD INDEX `ix_order_items_order` (`order_id`)",
      "ALTER TABLE `order_items` ADD INDEX `ix_order_items_product` (`product_id`)"
    ]
  }
];
