import { useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { CaseList } from "./components/CaseList";
import { CaseView } from "./components/CaseView";
import { NewClaim } from "./components/NewClaim";
import { Welcome } from "./components/Welcome";

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
