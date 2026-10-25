CREATE TABLE IF NOT EXISTS `notification_deliveries` (
	`event_id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`sent_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_deliveries_event_id_email_pk` PRIMARY KEY(`event_id`,`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_prefs` (
	`user_id` varchar(191) NOT NULL,
	`email_off` boolean NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_prefs_user_id` PRIMARY KEY(`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notifications` (
	`event_id` varchar(191) NOT NULL,
	`kind` varchar(64) NOT NULL,
	`audience` varchar(64) NOT NULL,
	`data` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	`recipients` json,
	CONSTRAINT `notifications_event_id` PRIMARY KEY(`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_config` (
	`id` int NOT NULL,
	`url` text NOT NULL,
	`secret_cipher` text NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `webhook_config_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_events` (
	`id` varchar(191) NOT NULL,
	`event` text NOT NULL,
	`received_at` datetime(3) NOT NULL,
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
