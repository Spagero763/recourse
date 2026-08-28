import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { amount, symbolFor } from "../lib/format";

type Props = {
  claim: Doc<"cases">;
  hasReply: boolean;
  busy: string | null;
  run: (name: string, fn: () => Promise<unknown>) => void;
};

export function CaseActions({ claim, hasReply, busy, run }: Props) {
  const caseId = claim._id;
  const files = useQuery(api.attachments.forCase, { caseId });

  const draftReply = useAction(api.drafting.draftReply);
  const chaseNow = useMutation(api.chase.chaseNow);
  const resolve = useMutation(api.cases.resolve);
  const close = useMutation(api.cases.close);
  const reopen = useMutation(api.cases.reopen);
  const uploadUrl = useMutation(api.attachments.uploadUrl);
  const attach = useMutation(api.attachments.attach);
  const detach = useMutation(api.attachments.remove);

  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(
    claim.amountClaimed !== undefined ? String(claim.amountClaimed) : "",
  );
  const picker = useRef<HTMLInputElement>(null);

  const finished = claim.status === "resolved" || claim.status === "closed";

  async function upload(file: File) {
    const url = await uploadUrl();
    const sent = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = (await sent.json()) as { storageId: Id<"_storage"> };
    await attach({ caseId, storageId, filename: file.name });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        {!finished && hasReply && (
          <Action
            primary
            busy={busy === "reply"}
            onClick={() => run("reply", () => draftReply({ caseId }))}
          >
            Draft a reply
          </Action>
        )}

        {!finished && (
          <Action
            busy={busy === "chase"}
            onClick={() => run("chase", () => chaseNow({ caseId }))}
          >
            Chase now
          </Action>
        )}

        {!finished && (
          <Action onClick={() => setSettling((s) => !s)}>Mark settled</Action>
        )}

        {!finished && (
          <Action
            busy={busy === "close"}
            onClick={() => run("close", () => close({ caseId }))}
          >
            Give up
          </Action>
        )}

        {finished && (
          <Action
            busy={busy === "reopen"}
            onClick={() => run("reopen", () => reopen({ caseId }))}
          >
            Reopen
          </Action>
        )}

        <Action onClick={() => picker.current?.click()}>Attach evidence</Action>
        <input
          ref={picker}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) run("upload", () => upload(file));
            e.target.value = "";
          }}
        />
      </div>

      <AnimatePresence>
        {settling && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-card p-3">
              <span className="text-[12px] text-ink-500">
                How much did you actually recover?
              </span>
              <div className="flex items-center">
                <span className="cur font-mono text-[13px]">
                  {symbolFor(claim.currency)}
                </span>
                <input
                  value={settled}
                  onChange={(e) => setSettled(e.target.value)}
                  inputMode="decimal"
                  className="tnum w-[100px] rounded-sm border border-ink-300 bg-card px-2 py-1 text-[13px] outline-none focus:border-accent"
                />
              </div>
              <Action
                primary
                busy={busy === "resolve"}
                onClick={() => {
                  const parsed = Number.parseFloat(settled);
                  run("resolve", () =>
                    resolve({
                      caseId,
                      settledAmount: Number.isFinite(parsed) ? parsed : undefined,
                    }),
                  );
                  setSettling(false);
                }}
              >
                Confirm
              </Action>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(files ?? []).length > 0 && (
        <div className="mt-4">
          <h3 className="label mb-2">Evidence on file</h3>
          <ul className="space-y-1">
            {(files ?? []).map((f) => (
              <li
                key={f._id}
                className="flex items-center justify-between gap-3 rounded-sm border border-ink-200 bg-card px-3 py-2"
              >
                <a
                  href={f.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[12px] hover:text-accent hover:underline"
                >
                  {f.filename}
                </a>
                <button
                  onClick={() =>
                    run("detach", () => detach({ attachmentId: f._id }))
                  }
                  className="shrink-0 text-[11px] text-ink-400 hover:text-state-dead"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-400">
            Anything here is attached to the next reply you send.
          </p>
        </div>
      )}

      {claim.status === "resolved" && claim.settledAmount !== undefined && (
        <p className="tnum mt-4 text-[13px] text-state-won">
          Recovered <span className="cur">{symbolFor(claim.currency)}</span>
          {amount(claim.settledAmount)}
        </p>
      )}
    </section>
  );
}

function Action({
  children,
  onClick,
  busy,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${
        primary
          ? "bg-accent text-white hover:bg-accent-hover disabled:bg-ink-300"
          : "border border-ink-300 text-ink-700 hover:border-ink-400 hover:bg-sunk disabled:text-ink-300"
      }`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}
