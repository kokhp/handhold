ALTER TABLE "device" DROP COLUMN IF EXISTS "socket_id";
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN IF NOT EXISTS "token_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_token_hash_idx" ON "device" ("token_hash");
