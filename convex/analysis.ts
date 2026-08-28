"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { MODELS, completeJson } from "./lib/llm";

const READ_SYSTEM = `You read a company's reply to a consumer claim and report what they actually committed to.

Return JSON: { "disposition": string, "offeredAmount": number | null, "missingInfo": string[], "summary": string }

"disposition" is exactly one of:
- "accepted": they agreed to the full remedy sought.
- "partial": they offered something less than what was claimed. A voucher, a partial sum, a goodwill gesture.
- "refused": they declined. Includes a refusal wrapped in an apology.
- "info_requested": they will not decide until the claimant supplies something.
- "acknowledged": a receipt or holding reply with no decision. "We're looking into this."
- "unclear": genuinely cannot tell.

Rules:
- Read what they committed to, not how warmly they said it. Sympathetic language around a refusal is still "refused". "We're sorry you feel that way" concedes nothing.
- An offer conditional on the claimant dropping the rest is "partial", not "accepted".
- "offeredAmount" is a plain number in the same currency as the claim, or null. A voucher is an amount. Never guess a figure that is not stated.
- "missingInfo" lists exactly what they asked the claimant to supply, one short phrase each: "order number", "last four digits of the card", "proof of purchase". Empty array if they asked for nothing.
- "summary" is one sentence, factual, no more than twenty words.
- An automated out-of-office or "your ticket has been created" is "acknowledged".`;

type Reading = {
  disposition: string;
  offeredAmount: number | null;
  missingInfo: Array<string>;
  summary: string;
};

const KNOWN = new Set([
  "accepted",
  "partial",
  "refused",
  "info_requested",
  "acknowledged",
  "unclear",
]);

export const readReply = internalAction({
  args: {
    caseId: v.id("cases"),
    messageId: v.string(),
    from: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.runQuery(internal.clauses.caseById, {
      caseId: args.caseId,
    });

    const context = [
      `The claim: ${claim?.narrative ?? "unknown"}`,
      claim?.amountClaimed !== undefined
        ? `Amount sought: ${claim.currency} ${claim.amountClaimed}`
        : "",
      `They replied from: ${args.from}`,
    ]
      .filter(Boolean)
      .join("\n");

    let reading: Reading;
    try {
      reading = await completeJson<Reading>({
        model: MODELS.extract,
        system: READ_SYSTEM,
        user: `${context}\n\n--- THEIR REPLY ---\n${args.body.slice(0, 12_000)}`,
        maxTokens: 800,
      });
    } catch (error) {
      // A reply we cannot read is still a reply. Record it as unclear so the
      // case advances and a human sees it, rather than losing it.
      reading = {
        disposition: "unclear",
        offeredAmount: null,
        missingInfo: [],
        summary: `Could not read this reply automatically: ${
          error instanceof Error ? error.message : String(error)
        }`.slice(0, 200),
      };
    }

    const disposition = KNOWN.has(reading?.disposition)
      ? (reading.disposition as
          | "accepted"
          | "partial"
          | "refused"
          | "info_requested"
          | "acknowledged"
          | "unclear")
      : "unclear";

    await ctx.runMutation(internal.replies.store, {
      caseId: args.caseId,
      messageId: args.messageId,
      from: args.from,
      body: args.body.slice(0, 20_000),
      disposition,
      offeredAmount:
        typeof reading?.offeredAmount === "number" && reading.offeredAmount >= 0
          ? reading.offeredAmount
          : undefined,
      missingInfo: Array.isArray(reading?.missingInfo)
        ? reading.missingInfo.map((m) => String(m).slice(0, 120)).slice(0, 10)
        : [],
      summary: String(reading?.summary ?? "").slice(0, 300) || "Reply received",
    });

    return null;
  },
});
