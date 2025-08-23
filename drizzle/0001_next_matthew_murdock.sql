CREATE TABLE "mock_interview" (
	"id" serial PRIMARY KEY NOT NULL,
	"json_mock_resp" text NOT NULL,
	"job_position" varchar NOT NULL,
	"job_desc" varchar NOT NULL,
	"job_experience" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" varchar,
	"mock_id" varchar NOT NULL,
	"question" text,
	"answer" text
);
--> statement-breakpoint
CREATE TABLE "user_answer" (
	"id" serial PRIMARY KEY NOT NULL,
	"mock_id_ref" varchar NOT NULL,
	"question" varchar NOT NULL,
	"correct_ans" text,
	"user_ans" text,
	"feedback" text,
	"rating" varchar,
	"user_email" varchar,
	"created_at" varchar
);
--> statement-breakpoint
DROP TABLE "MockInterview" CASCADE;--> statement-breakpoint
DROP TABLE "userAnswer" CASCADE;