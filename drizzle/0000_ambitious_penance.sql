CREATE TABLE "notification_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_off" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"event_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"audience" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"recipients" jsonb
);
--> statement-breakpoint
CREATE TABLE "webhook_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret_cipher" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
