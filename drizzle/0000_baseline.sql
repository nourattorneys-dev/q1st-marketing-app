CREATE TABLE "invitations" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(16) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"invited_by" varchar(191),
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "invitations_email" UNIQUE("email"),
	CONSTRAINT "invitations_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"event_id" varchar(191) NOT NULL,
	"email" varchar(255) NOT NULL,
	"sent_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "notification_deliveries_event_id_email_pk" PRIMARY KEY("event_id","email")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"email_off" boolean NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"event_id" varchar(191) PRIMARY KEY NOT NULL,
	"kind" varchar(64) NOT NULL,
	"audience" varchar(64) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"sent_at" timestamp (3) with time zone,
	"recipients" jsonb
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_limits" (
	"key" varchar(300) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(16),
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"password_changed_at" timestamp (3) with time zone NOT NULL,
	"last_sign_in_at" timestamp (3) with time zone,
	CONSTRAINT "users_email" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret_cipher" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_resets_user_id" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");