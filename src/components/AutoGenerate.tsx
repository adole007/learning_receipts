"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { generateModule } from "./GenerateButton";

type PendingModule = { id: string; title: string };

const failedKey = (id: string) => `rfl:autogen-failed:${id}`;

/**
 * Generates questions for each pending module, one request per module, so every
 * step fits in a single serverless invocation. A module that fails is not retried
 * automatically again in this tab; its "Generate assessments" button stays available.
 */
export function AutoGenerate({ pending }: { pending: PendingModule[] }) {
  const router = useRouter();
  const [initial] = useState(pending);
  const [queue, setQueue] = useState<PendingModule[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ title: string; error: string }[]>([]);

  useEffect(() => {
    let alive = true;
    const todo = initial.filter((m) => !sessionStorage.getItem(failedKey(m.id)));
    setQueue(todo);
    (async () => {
      for (const [i, m] of todo.entries()) {
        if (!alive) return;
        setCurrent(i);
        const error = await generateModule(m.id);
        if (!alive) return;
        if (error) {
          sessionStorage.setItem(failedKey(m.id), "1");
          setErrors((prev) => [...prev, { title: m.title, error }]);
        }
        router.refresh();
      }
      if (alive) setCurrent(null);
    })();
    return () => {
      alive = false;
    };
  }, [initial, router]);

  if (!queue.length) return null;
  return (
    <div className="card stack small">
      {current !== null && (
        <div className="row">
          <span className="spinner" /> Generating verified assessments — module {current + 1} of {queue.length}: {queue[current].title}
        </div>
      )}
      {errors.map((e) => (
        <div key={e.title} style={{ color: "var(--bad)" }}>
          Could not generate “{e.title}”: {e.error}. Use its “Generate assessments” button to try again.
        </div>
      ))}
      {current !== null && <div className="muted">Keep this page open until it finishes. Modules done so far are ready to practise.</div>}
    </div>
  );
}
