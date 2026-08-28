import { useState } from "react";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const CURRENCIES = ["GBP", "USD", "EUR", "NGN"];

export function NewClaim({
  onOpened,
  onCancel,
}: {
  onOpened: (id: Id<"cases">) => void;
  onCancel: () => void;
}) {
  const open = useMutation(api.cases.open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    claimantName: "",
    counterparty: "",
    counterpartySite: "",
    narrative: "",
    amountClaimed: "",
    currency: "GBP",
    jurisdiction: "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const ready =
    form.counterparty.trim().length > 1 && form.narrative.trim().length > 20;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = Number.parseFloat(form.amountClaimed);
      const id = await open({
        // The title is what the claimant would call this in conversation.
        title: form.narrative.trim().split(/[.!?\n]/)[0].slice(0, 80),
        claimantName: form.claimantName.trim() || undefined,
        counterparty: form.counterparty.trim(),
        counterpartySite: form.counterpartySite.trim() || undefined,
        narrative: form.narrative.trim(),
        amountClaimed: Number.isFinite(parsed) ? parsed : undefined,
        currency: form.currency,
        jurisdiction: form.jurisdiction.trim() || undefined,
      });
      onOpened(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h2 className="text-[21px] font-semibold tracking-[-0.015em]">
          What are you owed?
        </h2>
        <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-500">
          Write it the way you would tell a friend. Recourse reads the other
          side's own published terms before it writes anything, and nothing is
          sent until you approve it.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Who owes you" hint="The company name">
            <input
              value={form.counterparty}
              onChange={(e) => set("counterparty")(e.target.value)}
              placeholder="Currys"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field
            label="Their website"
            hint="Where their refund policy and terms live"
          >
            <input
              value={form.counterpartySite}
              onChange={(e) => set("counterpartySite")(e.target.value)}
              placeholder="currys.co.uk"
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label="What happened" hint="Dates and amounts help">
            <textarea
              value={form.narrative}
              onChange={(e) => set("narrative")(e.target.value)}
              rows={5}
              placeholder="I was billed twice for one order on 14 August. The second charge was never refunded despite two chat conversations."
              className={`${inputClass} resize-none leading-relaxed`}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount" hint="Leave blank if unsure">
              <div className="flex">
                <select
                  value={form.currency}
                  onChange={(e) => set("currency")(e.target.value)}
                  className={`${inputClass} w-[76px] rounded-r-none border-r-0 font-mono`}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={form.amountClaimed}
                  onChange={(e) => set("amountClaimed")(e.target.value)}
                  inputMode="decimal"
                  placeholder="249.99"
                  className={`${inputClass} tnum rounded-l-none`}
                />
              </div>
            </Field>

            <Field label="Where you are" hint="Sets which rights apply">
              <input
                value={form.jurisdiction}
                onChange={(e) => set("jurisdiction")(e.target.value)}
                placeholder="United Kingdom"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Your name" hint="Signs the letter">
            <input
              value={form.claimantName}
              onChange={(e) => set("claimantName")(e.target.value)}
              placeholder="A. Afolabi"
              className={inputClass}
            />
          </Field>

          {error && (
            <p className="rounded-md bg-state-dead-wash px-4 py-3 text-[12px] text-state-dead">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!ready || busy}
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-ink-300"
            >
              {busy ? "Opening…" : "Open the claim"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[13px] text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-ink-300 bg-card px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-ink-300 focus:border-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium">{label}</span>
        {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
