import { useState } from "react";
import { motion } from "motion/react";
import type { Doc } from "../../convex/_generated/dataModel";
import { refKey, relative, segmentCitations } from "../lib/format";

type Props = {
  letter: Doc<"letters">;
  pending: boolean;
  recipient?: string;
  hovered: string | null;
  onHover: (ref: string | null) => void;
  byRef: Map<string, Doc<"clauses">>;
  sending: boolean;
  onApprove: (to?: string) => void;
};

export function Letter({
  letter,
  pending,
  recipient,
  hovered,
  onHover,
  byRef,
  sending,
  onApprove,
}: Props) {
  const [to, setTo] = useState(recipient ?? "");
  const segments = segmentCitations(letter.body);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-7 overflow-hidden rounded-[--radius-md] border border-[--color-ink-200] bg-[--color-card]"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[--color-ink-100] px-6 py-3">
        <div className="min-w-0">
          <div className="label">
            {letter.kind === "claim" ? "Opening claim" : letter.kind}
          </div>
          <h3 className="mt-0.5 truncate text-[14px] font-medium">
            {letter.subject}
          </h3>
        </div>
        <span className="label shrink-0">
          {letter.status === "sent" && letter.sentAt
            ? `sent ${relative(letter.sentAt)}`
            : letter.status}
        </span>
      </header>

      {/*
        The letter is set as correspondence rather than interface: serif, a
        reading measure, and generous leading. It is the artefact the whole
        product exists to produce, so it should not look like a form field.
      */}
      <div className="px-6 py-7 md:px-10 md:py-9">
        <p className="max-w-[62ch] whitespace-pre-wrap font-serif text-[15px] leading-[1.75] text-[--color-ink-900]">
          {segments.map((seg, i) =>
            seg.ref && byRef.has(refKey(seg.ref)) ? (
              <button
                key={i}
                onMouseEnter={() => onHover(refKey(seg.ref!))}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(refKey(seg.ref!))}
                onBlur={() => onHover(null)}
                className={`mx-[1px] rounded-[2px] px-[3px] font-mono text-[12px] align-baseline transition-colors ${
                  hovered === refKey(seg.ref)
                    ? "bg-[--color-accent] text-white"
                    : "bg-[--color-accent-wash] text-[--color-accent]"
                }`}
                title="Show the clause this cites"
              >
                {seg.ref}
              </button>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      </div>

      {pending && (
        <footer className="border-t border-[--color-ink-100] bg-[--color-sunk] px-6 py-4">
          <p className="text-[12px] text-[--color-ink-500]">
            Nothing is sent until you approve it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="who to send it to"
              type="email"
              className="min-w-0 flex-1 rounded-[--radius-sm] border border-[--color-ink-300] bg-[--color-card] px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[--color-accent]"
            />
            <button
              onClick={() => onApprove(to.trim() || undefined)}
              disabled={sending || !to.trim()}
              className="rounded-[--radius-md] bg-[--color-accent] px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[--color-accent-hover] disabled:cursor-not-allowed disabled:bg-[--color-ink-300]"
            >
              {sending ? "Sending…" : "Approve and send"}
            </button>
          </div>
        </footer>
      )}

      {letter.status === "failed" && letter.error && (
        <footer className="border-t border-[--color-ink-100] bg-[--color-state-dead-wash] px-6 py-3">
          <p className="text-[12px] text-[--color-state-dead]">{letter.error}</p>
        </footer>
      )}
    </motion.section>
  );
}
