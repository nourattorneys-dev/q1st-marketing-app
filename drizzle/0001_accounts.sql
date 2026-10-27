CREATE TABLE IF NOT EXISTS `invitations` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` varchar(16) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`invited_by` varchar(191),
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_email` UNIQUE(`email`),
	CONSTRAINT `invitations_token_hash` UNIQUE(`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_resets` (
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `password_resets_token_hash` PRIMARY KEY(`token_hash`),
	INDEX `password_resets_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token_hash` char(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`),
	INDEX `sessions_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sign_in_limits` (
	`key` varchar(300) NOT NULL,
	`count` int NOT NULL,
	`window_start` datetime(3) NOT NULL,
	CONSTRAINT `sign_in_limits_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(200) NOT NULL,
	`role` varchar(16),
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`password_changed_at` datetime(3) NOT NULL,
	`last_sign_in_at` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email` UNIQUE(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
