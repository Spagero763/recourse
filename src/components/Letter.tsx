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
  onRevise: (body: string) => void;
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
  onRevise,
}: Props) {
  const [to, setTo] = useState(recipient ?? "");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(letter.body);
  const segments = segmentCitations(letter.body);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="paper mt-7 overflow-hidden rounded-md border border-ink-200 bg-card"
    >
      <header className="flex items-center justify-between gap-4 border-b border-ink-100 px-6 py-3">
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
      <div className="px-6 py-8 md:px-12 md:py-12">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="w-full max-w-[62ch] resize-y rounded-sm border border-ink-300 bg-card p-3 font-serif text-[15px] leading-[1.75] outline-none focus:border-accent"
          />
        ) : (
        <p className="max-w-[62ch] whitespace-pre-wrap font-serif text-[15.5px] leading-[1.8] text-ink-900">
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
                    ? "bg-accent text-white"
                    : "bg-accent-wash text-accent"
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
        )}
      </div>

      {pending && (
        <footer className="border-t border-ink-100 bg-sunk px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-ink-500">
              Nothing is sent until you approve it.
            </p>
            <button
              onClick={() => {
                if (editing) onRevise(text);
                setEditing((e) => !e);
              }}
              className="shrink-0 text-[12px] font-medium text-accent hover:underline"
            >
              {editing ? "Save changes" : "Edit the wording"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="who to send it to"
              type="email"
              className="min-w-0 flex-1 rounded-sm border border-ink-300 bg-card px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
            />
            <button
              onClick={() => onApprove(to.trim() || undefined)}
              disabled={sending || !to.trim()}
              className="rounded-md bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-ink-300"
            >
              {sending ? "Sending…" : "Approve and send"}
            </button>
          </div>
        </footer>
      )}

      {letter.status === "failed" && letter.error && (
        <footer className="border-t border-ink-100 bg-state-dead-wash px-6 py-3">
          <p className="text-[12px] text-state-dead">{letter.error}</p>
        </footer>
      )}
    </motion.section>
  );
}
