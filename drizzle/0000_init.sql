CREATE TYPE "public"."locator_type" AS ENUM('TIMESTAMP', 'PAGE', 'PARAGRAPH');--> statement-breakpoint
CREATE TYPE "public"."pathway_status" AS ENUM('PENDING', 'INGESTING', 'STRUCTURING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('YOUTUBE', 'PDF', 'ARTICLE');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('PENDING', 'OK', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('VERIFIED', 'QUOTE_ONLY', 'REJECTED');--> statement-breakpoint
CREATE TABLE "applied_task" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"prompt" text NOT NULL,
	"rubric" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"selected_index" integer NOT NULL,
	"correct" boolean NOT NULL,
	"is_review" boolean DEFAULT false NOT NULL,
	"confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"quote" text NOT NULL,
	"match_start" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT 'Learner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module" (
	"id" text PRIMARY KEY NOT NULL,
	"pathway_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"questions_generated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "objective_evidence" (
	"objective_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	CONSTRAINT "objective_evidence_objective_id_chunk_id_pk" PRIMARY KEY("objective_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "objective" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"statement" text NOT NULL,
	"bloom" text DEFAULT 'understand' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathway" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"title" text NOT NULL,
	"goal" text,
	"status" "pathway_status" DEFAULT 'PENDING' NOT NULL,
	"status_detail" text,
	"public_slug" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"objective_id" text NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text NOT NULL,
	"verification" "verification_status" NOT NULL,
	"grounding_score" double precision NOT NULL,
	"verifier_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"pathway_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_schedule" (
	"question_id" text PRIMARY KEY NOT NULL,
	"ease_factor" double precision DEFAULT 2.5 NOT NULL,
	"interval_days" double precision DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"locator_type" "locator_type" NOT NULL,
	"locator_start" double precision NOT NULL,
	"locator_end" double precision NOT NULL,
	"label" text NOT NULL,
	"deep_link" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" text PRIMARY KEY NOT NULL,
	"pathway_id" text NOT NULL,
	"url" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"title" text,
	"status" "source_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"response" text NOT NULL,
	"score" double precision NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applied_task" ADD CONSTRAINT "applied_task_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_chunk_id_source_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_pathway_id_pathway_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathway"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_evidence" ADD CONSTRAINT "objective_evidence_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_evidence" ADD CONSTRAINT "objective_evidence_chunk_id_source_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway" ADD CONSTRAINT "pathway_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_pathway_id_pathway_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathway"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_schedule" ADD CONSTRAINT "review_schedule_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunk" ADD CONSTRAINT "source_chunk_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_pathway_id_pathway_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathway"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submission" ADD CONSTRAINT "task_submission_task_id_applied_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."applied_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_question_idx" ON "attempt" USING btree ("question_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_chunk_idx" ON "evidence" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "evidence_question_idx" ON "evidence" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "module_pathway_idx" ON "module" USING btree ("pathway_id");--> statement-breakpoint
CREATE INDEX "pathway_learner_idx" ON "pathway" USING btree ("learner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pathway_slug_uq" ON "pathway" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "question_objective_idx" ON "question" USING btree ("objective_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_seq_uq" ON "receipt" USING btree ("pathway_id","seq");--> statement-breakpoint
CREATE INDEX "chunk_source_idx" ON "source_chunk" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE INDEX "source_pathway_idx" ON "source" USING btree ("pathway_id");