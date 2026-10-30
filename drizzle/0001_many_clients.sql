CREATE TABLE "clients" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"client_id" varchar(191) NOT NULL,
	"name" varchar(200) NOT NULL,
	"key_cipher" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sites" (
	"user_id" varchar(191) NOT NULL,
	"site_id" varchar(191) NOT NULL,
	CONSTRAINT "user_sites_user_id_site_id_pk" PRIMARY KEY("user_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_configs" (
	"site_id" varchar(191) PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret_cipher" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "client_id" varchar(191);--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "site_ids" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "site_id" varchar(191);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "site_id" varchar(191);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "client_id" varchar(191);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "site_id" varchar(191);--> statement-breakpoint
CREATE INDEX "sites_client_id" ON "sites" USING btree ("client_id");