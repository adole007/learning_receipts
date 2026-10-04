export type LocatorType = "TIMESTAMP" | "PAGE" | "PARAGRAPH";
export type SourceKind = "YOUTUBE" | "PDF" | "ARTICLE";

export type ChunkDraft = {
  ordinal: number;
  locatorType: LocatorType;
  locatorStart: number;
  locatorEnd: number;
  label: string;
  deepLink: string;
  text: string;
};

export type IngestResult = { kind: SourceKind; title: string; chunks: ChunkDraft[] };

export class IngestError extends Error {}
