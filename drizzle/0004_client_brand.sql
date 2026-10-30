CREATE TABLE "client_logos" (
	"client_id" varchar(191) PRIMARY KEY NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brand_color" varchar(7);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "logo_at" timestamp (3) with time zone;