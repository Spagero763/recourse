import { AnimatePresence, motion } from "motion/react";
import type { Doc } from "../../convex/_generated/dataModel";
import { refKey } from "../lib/format";

type Props = {
  clauses: Array<Doc<"clauses">>;
  policies: Array<{ _id: string; title: string; url: string; kind: string }>;
  hovered: string | null;
  cited: Set<string | undefined>;
  onHover: (ref: string | null) => void;
};

export function Evidence({ clauses, policies, hovered, cited, onHover }: Props) {
  if (clauses.length === 0 && policies.length === 0) return null;

  // Cited provisions first, then everything supporting the claim, then the
  // exclusions. What the letter leaned on should be reachable without hunting.
  const ordered = [...clauses].sort((a, b) => {
    const ac = cited.has(refKey(a.ref)) ? 0 : a.favourable ? 1 : 2;
    const bc = cited.has(refKey(b.ref)) ? 0 : b.favourable ? 1 : 2;
    return ac - bc;
  });

  return (
    <section className="border-b border-ink-200 px-5 py-5">
      <div className="flex items-baseline justify-between">
        <h3 className="label">Evidence</h3>
        <span className="tnum text-[11px] text-ink-400">
          {clauses.filter((c) => c.favourable).length} for ·{" "}
          {clauses.filter((c) => !c.favourable).length} against
        </span>
      </div>

      {policies.length > 0 && (
        <ul className="mt-3 space-y-1">
          {policies.map((p) => (
            <li key={p._id}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-[12px] text-ink-500 underline-offset-2 hover:text-accent hover:underline"
              >
                {p.title.replace(/\s+/g, " ").trim()}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {ordered.map((c) => {
            const key = refKey(c.ref);
            const lit = hovered === key;
            const wasCited = cited.has(key);
            return (
              <motion.article
                key={c._id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                onMouseEnter={() => onHover(key)}
                onMouseLeave={() => onHover(null)}
                className={`lift cursor-default rounded-md border p-3 ${
                  lit
                    ? "border-accent bg-accent-wash"
                    : "border-ink-200 bg-card"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-[2px] px-1 font-mono text-[11px] ${
                      lit
                        ? "bg-accent text-white"
                        : "bg-sunk text-ink-700"
                    }`}
                  >
                    {c.ref}
                  </span>
                  <span
                    className={`h-[6px] w-[6px] rounded-full ${
                      c.favourable
                        ? "bg-state-won"
                        : "bg-state-dead"
                    }`}
                    title={
                      c.favourable
                        ? "Supports the claim"
                        : "They may quote this back"
                    }
                  />
                  {wasCited && <span className="label">cited</span>}
                </div>
                <p className="mt-1.5 text-[12px] font-medium leading-snug">
                  {c.heading}
                </p>
                <p className="mt-1 line-clamp-3 font-serif text-[12px] leading-relaxed text-ink-500">
                  {c.text}
                </p>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
