import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";

function textOf(message: unknown): string {
  const m = message as { text?: string; html?: string; preview?: string };
  if (typeof m?.text === "string" && m.text.trim()) return m.text;
  if (typeof m?.html === "string" && m.html.trim()) {
    return m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return typeof m?.preview === "string" ? m.preview : "";
}

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

    // Mail can arrive on a thread we never opened. The component keeps the
    // message regardless, so dropping it here loses nothing.
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
      // A reply resets the chase clock; reading it sets the next one.
      nextNudgeAt: undefined,
    });

    const body = textOf(args.message);
    if (body.trim()) {
      await ctx.scheduler.runAfter(0, internal.analysis.readReply, {
        caseId: claim._id,
        messageId: String(args.message?.message_id ?? args.eventId),
        from,
        body,
      });
    }

    return null;
  },
});

// A claim sent to a dead address leaves the case looking healthy while nothing
// is happening, which is the worst failure mode for a tool that promises to
// chase on your behalf. Delivery failures stop the clock and say so.
export const onDeliveryFailed = internalMutation({
  args: {
    threadId: v.optional(v.string()),
    kind: v.union(
      v.literal("bounced"),
      v.literal("rejected"),
      v.literal("complained"),
    ),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.threadId) return null;
    const claim = await ctx.db
      .query("cases")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId!))
      .unique();
    if (!claim) return null;

    const explanation =
      args.kind === "complained"
        ? "They marked the claim as spam. Chasing has stopped."
        : `Delivery failed (${args.kind}). The address may be wrong, so nothing has reached them.`;

    await ctx.db.patch(claim._id, {
      // Never keep chasing an address that bounced or a recipient who
      // complained: the first is pointless, the second is not ours to ignore.
      status: "closed",
      lastActivityAt: Date.now(),
      nextNudgeAt: undefined,
    });

    await ctx.db.insert("caseEvents", {
      caseId: claim._id,
      kind: `delivery_${args.kind}`,
      detail: args.detail ? `${explanation} ${args.detail}` : explanation,
      at: Date.now(),
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
