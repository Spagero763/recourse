import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TONE_CLASS, badgeFor, amount, relative, symbolFor } from "../lib/format";

type Props = {
  selected: Id<"cases"> | null;
  onSelect: (id: Id<"cases">) => void;
  onNew: () => void;
};

export function CaseList({ selected, onSelect, onNew }: Props) {
  const cases = useQuery(api.cases.list, {});

  const open = (cases ?? []).filter(
    (c) => c.status !== "resolved" && c.status !== "closed",
  );
  const recovered = (cases ?? [])
    .filter((c) => c.status === "resolved")
    .reduce((sum, c) => sum + (c.settledAmount ?? 0), 0);

  return (
    <aside className="flex h-full w-full flex-col border-r border-ink-200 bg-card md:w-[300px]">
      <header className="border-b border-ink-200 px-5 pb-4 pt-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">
            Recourse
          </h1>
          <button
            onClick={onNew}
            className="rounded-sm px-2 py-1 text-[12px] font-medium text-accent transition-colors hover:bg-accent-wash"
          >
            New claim
          </button>
        </div>

        <div className="mt-4 flex gap-6">
          <Stat label="Open" value={String(open.length)} />
          <Stat
            label="Recovered"
            value={
              recovered > 0 ? (
                <>
                  <span className="cur">{symbolFor("GBP")}</span>
                  {amount(recovered)}
                </>
              ) : (
                "0.00"
              )
            }
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cases === undefined ? (
          <Skeleton />
        ) : cases.length === 0 ? (
          <Empty onNew={onNew} />
        ) : (
          <ul>
            {cases.map((c, i) => {
              const state = badgeFor(c);
              const active = selected === c._id;
              return (
                <motion.li
                  key={c._id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                >
                  <button
                    onClick={() => onSelect(c._id)}
                    className={`relative w-full border-b border-ink-100 px-5 py-3.5 text-left transition-[background-color,padding] duration-200 ${
                      active ? "bg-accent-wash pl-6" : "hover:bg-sunk hover:pl-6"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="case-marker"
                        className="absolute inset-y-0 left-0 w-[2px] bg-accent"
                        transition={{ duration: 0.2 }}
                      />
                    )}
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-medium">
                        {c.counterparty}
                      </span>
                      {c.amountClaimed !== undefined && (
                        <span className="tnum shrink-0 text-[13px] font-medium">
                          <span className="cur">{symbolFor(c.currency)}</span>
                          {amount(c.amountClaimed)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-ink-500">
                      {c.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded-sm px-1.5 py-[2px] text-[10px] font-medium ${TONE_CLASS[state.tone]}`}
                      >
                        {state.label}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        {relative(c.lastActivityAt)}
                      </span>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="tnum mt-0.5 text-[17px] font-semibold tracking-[-0.01em]">
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 p-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-2/3 rounded bg-ink-100" />
          <div className="h-2.5 w-1/2 rounded bg-ink-100" />
        </div>
      ))}
    </div>
  );
}

function Empty({ onNew }: { onNew: () => void }) {
  return (
    <div className="px-5 py-10">
      <p className="text-[13px] font-medium">No claims yet</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
        Describe something you are owed and Recourse will read the other side's
        own terms before writing to them.
      </p>
      <button
        onClick={onNew}
        className="mt-4 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Open a claim
      </button>
    </div>
  );
}
