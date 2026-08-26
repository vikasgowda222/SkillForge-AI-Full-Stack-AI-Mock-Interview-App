CREATE TABLE "mock_interview" (
	"id" serial PRIMARY KEY NOT NULL,
	"mock_id" varchar(36) NOT NULL,
	"json_mock_resp" text NOT NULL,
	"job_position" varchar(255) NOT NULL,
	"job_desc" text NOT NULL,
	"job_experience" varchar(20) NOT NULL,
	"created_by" varchar(320),
	"user_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_answer" (
	"id" serial PRIMARY KEY NOT NULL,
	"mock_id_ref" varchar(36) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"question" text NOT NULL,
	"correct_ans" text,
	"user_ans" text,
	"feedback" text,
	"rating" integer,
	"user_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mock_interview_mock_id_idx" ON "mock_interview" USING btree ("mock_id");--> statement-breakpoint
CREATE INDEX "mock_interview_user_id_idx" ON "mock_interview" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mock_interview_created_by_idx" ON "mock_interview" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "user_answer_mock_id_ref_idx" ON "user_answer" USING btree ("mock_id_ref");--> statement-breakpoint
CREATE INDEX "user_answer_user_id_idx" ON "user_answer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_answer_user_email_idx" ON "user_answer" USING btree ("user_email");