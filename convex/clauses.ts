import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const store = internalMutation({
  args: {
    caseId: v.id("cases"),
    policyId: v.id("policies"),
    sourceUrl: v.string(),
    clauses: v.array(
      v.object({
        ref: v.string(),
        heading: v.string(),
        text: v.string(),
        favourable: v.boolean(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clauses")
      .withIndex("by_policy", (q) => q.eq("policyId", args.policyId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const clause of args.clauses) {
      await ctx.db.insert("clauses", {
        policyId: args.policyId,
        caseId: args.caseId,
        ref: clause.ref,
        heading: clause.heading,
        text: clause.text,
        sourceUrl: args.sourceUrl,
        favourable: clause.favourable,
        embedding: clause.embedding,
      });
    }
    return null;
  },
});

export const byIds = internalQuery({
  args: { ids: v.array(v.id("clauses")) },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"clauses">>> => {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return rows.filter((r): r is Doc<"clauses"> => r !== null);
  },
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clauses")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    // Embeddings are large and the UI never reads them.
    return rows.map(({ embedding, ...rest }) => rest);
  },
});

export const policiesFor = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: (ctx, args): Promise<Array<Doc<"policies">>> =>
    ctx.db
      .query("policies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect(),
});

export const policyById = internalQuery({
  args: { policyId: v.id("policies") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args): Promise<Doc<"policies"> | null> =>
    ctx.db.get(args.policyId),
});

export const caseById = internalQuery({
  args: { caseId: v.id("cases") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args): Promise<Doc<"cases"> | null> => ctx.db.get(args.caseId),
});
