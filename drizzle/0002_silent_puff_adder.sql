ALTER TABLE "mock_interview" ADD COLUMN "share_id" varchar(36);--> statement-breakpoint
CREATE UNIQUE INDEX "mock_interview_share_id_idx" ON "mock_interview" USING btree ("share_id");