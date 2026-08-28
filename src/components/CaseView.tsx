import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  STATUS,
  TONE_CLASS,
  amount,
  clockTime,
  countdown,
  refKey,
  segmentCitations,
  symbolFor,
} from "../lib/format";
import { Letter } from "./Letter";
import { Evidence } from "./Evidence";
import { Timeline } from "./Timeline";

export function CaseView({ caseId }: { caseId: Id<"cases"> }) {
  const claim = useQuery(api.cases.get, { caseId });
  const clauses = useQuery(api.clauses.forCase, { caseId });
  const letters = useQuery(api.letters.forCase, { caseId });
  const policies = useQuery(api.policies.forCase, { caseId });
  const replies = useQuery(api.replies.forCase, { caseId });
  const events = useQuery(api.cases.timeline, { caseId });

  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const discover = useAction(api.policies.discover);
  const extract = useAction(api.extraction.extractForCase);
  const draft = useAction(api.drafting.draftClaim);
  const approve = useMutation(api.letters.approveAndSend);

  const byRef = useMemo(() => {
    const map = new Map<string, Doc<"clauses">>();
    for (const c of clauses ?? []) map.set(refKey(c.ref), c as Doc<"clauses">);
    return map;
  }, [clauses]);

  if (claim === undefined) return <Loading />;
  if (claim === null) return <Missing />;

  const state = STATUS[claim.status] ?? STATUS.drafting;
  const latest = (letters ?? [])[0];
  const pending = (letters ?? []).find((l) => l.status === "draft");
  const cited = new Set(
    latest ? segmentCitations(latest.body).map((s) => s.ref && refKey(s.ref)) : [],
  );

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="relative border-b border-ink-200 bg-card px-8 pb-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className={`rounded-sm px-1.5 py-[2px] text-[10px] font-medium ${TONE_CLASS[state.tone]}`}
              >
                {state.label}
              </span>
              {claim.nextNudgeAt && (
                <span className="label">
                  chases {countdown(claim.nextNudgeAt)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.015em]">
              {claim.title}
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">
              against {claim.counterparty}
              {claim.counterpartyDomain && (
                <span className="font-mono text-[12px] text-ink-400">
                  {" "}
                  · {claim.counterpartyDomain}
                </span>
              )}
            </p>
          </div>

          {claim.amountClaimed !== undefined && (
            <div className="text-right">
              <div className="label">Claimed</div>
              <div className="tnum mt-0.5 text-[26px] font-semibold tracking-[-0.02em]">
                <span className="cur">{symbolFor(claim.currency)}</span>
                {amount(claim.amountClaimed)}
              </div>
              {claim.settledAmount !== undefined && (
                <div className="tnum text-[12px] text-state-won">
                  <span className="cur">{symbolFor(claim.currency)}</span>
                  {amount(claim.settledAmount)} recovered
                </div>
              )}
            </div>
          )}
        </div>

        {claim.inboxAddress && (
          <p className="mt-4 font-mono text-[11px] text-ink-400">
            corresponding as {claim.inboxAddress}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
        <main className="min-w-0 flex-1 px-8 py-7">
          <Steps
            claim={claim}
            policyCount={policies?.length ?? 0}
            clauseCount={clauses?.length ?? 0}
            hasLetter={Boolean(latest)}
            busy={busy}
            onScan={() => run("scan", () => discover({ caseId }))}
            onRead={() => run("read", () => extract({ caseId }))}
            onDraft={() => run("draft", () => draft({ caseId }))}
          />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-5 overflow-hidden"
              >
                <p className="rounded-md bg-state-dead-wash px-4 py-3 text-[12px] text-state-dead">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {latest && (
            <Letter
              letter={latest}
              pending={Boolean(pending && pending._id === latest._id)}
              recipient={claim.counterpartyEmail}
              hovered={hovered}
              onHover={setHovered}
              byRef={byRef}
              sending={busy === "send"}
              onApprove={(to) =>
                run("send", () => approve({ letterId: latest._id, to }))
              }
            />
          )}

          {(replies ?? []).length > 0 && (
            <section className="mt-8">
              <h3 className="label mb-3">Replies</h3>
              <div className="space-y-3">
                {(replies ?? []).map((r) => (
                  <Reply key={r._id} reply={r} currency={claim.currency} />
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="w-full shrink-0 border-t border-ink-200 bg-card lg:w-[340px] lg:border-l lg:border-t-0">
          <Evidence
            clauses={(clauses ?? []) as Array<Doc<"clauses">>}
            policies={policies ?? []}
            hovered={hovered}
            cited={cited}
            onHover={setHovered}
          />
          <Timeline events={events ?? []} />
        </aside>
      </div>
    </div>
  );
}

function Steps({
  claim,
  policyCount,
  clauseCount,
  hasLetter,
  busy,
  onScan,
  onRead,
  onDraft,
}: {
  claim: Doc<"cases">;
  policyCount: number;
  clauseCount: number;
  hasLetter: boolean;
  busy: string | null;
  onScan: () => void;
  onRead: () => void;
  onDraft: () => void;
}) {
  const steps = [
    {
      key: "scan",
      n: 1,
      title: "Read their terms",
      done: policyCount > 0,
      detail:
        policyCount > 0
          ? `${policyCount} document${policyCount === 1 ? "" : "s"} from ${claim.counterpartyDomain}`
          : "Find the pages this claim will be argued from",
      action: onScan,
      label: "Scan site",
    },
    {
      key: "read",
      n: 2,
      title: "Find the clauses",
      done: clauseCount > 0,
      detail:
        clauseCount > 0
          ? `${clauseCount} citable provisions`
          : "Pull out what can be cited, for and against",
      action: onRead,
      label: "Extract",
      blocked: policyCount === 0,
    },
    {
      key: "draft",
      n: 3,
      title: "Write the letter",
      done: hasLetter,
      detail: hasLetter
        ? "Drafted and awaiting your approval"
        : "Cite their own terms back to them",
      action: onDraft,
      label: "Draft",
      blocked: clauseCount === 0,
    },
  ];

  return (
    <ol className="grid gap-px overflow-hidden rounded-md border border-ink-200 bg-ink-200 sm:grid-cols-3">
      {steps.map((s) => (
        <li key={s.key} className="group relative bg-card p-4 transition-colors hover:bg-paper">
          <div className="flex items-center gap-2">
            <span
              className={`grid h-[18px] w-[18px] place-items-center rounded-full font-mono text-[10px] ${
                s.done
                  ? "bg-state-won text-white"
                  : "bg-sunk text-ink-400"
              }`}
            >
              {s.done ? "✓" : s.n}
            </span>
            <span className="text-[13px] font-medium">{s.title}</span>
          </div>
          <p className="mt-1.5 min-h-[32px] text-[12px] leading-snug text-ink-500">
            {s.detail}
          </p>
          <button
            onClick={s.action}
            disabled={Boolean(busy) || s.blocked}
            className="mt-1 text-[12px] font-medium text-accent transition-opacity hover:underline disabled:cursor-not-allowed disabled:text-ink-300 disabled:no-underline"
          >
            {busy === s.key ? "Working…" : s.done ? `${s.label} again` : s.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function Reply({
  reply,
  currency,
}: {
  reply: Doc<"replies">;
  currency: string;
}) {
  const tone =
    reply.disposition === "accepted"
      ? "won"
      : reply.disposition === "refused"
        ? "dead"
        : "live";
  return (
    <article className="rounded-md border border-ink-200 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-sm px-1.5 py-[2px] text-[10px] font-medium ${TONE_CLASS[tone as "won"]}`}
        >
          {reply.disposition.replace("_", " ")}
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {clockTime(reply.receivedAt)}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed">{reply.summary}</p>
      {reply.offeredAmount !== undefined && (
        <p className="tnum mt-2 text-[13px] font-medium">
          <span className="cur">{symbolFor(currency)}</span>
          {amount(reply.offeredAmount)} offered
        </p>
      )}
      {reply.missingInfo.length > 0 && (
        <div className="mt-3">
          <div className="label">They asked for</div>
          <ul className="mt-1 space-y-0.5">
            {reply.missingInfo.map((m) => (
              <li key={m} className="text-[12px] text-ink-700">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function Loading() {
  return (
    <div className="grid h-full place-items-center">
      <span className="label">Loading</span>
    </div>
  );
}

function Missing() {
  return (
    <div className="grid h-full place-items-center">
      <p className="text-[13px] text-ink-500">
        That claim no longer exists.
      </p>
    </div>
  );
}
