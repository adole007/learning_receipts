/**
 * Receipts for Learning — data model (Drizzle / Postgres)
 *
 * The Evidence Graph:
 *   source ─< source_chunk           (locator-tagged evidence: page / timestamp / paragraph)
 *   objective >─< source_chunk       (structuring is grounded in evidence)
 *   question  ─< evidence >─ source_chunk   (each question carries verified verbatim quotes)
 *   attempt   ─> question            (every answer links back to its evidence)
 *   receipt                          (hash chain over all learning events = tamper-evident portfolio)
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const pathwayStatus = pgEnum("pathway_status", ["PENDING", "INGESTING", "STRUCTURING", "READY", "FAILED"]);
export const sourceKind = pgEnum("source_kind", ["YOUTUBE", "PDF", "ARTICLE"]);
export const sourceStatus = pgEnum("source_status", ["PENDING", "OK", "FAILED"]);
export const locatorType = pgEnum("locator_type", ["TIMESTAMP", "PAGE", "PARAGRAPH"]);
export const verificationStatus = pgEnum("verification_status", ["VERIFIED", "QUOTE_ONLY", "REJECTED"]);

export const learners = pgTable("learner", {
  id: id(),
  displayName: text("display_name").notNull().default("Learner"),
  createdAt: createdAt(),
});

export const pathways = pgTable(
  "pathway",
  {
    id: id(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goal: text("goal"),
    status: pathwayStatus("status").notNull().default("PENDING"),
    statusDetail: text("status_detail"),
    publicSlug: text("public_slug").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pathway_learner_idx").on(t.learnerId), uniqueIndex("pathway_slug_uq").on(t.publicSlug)],
);

export const sources = pgTable(
  "source",
  {
    id: id(),
    pathwayId: text("pathway_id").notNull().references(() => pathways.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: sourceKind("kind").notNull(),
    title: text("title"),
    status: sourceStatus("status").notNull().default("PENDING"),
    error: text("error"),
    contentHash: text("content_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("source_pathway_idx").on(t.pathwayId)],
);

/** A single addressable unit of evidence. */
export const sourceChunks = pgTable(
  "source_chunk",
  {
    id: id(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    locatorType: locatorType("locator_type").notNull(),
    locatorStart: doublePrecision("locator_start").notNull(),
    locatorEnd: doublePrecision("locator_end").notNull(),
    label: text("label").notNull(),
    deepLink: text("deep_link").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("chunk_source_idx").on(t.sourceId, t.ordinal)],
);

export const modules = pgTable(
  "module",
  {
    id: id(),
    pathwayId: text("pathway_id").notNull().references(() => pathways.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    questionsGeneratedAt: timestamp("questions_generated_at", { withTimezone: true }),
  },
  (t) => [index("module_pathway_idx").on(t.pathwayId)],
);

export const objectives = pgTable("objective", {
  id: id(),
  moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  statement: text("statement").notNull(),
  bloom: text("bloom").notNull().default("understand"),
});

export const objectiveEvidence = pgTable(
  "objective_evidence",
  {
    objectiveId: text("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").notNull().references(() => sourceChunks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.objectiveId, t.chunkId] })],
);

export const questions = pgTable(
  "question",
  {
    id: id(),
    objectiveId: text("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    difficulty: integer("difficulty").notNull().default(2),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<string[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation").notNull(),
    verification: verificationStatus("verification").notNull(),
    groundingScore: doublePrecision("grounding_score").notNull(),
    verifierNote: text("verifier_note"),
    createdAt: createdAt(),
  },
  (t) => [index("question_objective_idx").on(t.objectiveId)],
);

/** Bidirectional question <-> evidence link with a verified verbatim quote. */
export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id").notNull().references(() => sourceChunks.id, { onDelete: "cascade" }),
    quote: text("quote").notNull(),
    matchStart: integer("match_start").notNull(),
  },
  (t) => [index("evidence_chunk_idx").on(t.chunkId), index("evidence_question_idx").on(t.questionId)],
);

export const attempts = pgTable(
  "attempt",
  {
    id: id(),
    questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    selectedIndex: integer("selected_index").notNull(),
    correct: boolean("correct").notNull(),
    isReview: boolean("is_review").notNull().default(false),
    confidence: integer("confidence"),
    createdAt: createdAt(),
  },
  (t) => [index("attempt_question_idx").on(t.questionId, t.createdAt)],
);

/** SM-2 spaced repetition state per question. */
export const reviewSchedules = pgTable("review_schedule", {
  questionId: text("question_id").primaryKey().references(() => questions.id, { onDelete: "cascade" }),
  easeFactor: doublePrecision("ease_factor").notNull().default(2.5),
  intervalDays: doublePrecision("interval_days").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RubricItem = { criterion: string; chunkIds: string[] };
export type FeedbackItem = { criterion: string; met: boolean; comment: string; chunkIds: string[] };

export const appliedTasks = pgTable("applied_task", {
  id: id(),
  moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  rubric: jsonb("rubric").$type<RubricItem[]>().notNull(),
  createdAt: createdAt(),
});

export const taskSubmissions = pgTable("task_submission", {
  id: id(),
  taskId: text("task_id").notNull().references(() => appliedTasks.id, { onDelete: "cascade" }),
  response: text("response").notNull(),
  score: doublePrecision("score").notNull(),
  feedback: jsonb("feedback").$type<FeedbackItem[]>().notNull(),
  createdAt: createdAt(),
});

/** Tamper-evident receipt chain over learning events. */
export const receipts = pgTable(
  "receipt",
  {
    id: id(),
    pathwayId: text("pathway_id").notNull().references(() => pathways.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<"ATTEMPT" | "TASK_SUBMISSION">().notNull(),
    refId: text("ref_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("receipt_seq_uq").on(t.pathwayId, t.seq)],
);

// ---------- relations ----------
export const pathwaysRelations = relations(pathways, ({ one, many }) => ({
  learner: one(learners, { fields: [pathways.learnerId], references: [learners.id] }),
  sources: many(sources),
  modules: many(modules),
  receipts: many(receipts),
}));
export const sourcesRelations = relations(sources, ({ one, many }) => ({
  pathway: one(pathways, { fields: [sources.pathwayId], references: [pathways.id] }),
  chunks: many(sourceChunks),
}));
export const sourceChunksRelations = relations(sourceChunks, ({ one }) => ({
  source: one(sources, { fields: [sourceChunks.sourceId], references: [sources.id] }),
}));
export const modulesRelations = relations(modules, ({ one, many }) => ({
  pathway: one(pathways, { fields: [modules.pathwayId], references: [pathways.id] }),
  objectives: many(objectives),
  tasks: many(appliedTasks),
}));
export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  module: one(modules, { fields: [objectives.moduleId], references: [modules.id] }),
  evidence: many(objectiveEvidence),
  questions: many(questions),
}));
export const objectiveEvidenceRelations = relations(objectiveEvidence, ({ one }) => ({
  objective: one(objectives, { fields: [objectiveEvidence.objectiveId], references: [objectives.id] }),
  chunk: one(sourceChunks, { fields: [objectiveEvidence.chunkId], references: [sourceChunks.id] }),
}));
export const questionsRelations = relations(questions, ({ one, many }) => ({
  objective: one(objectives, { fields: [questions.objectiveId], references: [objectives.id] }),
  evidence: many(evidence),
  attempts: many(attempts),
  schedule: one(reviewSchedules, { fields: [questions.id], references: [reviewSchedules.questionId] }),
}));
export const evidenceRelations = relations(evidence, ({ one }) => ({
  question: one(questions, { fields: [evidence.questionId], references: [questions.id] }),
  chunk: one(sourceChunks, { fields: [evidence.chunkId], references: [sourceChunks.id] }),
}));
export const attemptsRelations = relations(attempts, ({ one }) => ({
  question: one(questions, { fields: [attempts.questionId], references: [questions.id] }),
}));
export const appliedTasksRelations = relations(appliedTasks, ({ one, many }) => ({
  module: one(modules, { fields: [appliedTasks.moduleId], references: [modules.id] }),
  submissions: many(taskSubmissions),
}));
export const taskSubmissionsRelations = relations(taskSubmissions, ({ one }) => ({
  task: one(appliedTasks, { fields: [taskSubmissions.taskId], references: [appliedTasks.id] }),
}));
