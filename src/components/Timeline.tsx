import { motion } from "motion/react";
import type { Doc } from "../../convex/_generated/dataModel";
import { clockTime, shortDate } from "../lib/format";

// Which hue a timeline entry earns. Anything not listed stays neutral, so a
// new event kind can never accidentally look like a failure.
const TONE: Record<string, string> = {
  letter_sent: "bg-accent",
  reply_received: "bg-state-live",
  reply_accepted: "bg-state-won",
  reply_refused: "bg-state-dead",
  send_failed: "bg-state-dead",
  delivery_bounced: "bg-state-dead",
  delivery_rejected: "bg-state-dead",
  delivery_complained: "bg-state-dead",
};

export function Timeline({ events }: { events: Array<Doc<"caseEvents">> }) {
  if (events.length === 0) return null;

  return (
    <section className="px-5 py-5">
      <h3 className="label">History</h3>
      <ol className="mt-3">
        {events.map((e, i) => (
          <motion.li
            key={e._id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="relative grid grid-cols-[10px_1fr] gap-3 pb-4 last:pb-0"
          >
            <div className="relative flex justify-center">
              <span
                className={`z-10 mt-[5px] h-[7px] w-[7px] rounded-full ${
                  TONE[e.kind] ?? "bg-ink-300"
                }`}
              />
              {i < events.length - 1 && (
                <span className="absolute top-[12px] h-full w-px bg-ink-200" />
              )}
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-[12px] leading-snug text-ink-700">
                {e.detail.replace(/\s+/g, " ").trim() || e.kind}
              </p>
              <span className="tnum mt-0.5 block font-mono text-[10px] text-ink-400">
                {shortDate(e.at)} · {clockTime(e.at)}
              </span>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
