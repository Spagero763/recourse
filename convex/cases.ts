import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { caseStatus } from "./schema";
import { Doc, Id } from "./_generated/dataModel";

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
