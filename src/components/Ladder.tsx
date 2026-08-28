import { motion } from "motion/react";

// Mirrors LADDER in convex/chase.ts. Four rungs, and the last one is where the
// product stops: past that the claimant is going to an ombudsman, which is
// their decision rather than the app's.
const RUNGS = [
  { label: "First ask", note: "The opening claim" },
  { label: "Chase", note: "Assumes it was overlooked" },
  { label: "Second chase", note: "The deadline has passed" },
  { label: "Before action", note: "Final request, then escalate" },
];

export function Ladder({ stage, done }: { stage: number; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5" title="How far this claim has been pushed">
      {RUNGS.map((rung, i) => {
        const reached = i <= stage;
        const current = i === stage && !done;
        return (
          <div key={rung.label} className="group/rung relative">
            <motion.span
              initial={false}
              animate={{
                backgroundColor: done
                  ? "var(--color-state-won)"
                  : reached
                    ? "var(--color-accent)"
                    : "var(--color-ink-200)",
                width: current ? 26 : 14,
              }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="block h-[3px] rounded-full"
            />
            <span className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-sm bg-ink-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover/rung:opacity-100">
              {rung.label}
              <span className="ml-1.5 text-ink-300">{rung.note}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
