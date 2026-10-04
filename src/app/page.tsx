import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { NewPathwayForm } from "@/components/NewPathwayForm";
import { StatusPill } from "@/components/bits";

export const dynamic = "force-dynamic";

async function myPathways() {
  const lid = (await cookies()).get("rfl_lid")?.value;
  if (!lid || !process.env.DATABASE_URL) return [];
  return getDb().query.pathways.findMany({
    where: eq(schema.pathways.learnerId, lid),
    orderBy: desc(schema.pathways.createdAt),
    with: { sources: { columns: { id: true } }, modules: { columns: { id: true } } },
  });
}

export default async function Home() {
  const pathways = await myPathways();
  return (
    <div className="stack" style={{ gap: 40 }}>
      <section className="hero">
        <div className="eyebrow">Receipts for learning</div>
        <h1>Learn from anything. Prove it with evidence.</h1>
        <p className="lede">
          Paste the videos, articles and PDFs you already learn from. We organise them into a pathway, test you only on what your
          sources actually say, and keep a verifiable record that links every answer back to the exact page or timestamp.
        </p>
        <ol className="how">
          <li><strong>Bring your links</strong>YouTube, PDFs, articles — free material you chose.</li>
          <li><strong>Get structure</strong>Modules and measurable objectives, each grounded in your sources.</li>
          <li><strong>Get assessed</strong>Questions that pass two-stage evidence verification, plus applied tasks.</li>
          <li><strong>Show receipts</strong>A shareable portfolio with a tamper-evident record of what you demonstrated.</li>
        </ol>
      </section>

      {pathways.length > 0 && (
        <section id="pathways">
          <h2>My pathways</h2>
          <table className="list">
            <tbody>
              {pathways.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/pathways/${p.id}`}><strong>{p.title}</strong></Link>
                    <div className="small muted">
                      {p.sources.length} source{p.sources.length === 1 ? "" : "s"} · {p.modules.length} module{p.modules.length === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section id="new" className="card">
        <h2>New pathway</h2>
        <NewPathwayForm />
      </section>
    </div>
  );
}
