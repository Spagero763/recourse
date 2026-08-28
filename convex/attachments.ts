import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const uploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

// Counterparties routinely ask for proof before they will decide anything, so
// evidence has to live on the case rather than in the claimant's downloads.
export const attach = mutation({
  args: {
    caseId: v.id("cases"),
    storageId: v.id("_storage"),
    filename: v.string(),
    label: v.optional(v.string()),
  },
  returns: v.id("attachments"),
  handler: async (ctx, args): Promise<Id<"attachments">> => {
    const now = Date.now();
    const id = await ctx.db.insert("attachments", {
      caseId: args.caseId,
      storageId: args.storageId,
      filename: args.filename.slice(0, 200),
      label: (args.label ?? "").slice(0, 120) || "Evidence",
      uploadedAt: now,
    });

    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "evidence_added",
      detail: args.filename.slice(0, 120),
      at: now,
    });
    await ctx.db.patch(args.caseId, { lastActivityAt: now });
    return id;
  },
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    return await Promise.all(
      rows.map(async (a) => ({
        ...a,
        url: await ctx.storage.getUrl(a.storageId),
      })),
    );
  },
});

export const remove = mutation({
  args: { attachmentId: v.id("attachments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row) return null;
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.attachmentId);
    return null;
  },
});

export const listForCase = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: (ctx, args): Promise<Array<Doc<"attachments">>> =>
    ctx.db
      .query("attachments")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect(),
});
