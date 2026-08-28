import { v } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const agentmail = new AgentMail(components.agentmail);

// @agentmail/convex 0.1.0 types its ctx against convex ^1.24, before runQuery
// and runMutation took an options argument. Structurally compatible, so every
// call into the client goes through here rather than casting at each site.
const mail = (ctx: unknown) => ctx as never;

const DAY = 24 * 60 * 60 * 1000;

export const store = internalMutation({
  args: {
    caseId: v.id("cases"),
    kind: v.union(
      v.literal("claim"),
      v.literal("followup"),
      v.literal("escalation"),
      v.literal("reply"),
    ),
    subject: v.string(),
    body: v.string(),
    citedClauseIds: v.array(v.id("clauses")),
  },
  returns: v.id("letters"),
  handler: async (ctx, args): Promise<Id<"letters">> => {
    const letterId = await ctx.db.insert("letters", {
      caseId: args.caseId,
      kind: args.kind,
      subject: args.subject,
      body: args.body,
      citedClauseIds: args.citedClauseIds,
      status: "draft",
    });

    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "letter_drafted",
      detail: `${args.kind} drafted, citing ${args.citedClauseIds.length} provisions`,
      at: Date.now(),
    });
    await ctx.db.patch(args.caseId, { lastActivityAt: Date.now() });

    return letterId;
  },
});

export const revise = mutation({
  args: {
    letterId: v.id("letters"),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter = await ctx.db.get(args.letterId);
    if (!letter) throw new Error("Letter not found");
    if (letter.status !== "draft") {
      throw new Error("Only a draft can be edited");
    }
    await ctx.db.patch(args.letterId, {
      subject: args.subject ?? letter.subject,
      body: args.body ?? letter.body,
    });
    return null;
  },
});

// The approval gate. Nothing reaches a counterparty without passing here.
export const approveAndSend = mutation({
  args: { letterId: v.id("letters"), to: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter = await ctx.db.get(args.letterId);
    if (!letter) throw new Error("Letter not found");
    if (letter.status !== "draft") {
      throw new Error(`This letter is already ${letter.status}`);
    }

    const claim = await ctx.db.get(letter.caseId);
    if (!claim) throw new Error("Case not found");

    const recipient = args.to ?? claim.counterpartyEmail;
    if (!recipient) {
      throw new Error("No recipient address is set for this case");
    }

    await ctx.db.patch(args.letterId, {
      status: "approved",
      approvedAt: Date.now(),
    });
    if (args.to && args.to !== claim.counterpartyEmail) {
      await ctx.db.patch(letter.caseId, { counterpartyEmail: args.to });
    }

    await ctx.scheduler.runAfter(0, internal.letters.deliver, {
      letterId: args.letterId,
      to: recipient,
    });
    return null;
  },
});

export const deliver = internalAction({
  args: { letterId: v.id("letters"), to: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter: Doc<"letters"> | null = await ctx.runQuery(
      internal.letters.byId,
      { letterId: args.letterId },
    );
    if (!letter) return null;

    const inboxId: string = await ctx.runAction(internal.letters.ensureInbox, {
      caseId: letter.caseId,
    });

    try {
      const outboundId = await agentmail.sendMessage(mail(ctx), inboxId, {
        to: args.to,
        subject: letter.subject,
        text: letter.body,
        labels: ["claim", letter.kind],
      });

      await ctx.runMutation(internal.letters.markSent, {
        letterId: args.letterId,
        outboundId: String(outboundId),
      });

      // The thread id lands with the send confirmation rather than the call,
      // so capture it shortly after and bind the case to that thread.
      await ctx.scheduler.runAfter(15_000, internal.letters.bindThread, {
        letterId: args.letterId,
        outboundId: String(outboundId),
      });
    } catch (error) {
      await ctx.runMutation(internal.letters.markFailed, {
        letterId: args.letterId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  },
});

export const ensureInbox = internalAction({
  args: { caseId: v.id("cases") },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const claim: Doc<"cases"> | null = await ctx.runQuery(
      internal.clauses.caseById,
      { caseId: args.caseId },
    );
    if (claim?.inboxId) return claim.inboxId;

    // AgentMail's free tier allows three inboxes, so the app shares one and
    // separates cases by thread rather than by address.
    const existing = await agentmail.listInboxes(mail(ctx), {});
    const inboxes = (existing as { inboxes?: Array<{ inbox_id?: string; address?: string }> })
      ?.inboxes ?? [];
    const found = inboxes[0];

    let inboxId = found?.inbox_id;
    let address = found?.address;
    if (!inboxId) {
      const created = await agentmail.createInbox(mail(ctx), {
        username: "claims",
        displayName: "Recourse Claims",
      });
      const shaped = created as { inbox_id?: string; address?: string };
      inboxId = shaped.inbox_id;
      address = shaped.address;
    }
    if (!inboxId) throw new Error("Could not obtain an AgentMail inbox");

    await ctx.runMutation(internal.cases.attachInbox, {
      caseId: args.caseId,
      inboxId,
      inboxAddress: address ?? inboxId,
    });
    return inboxId;
  },
});

export const bindThread = internalAction({
  args: { letterId: v.id("letters"), outboundId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await agentmail.status(mail(ctx), args.outboundId as never);
    const threadId = (state as { threadId?: string })?.threadId;
    if (!threadId) return null;

    await ctx.runMutation(internal.letters.attachThread, {
      letterId: args.letterId,
      threadId,
    });
    return null;
  },
});

export const attachThread = internalMutation({
  args: { letterId: v.id("letters"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter = await ctx.db.get(args.letterId);
    if (!letter) return null;
    await ctx.db.patch(letter.caseId, { threadId: args.threadId });
    return null;
  },
});

export const markSent = internalMutation({
  args: { letterId: v.id("letters"), outboundId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter = await ctx.db.get(args.letterId);
    if (!letter) return null;

    const now = Date.now();
    await ctx.db.patch(args.letterId, { status: "sent", sentAt: now });
    await ctx.db.patch(letter.caseId, {
      status: "awaiting_reply",
      lastActivityAt: now,
      // Silence past this point is the signal to chase.
      nextNudgeAt: now + 7 * DAY,
    });
    await ctx.db.insert("caseEvents", {
      caseId: letter.caseId,
      kind: "letter_sent",
      detail: letter.subject,
      at: now,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { letterId: v.id("letters"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const letter = await ctx.db.get(args.letterId);
    if (!letter) return null;

    await ctx.db.patch(args.letterId, { status: "failed", error: args.error });
    await ctx.db.insert("caseEvents", {
      caseId: letter.caseId,
      kind: "send_failed",
      detail: args.error,
      at: Date.now(),
    });
    return null;
  },
});

export const byId = internalQuery({
  args: { letterId: v.id("letters") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args): Promise<Doc<"letters"> | null> =>
    ctx.db.get(args.letterId),
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: (ctx, args) =>
    ctx.db
      .query("letters")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .order("desc")
      .collect(),
});

export const pendingApproval = query({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args) =>
    ctx.db
      .query("letters")
      .withIndex("by_case_status", (q) =>
        q.eq("caseId", args.caseId).eq("status", "draft"),
      )
      .order("desc")
      .first(),
});
