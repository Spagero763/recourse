import { useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { CaseList } from "./components/CaseList";
import { CaseView } from "./components/CaseView";
import { NewClaim } from "./components/NewClaim";

export default function App() {
  const [selected, setSelected] = useState<Id<"cases"> | null>(null);
  const [composing, setComposing] = useState(false);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <CaseList
        selected={composing ? null : selected}
        onSelect={(id) => {
          setComposing(false);
          setSelected(id);
        }}
        onNew={() => {
          setComposing(true);
          setSelected(null);
        }}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {composing ? (
          <NewClaim
            onOpened={(id) => {
              setComposing(false);
              setSelected(id);
            }}
            onCancel={() => setComposing(false)}
          />
        ) : selected ? (
          <CaseView caseId={selected} />
        ) : (
          <Welcome onNew={() => setComposing(true)} />
        )}
      </div>
    </div>
  );
}

function Welcome({ onNew }: { onNew: () => void }) {
  return (
    <div className="mx-auto flex h-full max-w-[520px] flex-col justify-center px-8 py-16">
      <h2 className="font-serif text-[28px] leading-[1.25] tracking-[-0.01em]">
        Most people are owed something they never chase.
      </h2>
      <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-[--color-ink-500]">
        A duplicate charge. A deposit kept back. A delayed flight. Recourse
        reads the other side's own refund policy and terms, drafts a letter that
        cites the clause entitling you to the money, and handles the
        correspondence until it is settled.
      </p>
      <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-[--color-ink-500]">
        Nothing leaves your outbox without you approving it first.
      </p>
      <div className="mt-8">
        <button
          onClick={onNew}
          className="rounded-[--radius-md] bg-[--color-accent] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[--color-accent-hover]"
        >
          Open a claim
        </button>
      </div>
    </div>
  );
}
