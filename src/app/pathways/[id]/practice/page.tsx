import Link from "next/link";
import { notFound } from "next/navigation";
import { Quiz } from "@/components/Quiz";
import { requireOwnedPathway } from "@/lib/learner";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ moduleId?: string; mode?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let p;
  try {
    p = await requireOwnedPathway(id);
  } catch {
    notFound();
  }
  const mode = sp.mode === "review" ? "review" : "practice";
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link href={`/pathways/${id}`} className="small muted">← {p.title}</Link>
      <h1>{mode === "review" ? "Spaced revision" : "Practice"}</h1>
      <Quiz pathwayId={id} moduleId={sp.moduleId} mode={mode} />
    </div>
  );
}
