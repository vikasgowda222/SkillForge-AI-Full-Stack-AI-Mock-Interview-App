CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "resume_chunk" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"mock_id_ref" varchar(36),
	"source" varchar(32) DEFAULT 'resume' NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "resume_chunk_user_id_idx" ON "resume_chunk" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resume_chunk_mock_id_idx" ON "resume_chunk" USING btree ("mock_id_ref");