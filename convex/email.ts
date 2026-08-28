import { v } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { internalMutation, query } from "./_generated/server";
import { components } from "./_generated/api";

const agentmail = new AgentMail(components.agentmail);

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const threadId: string | undefined = args.message?.thread_id;
    if (!threadId) return null;

    const claim = await ctx.db
      .query("cases")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();

    // Mail can arrive on a thread we never opened, or before the outbound
    // send has been recorded. Dropping it is correct: the component keeps
    // the message either way, so nothing is lost.
    if (!claim) return null;

    const from: string = args.message?.from ?? "unknown sender";
    const now = Date.now();

    await ctx.db.insert("caseEvents", {
      caseId: claim._id,
      kind: "reply_received",
      detail: `Reply from ${from}`,
      at: now,
    });

    await ctx.db.patch(claim._id, {
      status: "negotiating",
      lastActivityAt: now,
      // A reply resets the chase clock; the analyser sets the next one.
      nextNudgeAt: undefined,
    });

    return null;
  },
});

export const thread = query({
  args: { threadId: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    ctx.runQuery(components.agentmail.lib.listInboundMessages, {
      threadId: args.threadId,
    }),
});

export const inbox = query({
  args: { inboxId: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    ctx.runQuery(components.agentmail.lib.listInboundMessages, {
      inboxId: args.inboxId,
    }),
});
