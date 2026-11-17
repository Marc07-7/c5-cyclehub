-- C5 CycleHub: TiDB Cloud migration
-- Source: local MySQL 8.4.3 export
-- Target database: c5_cyclehub
--
-- IMPORTANT:
-- 1. Select the c5-cyclehub-db TiDB instance and use the SQL Editor.
-- 2. Run this script only against a NEW/EMPTY c5_cyclehub database.
-- 3. This script preserves user accounts, products, categories, orders,
--    order items, messages, and notifications.
-- 4. Old browser push subscriptions and old local login sessions are
--    intentionally NOT imported. Users should sign in again and browsers
--    should register new push subscriptions.
-- 5. Do not run this file a second time over populated tables.

SET NAMES utf8mb4;
USE `c5_cyclehub`;
SET FOREIGN_KEY_CHECKS = 0;

-- Dumping structure for table c5_cyclehub.categories
CREATE TABLE IF NOT EXISTS `categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `description` text,
  `is_archived` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.categories: ~3 rows (approximately)
INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `is_archived`, `created_at`) VALUES
	(1, 'Bicycles', 'bicycles', 'Complete bicycles and bike builds', 0, '2026-11-07 22:34:04'),
	(2, 'Parts', 'parts', 'Replacement and upgrade components', 0, '2026-11-07 22:34:04'),
	(3, 'Accessories', 'accessories', 'Cycling accessories and essentials', 0, '2026-11-07 22:34:04');

-- Dumping structure for table c5_cyclehub.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('customer','admin') NOT NULL DEFAULT 'customer',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.users: ~3 rows (approximately)
INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `is_active`, `created_at`) VALUES
	(1, 'Marc Stephen', 'stephenmarc849@gmail.com', '$2y$10$4Lx/cfhVCLWXZMCDhwuIcuKHVh6gqa6muwDOo4juCs1gZjQsKzvqO', 'admin', 1, '2026-11-07 22:47:26'),
	(2, 'Neri', 'neri@gmail.com', '$2y$10$2pam1X36tGF.wsxmWzJ/juG8omhan2QJ1tKToXfCVvTXOH4EW4zUO', 'customer', 1, '2026-11-07 23:13:19'),
	(3, 'Pheus', 'peyo@gmail.com', '$2a$12$EySxDFqFBfGL3GRlTzG.2uCtgRODHfCicB8hXi3Aav.wHZdvkkNTG', 'customer', 1, '2026-11-08 09:09:09'),
	(4, 'lawrence', 'lawrence@gmail.com', '$2a$12$gshd4O6p0Q6BmqPJ8aNfDerr7Lo2ldMJnd5ld1yr6G6SXxNXgaLpi', 'customer', 1, '2026-11-16 14:10:16');

-- Dumping structure for table c5_cyclehub.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category_id` int unsigned DEFAULT NULL,
  `name` varchar(180) NOT NULL,
  `slug` varchar(200) NOT NULL,
  `description` text,
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `stock` int NOT NULL DEFAULT '0',
  `image_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_archived` tinyint(1) NOT NULL DEFAULT '0',
  `archived_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_products_category` (`category_id`),
  KEY `idx_products_active` (`is_active`,`is_archived`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.products: ~14 rows (approximately)
INSERT INTO `products` (`id`, `category_id`, `name`, `slug`, `description`, `price`, `stock`, `image_url`, `is_active`, `is_archived`, `archived_at`, `created_at`, `updated_at`) VALUES
	(1, 1, 'Mountain Bike 29er', 'mountain-bike-29er', '29-inch mountain bike for trail and road cycling.', 13000.00, 7, '', 1, 0, NULL, '2026-11-07 22:55:56', '2026-11-16 13:23:38'),
	(2, 1, 'COGIS GT600 27.5-inch Mountain Bike', 'cogis-gt600-27-5-inch-mountain-bike', 'A versatile 27.5-inch hardtail mountain bike with an aluminum frame, front suspension, and multi-speed drivetrain. Great for everyday rides and light trails.', 26000.00, 0, 'https://supremebikes.ph/cdn/shop/files/COGIS-GT600-275-ALUALLOY-2-11S-WHT-0W.jpg?v=1752560099&width=900', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-10 07:07:06'),
	(3, 1, 'Giant TCR Advanced 2 KOM Road Bike', 'giant-tcr-advanced-2-kom-road-bike', 'Lightweight performance road bike with a race-inspired riding position and responsive handling for paved roads and long-distance rides.', 130500.00, 1, 'https://supremebikes.ph/cdn/shop/files/GIANT-TCRADV2KOM-2026-CPRBLU-XS-0W.jpg?v=1759822352&width=900', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-16 11:44:27'),
	(4, 1, 'GT Sensor Comp Full-Suspension MTB', 'gt-sensor-comp-mtb', 'Trail-ready full-suspension mountain bike designed for confident handling on rough terrain and technical descents.', 145000.00, 0, 'https://supremebikes.ph/cdn/shop/files/GTBIKES-SENSORCOMP-MBLK-0W.jpg?v=1788321802&width=900', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-15 21:50:22'),
	(5, 3, 'RNOX Trail Cycling Helmet', 'rnox-trail-cycling-helmet', 'Ventilated protective cycling helmet with an adjustable fit for daily road and trail rides.', 2490.00, 9, 'https://static.evolution24.media/clients/client_114/detailaufnahme-moderne-mtb-ausrustung-und-protektoren-frische-farben-outdoor-setting-fokus-auf_38d3c2f6dd594fcf4e807730de6fc8c1.webp', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-16 11:58:42'),
	(6, 3, 'RockBros Front and Rear LED Light Set', 'rockbros-front-rear-led-light-set', 'USB-rechargeable front and rear safety lights to improve visibility during early morning and evening rides.', 1290.00, 16, 'https://d2j6dbq0eux0bg.cloudfront.net/images/64403859/2591156465.jpg', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-16 11:58:42'),
	(7, 3, 'Giyo Anti-Slip Cycling Gloves', 'giyo-anti-slip-cycling-gloves', 'Comfortable padded cycling gloves with a secure grip and breathable construction.', 650.00, 30, 'https://www.mondincecycle.com/uploads/20251127/6a712b6d-82f0-44ad-b9bc-91676597dc4b.jpg', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 08:27:08'),
	(8, 3, 'Elite Fly 750ml Water Bottle', 'elite-fly-750ml-water-bottle', 'Lightweight squeeze bottle for convenient hydration while cycling. Fits standard bicycle bottle cages.', 450.00, 39, 'https://bayridersco.com.au/cdn/shop/t/5/assets/category-accessories.png?v=55580150579088571191781059966', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-16 12:11:43'),
	(9, 3, 'Giyo Compact Mini Bicycle Pump', 'giyo-compact-mini-pump', 'Compact hand pump for roadside tire inflation. Easy to carry in a saddle bag or jersey pocket.', 550.00, 12, 'https://kellysbike.com/images/product/57/5732_Kellys_Staronphoto_IMGL0535a_lipca_20%2C_2016.jpg', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 08:27:08'),
	(10, 2, 'Shimano Deore M5100 11-Speed Groupset', 'shimano-deore-m5100-groupset', 'Mountain bike drivetrain set with crankset, cassette, chain, and shifting components for smooth and reliable gear changes.', 12990.00, 8, 'https://images.bike24.com/i/mb/0e/20/4b/shimano-deore-m5100-groupset-1x11-speed-835488.jpg', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 08:27:08'),
	(11, 2, 'State Bicycle 12-Speed Drivetrain Kit', 'state-bicycle-12-speed-drivetrain-kit', 'A coordinated drivetrain component set featuring cassette, chainring, chain, and braking components. Confirm compatibility before installation.', 15900.00, 5, 'https://www.statebicycle.com/cdn/shop/files/StateBicycleCo.All-Road2Group-Set_12-speed_-1_grande.jpg?v=1738005625', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 15:20:34'),
	(12, 2, 'Bicycle Crankset and Cassette Kit', 'bicycle-crankset-cassette-kit', 'Replacement crankset and cassette components for compatible multi-speed bicycles.', 3950.00, 10, 'https://image.made-in-china.com/2f0j00JCslEaQgvRbp/Hot-Bike-Parts-Bottom-Bracket-Chainwheel-and-Crank-Bicycle-Cassette.webp', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 08:27:08'),
	(13, 2, 'Shimano 105 Disc Groupset', 'shimano-105-disc-groupset', 'Road bike mechanical 12-speed groupset product photo. Check frame, hub, and brake compatibility before purchase.', 24900.00, 3, 'https://cdn.shoplightspeed.com/shops/634319/files/64613098/800x800x2/shimano-r7100-105-mechanical-12speed-disc-groupset.jpg', 1, 0, NULL, '2026-11-08 08:27:08', '2026-11-08 14:30:48'),
	(17, 2, 'Chain', 'chain', 'Bicycle Chain', 700.00, 8, NULL, 1, 0, NULL, '2026-11-08 10:38:22', '2026-11-16 14:14:01');

-- Dumping structure for table c5_cyclehub.orders
CREATE TABLE IF NOT EXISTS `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(64) DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `status` enum('pending','confirmed','processing','completed','cancelled') NOT NULL DEFAULT 'pending',
  `customer_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_idempotency_key` (`idempotency_key`),
  KEY `fk_orders_user` (`user_id`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.orders: ~32 rows (approximately)
INSERT INTO `orders` (`id`, `idempotency_key`, `user_id`, `total_amount`, `status`, `customer_note`, `created_at`) VALUES
	(1, NULL, 2, 13000.00, 'completed', '', '2026-11-07 23:13:38'),
	(2, NULL, 1, 13000.00, 'cancelled', '', '2026-11-08 07:24:30'),
	(3, NULL, 2, 13000.00, 'completed', '', '2026-11-08 07:30:48'),
	(4, NULL, 3, 145000.00, 'completed', '', '2026-11-08 09:09:20'),
	(5, 'b7b3632a-bca7-46d5-834f-d6d37848ded4', 3, 2490.00, 'completed', '', '2026-11-08 10:10:03'),
	(6, '6736f6e2-8cbc-4205-b981-a42c882849a8', 3, 2490.00, 'completed', '', '2026-11-08 10:26:01'),
	(7, '143670cc-02d0-4f74-a152-8f27d27bc560', 1, 500.00, 'completed', '', '2026-11-08 10:38:40'),
	(8, '5b7c16da-8d3e-405e-b5c4-44f4718d45c2', 3, 500.00, 'completed', '', '2026-11-08 10:42:53'),
	(9, 'fdaff155-9331-4e70-892b-8b37be0bfbeb', 3, 500.00, 'completed', '', '2026-11-08 10:45:44'),
	(10, '48f84b90-0b70-4278-a850-d24e1cac9d7b', 3, 26000.00, 'completed', '', '2026-11-08 14:18:16'),
	(11, '14d0a3b5-d073-45ca-aade-380628441b2f', 3, 1290.00, 'cancelled', '', '2026-11-08 14:23:14'),
	(12, '996480a0-219f-4b77-8b2a-8149c1067f97', 3, 450.00, 'cancelled', '', '2026-11-08 14:28:21'),
	(13, '47555419-1630-4481-916b-8d90972385f0', 3, 500.00, 'cancelled', '', '2026-11-08 14:28:52'),
	(14, 'be3e63c1-80e3-4f74-9a33-6d292d91f093', 3, 37900.00, 'completed', '', '2026-11-08 14:30:48'),
	(15, '8aa1e08b-84f9-4500-94bc-32ed5dc38358', 3, 156500.00, 'cancelled', '', '2026-11-08 14:31:06'),
	(16, '4ce266cf-4935-46d7-98d0-96ce2971a924', 3, 145000.00, 'cancelled', '', '2026-11-08 14:31:28'),
	(17, '3943d1eb-05a4-45c0-b938-25f2c027ab49', 3, 500.00, 'cancelled', '', '2026-11-08 14:35:34'),
	(18, 'cd227784-2372-4847-a12c-b5d1c9b5839b', 3, 500.00, 'pending', '', '2026-11-08 15:14:23'),
	(19, 'da3d3fe7-f83c-4544-8eef-2b69f5c63c03', 3, 26000.00, 'pending', '', '2026-11-08 15:14:40'),
	(20, 'a19c3f33-a16b-455b-88e5-961045fbb750', 3, 500.00, 'pending', '', '2026-11-08 15:15:46'),
	(21, 'e2c869eb-ed31-4047-9e4f-99b299aee3a9', 3, 1290.00, 'pending', '', '2026-11-08 15:16:01'),
	(22, '55669dd9-b5d7-4af1-8864-d658537f35a2', 3, 2490.00, 'confirmed', '', '2026-11-08 15:16:21'),
	(23, 'c445738d-829d-4606-90e3-d6efc5dd365b', 3, 130500.00, 'confirmed', '', '2026-11-08 15:16:37'),
	(24, '692abc26-fbb3-4430-a63e-a377d884a18a', 3, 500.00, 'cancelled', '', '2026-11-08 15:16:45'),
	(25, 'bc8a9776-8a5a-4d05-aca0-9dd2d1eec8e9', 3, 15900.00, 'completed', '', '2026-11-08 15:20:34'),
	(26, 'fdaa886b-b467-4363-9328-b4cba227a476', 3, 500.00, 'cancelled', '', '2026-11-08 15:20:42'),
	(27, 'e35c7c7d-7e03-42fc-b033-ab89d41c3170', 3, 130500.00, 'cancelled', '', '2026-11-08 15:23:34'),
	(28, '406e069b-da1c-4a54-8f3a-811efe96e8a4', 3, 500.00, 'pending', '', '2026-11-08 15:27:23'),
	(29, '5146586f-6176-48c6-bebd-5e2da563c5ed', 3, 26000.00, 'pending', '', '2026-11-10 07:07:06'),
	(30, 'a8e12187-5a16-432f-92c2-ec2ea1d5a2ef', 3, 2490.00, 'confirmed', '', '2026-11-10 07:07:35'),
	(31, 'b650c7e9-ba2a-42ba-b5d8-7eee28b4a336', 1, 1790.00, 'completed', '', '2026-11-10 07:09:38'),
	(32, '62c0d501-901b-4dd2-be1e-0f819beb8346', 3, 500.00, 'confirmed', '', '2026-11-10 07:35:29'),
	(33, '0fd5e68d-7fa5-4eff-b02f-b2b4dacb9c59', 1, 130500.00, 'cancelled', '', '2026-11-10 07:37:12'),
	(34, '34c978fb-be6f-4412-b540-29d04e7c4525', 3, 700.00, 'completed', '', '2026-11-15 21:50:02'),
	(35, '43b23946-fb88-4b17-904c-64a403021bcf', 3, 279280.00, 'completed', '', '2026-11-15 21:50:22'),
	(36, '439a7d86-175b-4cc2-a641-6f72c99e2ae3', 3, 130500.00, 'completed', '', '2026-11-16 11:44:27'),
	(37, '1e3e1c0a-d587-4d67-bd52-3bb69fba6184', 3, 3780.00, 'completed', '', '2026-11-16 11:58:42'),
	(38, '7761d2e7-ee82-4e05-9767-99a144fa9a88', 3, 450.00, 'completed', '', '2026-11-16 12:11:43'),
	(39, 'bfa9fef2-103f-42a1-9480-5fc3b424a838', 3, 700.00, 'completed', '', '2026-11-16 12:19:00'),
	(40, 'ba6d53cb-2169-49a1-a886-3e5e97659a3d', 3, 13000.00, 'cancelled', '', '2026-11-16 12:24:59'),
	(41, '0b2fa0ee-f7d8-4ce1-8236-a6670401ba05', 3, 700.00, 'completed', '', '2026-11-16 13:21:45'),
	(42, '2ef05cce-4f27-4173-8a54-0cd4d5cfca1b', 3, 700.00, 'cancelled', '', '2026-11-16 14:08:21'),
	(43, '3060c741-6ad1-4086-b2d5-81e4b0a55542', 3, 700.00, 'cancelled', '', '2026-11-16 14:09:27'),
	(44, '892a5030-5a21-45df-82b2-a0ddda9c3cd9', 4, 700.00, 'completed', '', '2026-11-16 14:10:28'),
	(45, '863f91fb-177c-446b-8aa0-4f644328e0af', 1, 700.00, 'pending', '', '2026-11-16 14:14:01');

-- Dumping structure for table c5_cyclehub.order_items
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `product_id` int unsigned DEFAULT NULL,
  `product_name` varchar(180) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_items_order` (`order_id`),
  KEY `fk_items_product` (`product_id`),
  CONSTRAINT `fk_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.order_items: ~35 rows (approximately)
INSERT INTO `order_items` (`id`, `order_id`, `product_id`, `product_name`, `unit_price`, `quantity`) VALUES
	(1, 1, 1, 'Mountain Bike 29er', 13000.00, 1),
	(2, 2, 1, 'Mountain Bike 29er', 13000.00, 1),
	(3, 3, 1, 'Mountain Bike 29er', 13000.00, 1),
	(4, 4, 4, 'GT Sensor Comp Full-Suspension MTB', 145000.00, 1),
	(5, 5, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(6, 6, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(7, 7, 17, 'Chain', 500.00, 1),
	(8, 8, 17, 'Chain', 500.00, 1),
	(9, 9, 17, 'Chain', 500.00, 1),
	(10, 10, 2, 'COGIS GT600 27.5-inch Mountain Bike', 26000.00, 1),
	(11, 11, 6, 'RockBros Front and Rear LED Light Set', 1290.00, 1),
	(12, 12, 8, 'Elite Fly 750ml Water Bottle', 450.00, 1),
	(13, 13, 17, 'Chain', 500.00, 1),
	(14, 14, 13, 'Shimano 105 Disc Groupset', 24900.00, 1),
	(15, 14, 1, 'Mountain Bike 29er', 13000.00, 1),
	(16, 15, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(17, 15, 2, 'COGIS GT600 27.5-inch Mountain Bike', 26000.00, 1),
	(18, 16, 4, 'GT Sensor Comp Full-Suspension MTB', 145000.00, 1),
	(19, 17, 17, 'Chain', 500.00, 1),
	(20, 18, 17, 'Chain', 500.00, 1),
	(21, 19, 2, 'COGIS GT600 27.5-inch Mountain Bike', 26000.00, 1),
	(22, 20, 17, 'Chain', 500.00, 1),
	(23, 21, 6, 'RockBros Front and Rear LED Light Set', 1290.00, 1),
	(24, 22, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(25, 23, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(26, 24, 17, 'Chain', 500.00, 1),
	(27, 25, 11, 'State Bicycle 12-Speed Drivetrain Kit', 15900.00, 1),
	(28, 26, 17, 'Chain', 500.00, 1),
	(29, 27, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(30, 28, 17, 'Chain', 500.00, 1),
	(31, 29, 2, 'COGIS GT600 27.5-inch Mountain Bike', 26000.00, 1),
	(32, 30, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(33, 31, 17, 'Chain', 500.00, 1),
	(34, 31, 6, 'RockBros Front and Rear LED Light Set', 1290.00, 1),
	(35, 32, 17, 'Chain', 500.00, 1),
	(36, 33, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(37, 34, 17, 'Chain', 700.00, 1),
	(38, 35, 4, 'GT Sensor Comp Full-Suspension MTB', 145000.00, 1),
	(39, 35, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(40, 35, 6, 'RockBros Front and Rear LED Light Set', 1290.00, 1),
	(41, 35, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(42, 36, 3, 'Giant TCR Advanced 2 KOM Road Bike', 130500.00, 1),
	(43, 37, 6, 'RockBros Front and Rear LED Light Set', 1290.00, 1),
	(44, 37, 5, 'RNOX Trail Cycling Helmet', 2490.00, 1),
	(45, 38, 8, 'Elite Fly 750ml Water Bottle', 450.00, 1),
	(46, 39, 17, 'Chain', 700.00, 1),
	(47, 40, 1, 'Mountain Bike 29er', 13000.00, 1),
	(48, 41, 17, 'Chain', 700.00, 1),
	(49, 42, 17, 'Chain', 700.00, 1),
	(50, 43, 17, 'Chain', 700.00, 1),
	(51, 44, 17, 'Chain', 700.00, 1),
	(52, 45, 17, 'Chain', 700.00, 1);

-- Dumping structure for table c5_cyclehub.messages
CREATE TABLE IF NOT EXISTS `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sender_id` int unsigned NOT NULL,
  `receiver_id` int unsigned NOT NULL,
  `message` text NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sender_id` (`sender_id`),
  KEY `receiver_id` (`receiver_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`),
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.messages: ~0 rows (approximately)
INSERT INTO `messages` (`id`, `sender_id`, `receiver_id`, `message`, `read_at`, `created_at`) VALUES
	(1, 2, 1, 'hallo', '2026-11-16 05:39:16', '2026-11-15 21:38:15'),
	(2, 3, 1, 'hallo', '2026-11-16 05:39:14', '2026-11-15 21:39:06'),
	(3, 1, 2, 'hi', NULL, '2026-11-15 21:52:22'),
	(4, 1, 2, 'availabe po lahat', NULL, '2026-11-15 21:52:29'),
	(5, 1, 4, 'hello teh', '2026-11-16 22:15:21', '2026-11-16 14:14:59'),
	(6, 4, 1, 'hello po', NULL, '2026-11-16 14:15:27');

-- Dumping structure for table c5_cyclehub.notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `title` varchar(180) NOT NULL,
  `body` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=126 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping data for table c5_cyclehub.notifications: ~75 rows (approximately)
INSERT INTO `notifications` (`id`, `user_id`, `title`, `body`, `is_read`, `created_at`) VALUES
	(1, 1, 'New Order Received', 'Marc Stephen placed Order #2 worth ₱13,000.00.', 1, '2026-11-08 07:24:30'),
	(2, 1, 'Order #2 Updated', 'Your order has been cancelled.', 1, '2026-11-08 07:26:22'),
	(3, 1, 'New Order Received', 'Neri placed Order #3 worth ₱13,000.00.', 1, '2026-11-08 07:30:48'),
	(4, 2, 'Order #3 Updated', 'Your order has been confirmed.', 1, '2026-11-08 07:31:25'),
	(5, 2, 'Order #1 Updated', 'Your order is now being processed.', 1, '2026-11-08 07:35:44'),
	(6, 2, 'Order #1 Updated', 'Your order has been completed.', 1, '2026-11-08 07:41:28'),
	(7, 1, 'New Order Received', 'Pheus placed Order #4 worth ₱145000.00.', 1, '2026-11-08 09:09:20'),
	(8, 3, 'Order #4 Updated', 'Your order has been confirmed.', 1, '2026-11-08 09:09:42'),
	(9, 3, 'Order #4 Updated', 'Your order is now being processed.', 1, '2026-11-08 09:09:50'),
	(10, 3, 'Order #4 Updated', 'Your order has been completed.', 1, '2026-11-08 09:09:54'),
	(11, 1, 'New Order Received', 'Pheus placed Order #5 worth ₱2490.00.', 1, '2026-11-08 10:10:03'),
	(12, 3, 'Order #5 Updated', 'Your order has been confirmed.', 1, '2026-11-08 10:13:43'),
	(13, 3, 'Order #5 Updated', 'Your order is now being processed.', 1, '2026-11-08 10:13:45'),
	(14, 3, 'Order #5 Updated', 'Your order has been completed.', 1, '2026-11-08 10:13:49'),
	(15, 2, 'Order #3 Updated', 'Your order is now being processed.', 1, '2026-11-08 10:13:57'),
	(16, 2, 'Order #3 Updated', 'Your order has been completed.', 1, '2026-11-08 10:13:59'),
	(17, 1, 'New Order Received', 'Pheus placed Order #6 worth ₱2490.00.', 1, '2026-11-08 10:26:01'),
	(18, 3, 'Order #6 Updated', 'Your order has been confirmed.', 1, '2026-11-08 10:30:04'),
	(19, 3, 'Order #6 Updated', 'Your order is now being processed.', 1, '2026-11-08 10:30:06'),
	(20, 3, 'Order #6 Updated', 'Your order has been completed.', 1, '2026-11-08 10:30:08'),
	(21, 1, 'New Order Received', 'Marc Stephen placed Order #7 worth ₱500.00.', 1, '2026-11-08 10:38:40'),
	(22, 1, 'Order #7 Updated', 'Your order has been confirmed.', 1, '2026-11-08 10:38:51'),
	(23, 1, 'Order #7 Updated', 'Your order is now being processed.', 1, '2026-11-08 10:38:54'),
	(24, 1, 'Order #7 Updated', 'Your order has been completed.', 1, '2026-11-08 10:38:57'),
	(25, 1, 'New Order Received', 'Pheus placed Order #8 worth ₱500.00.', 1, '2026-11-08 10:42:53'),
	(26, 1, 'New Order Received', 'Pheus placed Order #9 worth ₱500.00.', 1, '2026-11-08 10:45:44'),
	(27, 1, 'New Order Received', 'Pheus placed Order #10 worth ₱26000.00.', 1, '2026-11-08 14:18:16'),
	(28, 3, 'Order #10 Updated', 'Your order has been confirmed.', 1, '2026-11-08 14:18:37'),
	(29, 3, 'Order #10 Updated', 'Your order is now being processed.', 1, '2026-11-08 14:18:48'),
	(30, 3, 'Order #10 Updated', 'Your order has been completed.', 1, '2026-11-08 14:18:54'),
	(31, 1, 'New Order Received', 'Pheus placed Order #11 worth ₱1290.00.', 1, '2026-11-08 14:23:14'),
	(32, 3, 'Order #8 Updated', 'Your order has been confirmed.', 1, '2026-11-08 14:23:41'),
	(33, 3, 'Order #8 Updated', 'Your order is now being processed.', 1, '2026-11-08 14:23:47'),
	(34, 3, 'Order #8 Updated', 'Your order has been completed.', 1, '2026-11-08 14:23:54'),
	(35, 3, 'Order #9 Updated', 'Your order has been confirmed.', 1, '2026-11-08 14:24:09'),
	(36, 3, 'Order #9 Updated', 'Your order is now being processed.', 1, '2026-11-08 14:24:14'),
	(37, 3, 'Order #9 Updated', 'Your order has been completed.', 1, '2026-11-08 14:24:22'),
	(38, 3, 'Order #11 Updated', 'Your order has been cancelled.', 1, '2026-11-08 14:24:33'),
	(39, 1, 'New Order Received', 'Pheus placed Order #12 worth ₱450.00.', 1, '2026-11-08 14:28:21'),
	(40, 1, 'New Order Received', 'Pheus placed Order #13 worth ₱500.00.', 1, '2026-11-08 14:28:52'),
	(41, 1, 'New Order Received', 'Pheus placed Order #14 worth ₱37900.00.', 1, '2026-11-08 14:30:48'),
	(42, 1, 'New Order Received', 'Pheus placed Order #15 worth ₱156500.00.', 1, '2026-11-08 14:31:06'),
	(43, 1, 'New Order Received', 'Pheus placed Order #16 worth ₱145000.00.', 1, '2026-11-08 14:31:28'),
	(44, 3, 'Order #16 Updated', 'Your order has been cancelled.', 1, '2026-11-08 14:31:54'),
	(45, 3, 'Order #15 Updated', 'Your order has been cancelled.', 1, '2026-11-08 14:32:10'),
	(46, 3, 'Order #14 Updated', 'Your order has been confirmed.', 1, '2026-11-08 14:32:54'),
	(47, 3, 'Order #12 Updated', 'Your order has been cancelled.', 1, '2026-11-08 14:33:02'),
	(48, 3, 'Order #13 Updated', 'Your order has been cancelled.', 1, '2026-11-08 14:33:06'),
	(49, 3, 'Order #14 Updated', 'Your order is now being processed.', 1, '2026-11-08 14:34:38'),
	(50, 3, 'Order #14 Updated', 'Your order has been completed.', 1, '2026-11-08 14:35:00'),
	(51, 1, 'New Order Received', 'Pheus placed Order #17 worth ₱500.00.', 1, '2026-11-08 14:35:34'),
	(52, 1, 'New Order Received', 'Pheus placed Order #18 worth ₱500.00.', 1, '2026-11-08 15:14:23'),
	(53, 1, 'New Order Received', 'Pheus placed Order #19 worth ₱26000.00.', 1, '2026-11-08 15:14:40'),
	(54, 1, 'New Order Received', 'Pheus placed Order #20 worth ₱500.00.', 1, '2026-11-08 15:15:46'),
	(55, 1, 'New Order Received', 'Pheus placed Order #21 worth ₱1290.00.', 1, '2026-11-08 15:16:01'),
	(56, 1, 'New Order Received', 'Pheus placed Order #22 worth ₱2490.00.', 1, '2026-11-08 15:16:21'),
	(57, 1, 'New Order Received', 'Pheus placed Order #23 worth ₱130500.00.', 1, '2026-11-08 15:16:37'),
	(58, 1, 'New Order Received', 'Pheus placed Order #24 worth ₱500.00.', 1, '2026-11-08 15:16:45'),
	(59, 1, 'New Order Received', 'Pheus placed Order #25 worth ₱15900.00.', 1, '2026-11-08 15:20:34'),
	(60, 1, 'New Order Received', 'Pheus placed Order #26 worth ₱500.00.', 1, '2026-11-08 15:20:42'),
	(61, 3, 'Order #26 Updated', 'Your order has been cancelled.', 1, '2026-11-08 15:22:17'),
	(62, 3, 'Order #17 Updated', 'Your order has been cancelled.', 1, '2026-11-08 15:23:09'),
	(63, 1, 'New Order Received', 'Pheus placed Order #27 worth ₱130500.00.', 1, '2026-11-08 15:23:34'),
	(64, 3, 'Order #24 Updated', 'Your order has been cancelled.', 1, '2026-11-08 15:24:01'),
	(65, 3, 'Order #23 Updated', 'Your order has been confirmed.', 1, '2026-11-08 15:24:11'),
	(66, 3, 'Order #27 Updated', 'Your order has been cancelled.', 1, '2026-11-08 15:24:29'),
	(67, 3, 'Order #25 Updated', 'Your order has been confirmed.', 1, '2026-11-08 15:25:51'),
	(68, 3, 'Order #22 Updated', 'Your order has been confirmed.', 1, '2026-11-08 15:27:04'),
	(69, 1, 'New Order Received', 'Pheus placed Order #28 worth ₱500.00.', 1, '2026-11-08 15:27:23'),
	(70, 3, 'Order #25 Updated', 'Your order is now being processed.', 1, '2026-11-08 15:37:09'),
	(71, 3, 'Order #25 Updated', 'Your order has been completed.', 1, '2026-11-08 15:37:41'),
	(72, 1, 'New Order Received', 'Pheus placed Order #29 worth ₱26000.00.', 1, '2026-11-10 07:07:06'),
	(73, 1, 'New Order Received', 'Pheus placed Order #30 worth ₱2490.00.', 1, '2026-11-10 07:07:35'),
	(74, 3, 'Order #30 Updated', 'Your order has been confirmed.', 1, '2026-11-10 07:07:57'),
	(75, 1, 'New Order Received', 'Marc Stephen placed Order #31 worth ₱1790.00.', 1, '2026-11-10 07:09:38'),
	(76, 1, 'New Order Received', 'Pheus placed Order #32 worth ₱500.00.', 1, '2026-11-10 07:35:29'),
	(77, 3, 'Order #32 Updated', 'Your order has been confirmed.', 1, '2026-11-10 07:35:46'),
	(78, 1, 'New Order Received', 'Marc Stephen placed Order #33 worth ₱130500.00.', 1, '2026-11-10 07:37:12'),
	(79, 1, 'Order #33 Updated', 'Your order has been cancelled.', 1, '2026-11-10 07:37:39'),
	(80, 1, 'New Order Received', 'Pheus placed Order #34 worth ₱700.00.', 1, '2026-11-15 21:50:02'),
	(81, 1, 'New Order Received', 'Pheus placed Order #35 worth ₱279280.00.', 1, '2026-11-15 21:50:22'),
	(82, 2, 'New message from Marc Stephen', 'hi', 0, '2026-11-15 21:52:22'),
	(83, 2, 'New message from Marc Stephen', 'availabe po lahat', 0, '2026-11-15 21:52:29'),
	(84, 1, 'New Order Received', 'Pheus placed Order #36 worth ₱130500.00.', 1, '2026-11-16 11:44:27'),
	(85, 3, 'Order #36 Updated', 'Your order has been confirmed.', 1, '2026-11-16 11:44:48'),
	(86, 3, 'Order #36 Updated', 'Your order is now being processed.', 1, '2026-11-16 11:46:08'),
	(87, 3, 'Order #36 Updated', 'Your order has been completed.', 1, '2026-11-16 11:46:19'),
	(88, 3, 'Order #35 Updated', 'Your order has been confirmed.', 1, '2026-11-16 11:48:59'),
	(89, 3, 'Order #35 Updated', 'Your order is now being processed.', 1, '2026-11-16 11:49:10'),
	(90, 3, 'Order #35 Updated', 'Your order has been completed.', 1, '2026-11-16 11:49:17'),
	(91, 1, 'New Order Received', 'Pheus placed Order #37 worth ₱3780.00.', 1, '2026-11-16 11:58:42'),
	(92, 3, 'Order #37 Updated', 'Your order has been confirmed.', 1, '2026-11-16 11:59:03'),
	(93, 3, 'Order #37 Updated', 'Your order is now being processed.', 1, '2026-11-16 11:59:11'),
	(94, 3, 'Order #37 Updated', 'Your order has been completed.', 1, '2026-11-16 11:59:16'),
	(95, 3, 'Order #34 Updated', 'Your order has been confirmed.', 1, '2026-11-16 11:59:31'),
	(96, 3, 'Order #34 Updated', 'Your order is now being processed.', 1, '2026-11-16 11:59:43'),
	(97, 3, 'Order #34 Updated', 'Your order has been completed.', 1, '2026-11-16 11:59:59'),
	(98, 1, 'New Order Received', 'Pheus placed Order #38 worth ₱450.00.', 1, '2026-11-16 12:11:43'),
	(99, 1, 'New Order Received', 'Pheus placed Order #39 worth ₱700.00.', 1, '2026-11-16 12:19:00'),
	(100, 3, 'Order #39 Updated', 'Your order has been confirmed.', 1, '2026-11-16 12:19:22'),
	(101, 3, 'Order #39 Updated', 'Your order is now being processed.', 1, '2026-11-16 12:19:30'),
	(102, 3, 'Order #39 Updated', 'Your order has been completed.', 1, '2026-11-16 12:19:38'),
	(103, 3, 'Order #38 Updated', 'Your order has been confirmed.', 1, '2026-11-16 12:19:46'),
	(104, 3, 'Order #38 Updated', 'Your order is now being processed.', 1, '2026-11-16 12:20:01'),
	(105, 3, 'Order #38 Updated', 'Your order has been completed.', 1, '2026-11-16 12:20:14'),
	(106, 1, 'Order #31 Updated', 'Your order has been confirmed.', 1, '2026-11-16 12:20:39'),
	(107, 1, 'Order #31 Updated', 'Your order is now being processed.', 1, '2026-11-16 12:20:48'),
	(108, 1, 'Order #31 Updated', 'Your order has been completed.', 1, '2026-11-16 12:20:53'),
	(109, 1, 'New Order Received', 'Pheus placed Order #40 worth ₱13000.00.', 1, '2026-11-16 12:24:59'),
	(110, 1, 'New Order Received', 'Pheus placed Order #41 worth ₱700.00.', 1, '2026-11-16 13:21:45'),
	(111, 3, 'Order #41 Updated', 'Your order has been confirmed.', 1, '2026-11-16 13:23:09'),
	(112, 3, 'Order #41 Updated', 'Your order is now being processed.', 1, '2026-11-16 13:23:21'),
	(113, 3, 'Order #41 Updated', 'Your order has been completed.', 1, '2026-11-16 13:23:28'),
	(114, 3, 'Order #40 Updated', 'Your order has been cancelled.', 1, '2026-11-16 13:23:38'),
	(115, 1, 'New Order Received', 'Pheus placed Order #42 worth ₱700.00.', 1, '2026-11-16 14:08:21'),
	(116, 3, 'Order #42 Updated', 'Your order has been cancelled.', 1, '2026-11-16 14:09:05'),
	(117, 1, 'New Order Received', 'Pheus placed Order #43 worth ₱700.00.', 1, '2026-11-16 14:09:27'),
	(118, 1, 'New Order Received', 'lawrence placed Order #44 worth ₱700.00.', 1, '2026-11-16 14:10:28'),
	(119, 3, 'Order #43 Updated', 'Your order has been cancelled.', 1, '2026-11-16 14:10:51'),
	(120, 4, 'Order #44 Updated', 'Your order has been confirmed.', 1, '2026-11-16 14:11:30'),
	(121, 4, 'Order #44 Updated', 'Your order is now being processed.', 1, '2026-11-16 14:11:38'),
	(122, 4, 'Order #44 Updated', 'Your order has been completed.', 1, '2026-11-16 14:11:42'),
	(123, 1, 'New Order Received', 'Marc Stephen placed Order #45 worth ₱700.00.', 1, '2026-11-16 14:14:01'),
	(124, 4, 'New message from Marc Stephen', 'hello teh', 1, '2026-11-16 14:14:59'),
	(125, 1, 'New message from lawrence', 'hello po', 1, '2026-11-16 14:15:27');

-- Dumping structure for table c5_cyclehub.push_subscriptions
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `endpoint` varchar(768) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `endpoint_hash` binary(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_push_endpoint` (`user_id`,`endpoint_hash`),
  KEY `idx_push_user` (`user_id`),
  CONSTRAINT `fk_push_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dumping structure for table c5_cyclehub.user_sessions
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Quick verification after import:
SELECT 'categories' AS table_name, COUNT(*) AS row_count FROM categories
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'messages', COUNT(*) FROM messages
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'push_subscriptions', COUNT(*) FROM push_subscriptions
UNION ALL SELECT 'user_sessions', COUNT(*) FROM user_sessions;
