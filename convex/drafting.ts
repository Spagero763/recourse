"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MODELS, completeJson, embed } from "./lib/llm";
import { LADDER } from "./chase";

const DRAFT_SYSTEM = `You write the opening letter in a consumer claim. It is sent by email from the claimant to the company.

Return JSON: { "subject": string, "body": string, "citedRefs": string[] }

What makes this letter work:
- It cites the company's own published terms back to them, by reference, in their own words. Quote the operative phrase inside the sentence.
- It is short. Six to twelve sentences. A claims handler reads dozens a day and settles the clear ones first.
- It states one specific outcome and one date: the amount sought and a reasonable deadline, fourteen days unless the facts suggest otherwise.
- It is calm. No threats, no capital letters, no legal cosplay. Firm and factual reads as someone who will follow through. Angry reads as someone who will give up.
- It pre-empts the refusal. If a provision in the material works against the claim, address it in one clause rather than leaving it for them to raise.

Hard rules:
- Only cite provisions from the supplied material, using the "ref" exactly as given. Never invent a reference, a policy, or a statute.
- Never invent facts about the purchase: no order numbers, dates, or amounts beyond what the claimant stated. If something important is missing, ask for it in the letter rather than inventing it.
- "citedRefs" lists the refs you actually cited in the body.
- No placeholder text. No "[insert X]". The letter must be sendable exactly as written.
- Sign off with the claimant's name when one is supplied. Never write a placeholder like "The claimant" or "[Your name]". Do not name yourself as an agent or mention that software wrote this.
- Use a spaced hyphen rather than an em dash anywhere in the subject or body.`;

type Draft = { subject: string; body: string; citedRefs: Array<string> };

// The model writes refs the way it renders them in the letter, bracketed and
// sometimes with a trailing stop, while the stored ref is bare. Compare on a
// stripped form so "[5.]" and "5." are the same citation.
function refKey(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/[[\]()]/g, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

// House style is a spaced hyphen, never an em dash.
function dashes(text: string): string {
  return text.replace(/\s*—\s*/g, " - ");
}

export const draftClaim = action({
  args: { caseId: v.id("cases") },
  returns: v.id("letters"),
  handler: async (ctx, args): Promise<Id<"letters">> => {
    const claim: Doc<"cases"> | null = await ctx.runQuery(
      internal.clauses.caseById,
      { caseId: args.caseId },
    );
    if (!claim) throw new Error("Case not found");

    const [vector] = await embed([
      `${claim.narrative} refund remedy entitlement ${claim.counterparty}`,
    ]);
    const hits = await ctx.vectorSearch("clauses", "by_embedding", {
      vector,
      filter: (q) => q.eq("caseId", args.caseId),
      limit: 12,
    });
    const clauses: Array<Doc<"clauses">> = await ctx.runQuery(
      internal.clauses.byIds,
      { ids: hits.map((h) => h._id) },
    );
    if (clauses.length === 0) {
      throw new Error(
        "No clauses have been extracted for this case yet. Run the policy scan first.",
      );
    }

    const supporting = clauses.filter((c) => c.favourable);
    const against = clauses.filter((c) => !c.favourable);

    const material = [
      "PROVISIONS THAT SUPPORT THE CLAIM:",
      ...supporting.map((c) => `[${c.ref}] ${c.heading}\n${c.text}`),
      "",
      "PROVISIONS THEY MAY QUOTE BACK TO REFUSE:",
      ...against.map((c) => `[${c.ref}] ${c.heading}\n${c.text}`),
    ].join("\n\n");

    const facts = [
      `Company: ${claim.counterparty}`,
      `What happened, in the claimant's words: ${claim.narrative}`,
      claim.amountClaimed !== undefined
        ? `Amount sought: ${claim.currency} ${claim.amountClaimed.toFixed(2)}`
        : "Amount sought: not specified by the claimant",
      claim.jurisdiction ? `Jurisdiction: ${claim.jurisdiction}` : "",
      claim.claimantName
        ? `Sign the letter as: ${claim.claimantName}`
        : "The claimant's name is not on file. End after the closing line with no signature block, rather than writing a placeholder.",
    ]
      .filter(Boolean)
      .join("\n");

    const draft = await completeJson<Draft>({
      model: MODELS.draft,
      system: DRAFT_SYSTEM,
      user: `${facts}\n\n--- MATERIAL FROM THEIR OWN PUBLISHED POLICIES ---\n${material}`,
      maxTokens: 2000,
    });

    if (!draft?.body?.trim() || !draft?.subject?.trim()) {
      throw new Error("The model returned an incomplete letter");
    }

    // Map the refs the model says it cited back to real clause ids, so the UI
    // can show the source next to each citation. A ref the model invented
    // simply finds no match and is dropped rather than displayed as sourced.
    const byRef = new Map(clauses.map((c) => [refKey(c.ref), c._id]));
    const citedClauseIds: Array<Id<"clauses">> = [];
    for (const ref of draft.citedRefs ?? []) {
      const id = byRef.get(refKey(ref));
      if (id && !citedClauseIds.includes(id)) citedClauseIds.push(id);
    }

    return await ctx.runMutation(internal.letters.store, {
      caseId: args.caseId,
      kind: "claim",
      subject: dashes(draft.subject.trim()).slice(0, 200),
      body: dashes(draft.body.trim()),
      citedClauseIds,
    });
  },
});

const FOLLOWUP_SYSTEM = `You write the next letter in an ongoing consumer claim by email.

Return JSON: { "subject": string, "body": string, "citedRefs": string[] }

You are given the original claim, everything already sent, and what the company said back. Write the next letter only.

Rules:
- Do not restate the whole history. Reference it in a clause and move forward.
- If they asked the claimant for information, say plainly which items the claimant still needs to supply. Never invent an order number, a date, or a card detail to satisfy them.
- If they raised a limit or exclusion, answer it once, using the supplied provisions.
- Keep the reference numbers exactly as supplied. Never invent one.
- Shorter than the first letter. Four to eight sentences.
- Calm and factual. Escalation comes from stating consequences plainly, never from tone.
- No placeholder text. The letter must be sendable exactly as written.
- Use a spaced hyphen rather than an em dash.`;

export const draftFollowUp = internalAction({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.id("letters")),
  handler: async (ctx, args): Promise<Id<"letters"> | null> => {
    const claim: Doc<"cases"> | null = await ctx.runQuery(
      internal.clauses.caseById,
      { caseId: args.caseId },
    );
    if (!claim) return null;

    const rung = LADDER[Math.min(claim.stage, LADDER.length - 1)];

    const history: Array<Doc<"letters">> = await ctx.runQuery(
      internal.letters.sentForCase,
      { caseId: args.caseId },
    );
    const lastReply: Doc<"replies"> | null = await ctx.runQuery(
      internal.replies.latest,
      { caseId: args.caseId },
    );

    const [vector] = await embed([
      `${claim.narrative} ${lastReply?.summary ?? ""} ${rung.instruction}`,
    ]);
    const hits = await ctx.vectorSearch("clauses", "by_embedding", {
      vector,
      filter: (q) => q.eq("caseId", args.caseId),
      limit: 8,
    });
    const clauses: Array<Doc<"clauses">> = await ctx.runQuery(
      internal.clauses.byIds,
      { ids: hits.map((h) => h._id) },
    );

    const timeline = [
      `Company: ${claim.counterparty}`,
      `The original claim: ${claim.narrative}`,
      claim.amountClaimed !== undefined
        ? `Amount sought: ${claim.currency} ${claim.amountClaimed.toFixed(2)}`
        : "",
      claim.claimantName ? `Sign the letter as: ${claim.claimantName}` : "",
      "",
      "ALREADY SENT:",
      ...history.map(
        (l) =>
          `${l.sentAt ? new Date(l.sentAt).toISOString().slice(0, 10) : "undated"} - ${l.subject}`,
      ),
      "",
      lastReply
        ? `THEIR LAST REPLY (${lastReply.disposition}): ${lastReply.summary}${
            lastReply.missingInfo.length
              ? `\nThey asked the claimant to supply: ${lastReply.missingInfo.join(", ")}`
              : ""
          }`
        : "THEY HAVE NOT REPLIED AT ALL.",
      "",
      `WRITE THIS LETTER: ${rung.instruction}`,
    ]
      .filter(Boolean)
      .join("\n");

    const material = clauses
      .map((c) => `[${c.ref}] ${c.heading}\n${c.text}`)
      .join("\n\n");

    const draft = await completeJson<Draft>({
      model: MODELS.draft,
      system: FOLLOWUP_SYSTEM,
      user: `${timeline}\n\n--- PROVISIONS AVAILABLE ---\n${material}`,
      maxTokens: 1600,
    });

    if (!draft?.body?.trim() || !draft?.subject?.trim()) return null;

    const byRef = new Map(clauses.map((c) => [refKey(c.ref), c._id]));
    const citedClauseIds: Array<Id<"clauses">> = [];
    for (const ref of draft.citedRefs ?? []) {
      const id = byRef.get(refKey(ref));
      if (id && !citedClauseIds.includes(id)) citedClauseIds.push(id);
    }

    const letterId: Id<"letters"> = await ctx.runMutation(
      internal.letters.store,
      {
        caseId: args.caseId,
        kind: rung.kind,
        subject: dashes(draft.subject.trim()).slice(0, 200),
        body: dashes(draft.body.trim()),
        citedClauseIds,
      },
    );

    await ctx.runMutation(internal.chase.advance, { caseId: args.caseId });
    return letterId;
  },
});
