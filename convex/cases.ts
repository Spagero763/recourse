import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { caseStatus } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;

function hostFrom(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export const open = mutation({
  args: {
    title: v.string(),
    claimantName: v.optional(v.string()),
    counterparty: v.string(),
    counterpartySite: v.optional(v.string()),
    counterpartyEmail: v.optional(v.string()),
    narrative: v.string(),
    amountClaimed: v.optional(v.number()),
    currency: v.optional(v.string()),
    jurisdiction: v.optional(v.string()),
  },
  returns: v.id("cases"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const caseId = await ctx.db.insert("cases", {
      title: args.title,
      claimantName: args.claimantName,
      counterparty: args.counterparty,
      counterpartyDomain: args.counterpartySite
        ? hostFrom(args.counterpartySite)
        : undefined,
      counterpartyEmail: args.counterpartyEmail,
      narrative: args.narrative,
      amountClaimed: args.amountClaimed,
      currency: args.currency ?? "GBP",
      jurisdiction: args.jurisdiction,
      status: "drafting",
      stage: 0,
      openedAt: now,
      lastActivityAt: now,
    });

    await ctx.db.insert("caseEvents", {
      caseId,
      kind: "opened",
      detail: `Claim opened against ${args.counterparty}`,
      at: now,
    });

    return caseId;
  },
});

export const get = query({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args) => ctx.db.get(args.caseId),
});

export const list = query({
  args: { status: v.optional(caseStatus) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      return await ctx.db
        .query("cases")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("cases")
      .withIndex("by_activity")
      .order("desc")
      .take(100);
  },
});

export const timeline = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: (ctx, args) =>
    ctx.db
      .query("caseEvents")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .order("desc")
      .take(200),
});

export const logEvent = internalMutation({
  args: { caseId: v.id("cases"), kind: v.string(), detail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: args.kind,
      detail: args.detail,
      at: now,
    });
    await ctx.db.patch(args.caseId, { lastActivityAt: now });
    return null;
  },
});

export const setStatus = internalMutation({
  args: {
    caseId: v.id("cases"),
    status: caseStatus,
    // Days of silence tolerated before the chase fires. Omit to clear it.
    nudgeInDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.caseId, {
      status: args.status,
      lastActivityAt: Date.now(),
      nextNudgeAt:
        args.nudgeInDays === undefined
          ? undefined
          : Date.now() + args.nudgeInDays * DAY,
    });
    return null;
  },
});

export const byId = internalMutation({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args): Promise<Doc<"cases"> | null> => ctx.db.get(args.caseId),
});

export const attachInbox = internalMutation({
  args: {
    caseId: v.id("cases"),
    inboxId: v.string(),
    inboxAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.caseId, {
      inboxId: args.inboxId,
      inboxAddress: args.inboxAddress,
    });
    return null;
  },
});

export const findByThread = internalMutation({
  args: { threadId: v.string() },
  returns: v.union(v.null(), v.id("cases")),
  handler: async (ctx, args): Promise<Id<"cases"> | null> => {
    const match = await ctx.db
      .query("cases")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    return match?._id ?? null;
  },
});

// Deleting a claim takes its evidence and correspondence record with it. The
// email threads themselves live in AgentMail and are unaffected.
export const remove = mutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const table of [
      "policies",
      "clauses",
      "letters",
      "replies",
      "attachments",
      "caseEvents",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.caseId);
    return null;
  },
});

// A claim is written from memory, so the details get corrected as the claimant
// remembers them. Editing the narrative does not invalidate evidence already
// gathered; re-running the scan is a separate, deliberate act.
export const edit = mutation({
  args: {
    caseId: v.id("cases"),
    title: v.optional(v.string()),
    claimantName: v.optional(v.string()),
    narrative: v.optional(v.string()),
    counterpartyEmail: v.optional(v.string()),
    amountClaimed: v.optional(v.number()),
    jurisdiction: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.caseId);
    if (!claim) throw new Error("Case not found");

    const { caseId, ...fields } = args;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch(caseId, { ...patch, lastActivityAt: Date.now() });
    return null;
  },
});

// Settling is the point of the whole exercise, so it is a first-class action
// rather than a status edit. Recording what actually came back matters: the
// amount recovered is the only number that proves the tool did anything.
export const resolve = mutation({
  args: { caseId: v.id("cases"), settledAmount: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.caseId);
    if (!claim) throw new Error("Case not found");

    const settled = args.settledAmount ?? claim.amountClaimed;
    const now = Date.now();
    await ctx.db.patch(args.caseId, {
      status: "resolved",
      settledAmount: settled,
      nextNudgeAt: undefined,
      lastActivityAt: now,
    });
    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "resolved",
      detail:
        settled !== undefined
          ? `Settled for ${claim.currency} ${settled.toFixed(2)}`
          : "Marked as settled",
      at: now,
    });
    return null;
  },
});

// Closing is giving up, or taking it elsewhere. Distinct from resolving, and
// it stops the chase either way.
export const close = mutation({
  args: { caseId: v.id("cases"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.caseId, {
      status: "closed",
      nextNudgeAt: undefined,
      lastActivityAt: now,
    });
    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "closed",
      detail: args.reason?.trim() || "Closed without a settlement",
      at: now,
    });
    return null;
  },
});

export const reopen = mutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.caseId, {
      status: "negotiating",
      settledAmount: undefined,
      lastActivityAt: now,
      nextNudgeAt: now + 5 * DAY,
    });
    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "reopened",
      detail: "Claim reopened",
      at: now,
    });
    return null;
  },
});
