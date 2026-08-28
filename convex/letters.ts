import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import * as agentmail from "./lib/agentmail";

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
      // A reply belongs on the thread it answers. Sending it as a fresh email
      // would start a second conversation the counterparty has to reconcile,
      // and would lose the quoted history they are working from.
      const parent =
        letter.kind === "reply"
          ? await ctx.runQuery(internal.replies.latestMessageId, {
              caseId: letter.caseId,
            })
          : null;

      const files = parent
        ? await encodeAttachments(
            await ctx.runQuery(internal.letters.attachmentsFor, {
              caseId: letter.caseId,
            }),
          )
        : [];

      const sent = parent
        ? await agentmail.replyToMessage(inboxId, parent, {
            text: letter.body,
            labels: ["claim", letter.kind],
            attachments: files,
          })
        : await agentmail.sendMessage(inboxId, {
            to: args.to,
            subject: letter.subject,
            text: letter.body,
            labels: ["claim", letter.kind],
          });

      await ctx.runMutation(internal.letters.markSent, {
        letterId: args.letterId,
        outboundId: sent.message_id ?? "",
      });

      // The send response carries the thread, so the case binds to it
      // immediately and any reply routes home on the first webhook.
      if (sent.thread_id) {
        await ctx.runMutation(internal.letters.attachThread, {
          letterId: args.letterId,
          threadId: sent.thread_id,
        });
      }
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
    // separates cases by thread rather than by address. Which one matters:
    // the inbox's display name is the sender a claims handler sees, and an
    // unconfigured inbox sends as "AgentMail", which reads as bulk mail.
    const existing = await agentmail.listInboxes();
    const preferred = env.AGENTMAIL_INBOX_ID;
    const found =
      (preferred ? existing.find((i) => i.inbox_id === preferred) : undefined) ??
      existing[0];

    let inboxId = found?.inbox_id;
    let address = found?.email;
    if (!inboxId) {
      const created = await agentmail.createInbox({
        username: "claims",
        displayName: "Recourse Claims",
      });
      inboxId = created.inbox_id;
      address = created.email;
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

export const sentForCase = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"letters">>> => {
    const rows = await ctx.db
      .query("letters")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    return rows.filter((l) => l.status === "sent");
  },
});

// Queries cannot read blobs, only mint URLs for them, so the bytes are
// fetched in the action that sends.
export const attachmentsFor = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.array(v.object({ filename: v.string(), url: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();

    const out: Array<{ filename: string; url: string }> = [];
    for (const row of rows) {
      const url = await ctx.storage.getUrl(row.storageId);
      if (url) out.push({ filename: row.filename, url });
    }
    return out;
  },
});

// Evidence goes out as base64 alongside the reply. Budgeted deliberately: a
// claims handler is not helped by a 20MB scan and the API will reject it.
async function encodeAttachments(
  files: Array<{ filename: string; url: string }>,
): Promise<Array<{ filename: string; content: string }>> {
  const out: Array<{ filename: string; content: string }> = [];
  let budget = 6_000_000;
  for (const file of files) {
    try {
      const response = await fetch(file.url);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > budget) continue;
      budget -= bytes.byteLength;

      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      out.push({ filename: file.filename, content: btoa(binary) });
    } catch {
      // One unreadable file should not stop the reply going out.
      continue;
    }
  }
  return out;
}
