import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { disposition } from "./schema";
import type { Doc } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;

// What each reading of a reply means for the case: where it goes next, and how
// long we wait before chasing. Undefined days means stop chasing entirely.
const OUTCOMES: Record<
  string,
  { status: Doc<"cases">["status"]; nudgeInDays?: number; note: string }
> = {
  accepted: { status: "resolved", note: "They agreed to the remedy" },
  partial: {
    status: "negotiating",
    nudgeInDays: 5,
    note: "They offered less than was claimed",
  },
  refused: {
    status: "negotiating",
    nudgeInDays: 3,
    note: "They refused, so the next letter escalates",
  },
  info_requested: {
    status: "negotiating",
    nudgeInDays: 5,
    note: "They asked for information before deciding",
  },
  acknowledged: {
    status: "awaiting_reply",
    nudgeInDays: 5,
    note: "Acknowledged without a decision",
  },
  unclear: {
    status: "negotiating",
    nudgeInDays: 5,
    note: "Reply could not be read confidently",
  },
};

export const store = internalMutation({
  args: {
    caseId: v.id("cases"),
    messageId: v.string(),
    from: v.string(),
    body: v.string(),
    disposition,
    offeredAmount: v.optional(v.number()),
    missingInfo: v.array(v.string()),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const seen = await ctx.db
      .query("replies")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (seen) return null;

    const now = Date.now();
    await ctx.db.insert("replies", {
      caseId: args.caseId,
      messageId: args.messageId,
      from: args.from,
      body: args.body,
      receivedAt: now,
      disposition: args.disposition,
      offeredAmount: args.offeredAmount,
      missingInfo: args.missingInfo,
      summary: args.summary,
    });

    const outcome = OUTCOMES[args.disposition] ?? OUTCOMES.unclear;
    const claim = await ctx.db.get(args.caseId);

    await ctx.db.patch(args.caseId, {
      status: outcome.status,
      lastActivityAt: now,
      nextNudgeAt:
        outcome.nudgeInDays === undefined
          ? undefined
          : now + outcome.nudgeInDays * DAY,
      settledAmount:
        args.disposition === "accepted"
          ? (args.offeredAmount ?? claim?.amountClaimed)
          : args.disposition === "partial"
            ? args.offeredAmount
            : claim?.settledAmount,
    });

    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: `reply_${args.disposition}`,
      detail: args.summary,
      at: now,
    });

    return null;
  },
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: (ctx, args) =>
    ctx.db
      .query("replies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .order("desc")
      .collect(),
});

export const latest = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args): Promise<Doc<"replies"> | null> =>
    ctx.db
      .query("replies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .order("desc")
      .first(),
});
