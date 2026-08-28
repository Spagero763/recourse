"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MODELS, chunk, completeJson, embed } from "./lib/llm";

const EXTRACT_SYSTEM = `You read consumer policy documents and statutes and pull out the individual provisions a claim can be argued from.

Return JSON: { "clauses": [ { "ref": string, "heading": string, "text": string, "favourable": boolean } ] }

Rules:
- "ref" is the document's own reference for the provision: "7.3", "Section 4", "Article 5(1)(c)", "Clause 12". If the document numbers nothing, use a short quoted anchor phrase instead. Never invent a number that is not in the text.
- "text" is the provision quoted verbatim from the source, trimmed to the operative sentence or two. Do not paraphrase. A claim that misquotes the policy is worse than no claim.
- "favourable" is true when the provision supports a consumer seeking a remedy, and false when it is the provision the company will quote back to refuse one (exclusions, time limits, conditions, liability caps).
- Extract both kinds. Knowing what will be used against the claim is as useful as knowing what supports it.
- Skip boilerplate: privacy notices, cookie text, marketing copy, contact details, navigation.
- If the excerpt contains nothing citable, return an empty array. Do not pad.
- Return at most 12 clauses per excerpt, the most load-bearing ones.`;

type Extracted = {
  clauses: Array<{
    ref: string;
    heading: string;
    text: string;
    favourable: boolean;
  }>;
};

async function extractOne(
  ctx: ActionCtx,
  policyId: Id<"policies">,
  caseId: Id<"cases">,
): Promise<number> {
  const document: Doc<"policies"> | null = await ctx.runQuery(
    internal.clauses.policyById,
    { policyId },
  );
  if (!document) return 0;

  const claim: Doc<"cases"> | null = await ctx.runQuery(
    internal.clauses.caseById,
    { caseId },
  );
  if (!claim) return 0;

  const context = [
    `The consumer's account of what happened: ${claim.narrative}`,
    claim.jurisdiction ? `Jurisdiction: ${claim.jurisdiction}` : "",
    `Document: ${document.title} (${document.kind}) from ${document.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const found: Extracted["clauses"] = [];
  let firstFailure: string | undefined;
  for (const excerpt of chunk(document.markdown)) {
    try {
      const result = await completeJson<Extracted>({
        model: MODELS.extract,
        system: EXTRACT_SYSTEM,
        user: `${context}\n\n--- DOCUMENT EXCERPT ---\n${excerpt}`,
      });
      if (Array.isArray(result?.clauses)) found.push(...result.clauses);
    } catch (error) {
      // One bad excerpt should not lose the rest of the document, but a
      // configuration fault fails every excerpt identically and must not be
      // reported as "this policy had nothing in it".
      firstFailure ??= error instanceof Error ? error.message : String(error);
      continue;
    }
  }
  if (found.length === 0 && firstFailure) {
    throw new Error(`Extraction failed for ${document.url}: ${firstFailure}`);
  }

  const usable = found.filter(
    (c) => c && typeof c.text === "string" && c.text.trim().length > 20,
  );
  if (usable.length === 0) return 0;

  const vectors = await embed(usable.map((c) => `${c.heading}\n${c.text}`));

  await ctx.runMutation(internal.clauses.store, {
    caseId,
    policyId,
    sourceUrl: document.url,
    clauses: usable.map((c, i) => ({
      ref: String(c.ref ?? "").slice(0, 40) || "unnumbered",
      heading: String(c.heading ?? "").slice(0, 200),
      text: c.text.trim().slice(0, 4000),
      favourable: Boolean(c.favourable),
      embedding: vectors[i],
    })),
  });

  return usable.length;
}

export const extractForCase = action({
  args: { caseId: v.id("cases") },
  returns: v.object({ extracted: v.number(), documents: v.number() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ extracted: number; documents: number }> => {
    const documents: Array<Doc<"policies">> = await ctx.runQuery(
      internal.clauses.policiesFor,
      { caseId: args.caseId },
    );
    if (documents.length === 0) {
      throw new Error("No policy documents have been read for this case yet");
    }

    let total = 0;
    for (const document of documents) {
      total += await extractOne(ctx, document._id, args.caseId);
    }

    await ctx.runMutation(internal.cases.logEvent, {
      caseId: args.caseId,
      kind: "clauses_extracted",
      detail: `Pulled ${total} citable provisions from ${documents.length} documents`,
    });

    return { extracted: total, documents: documents.length };
  },
});

export const extractFromPolicy = internalAction({
  args: { policyId: v.id("policies"), caseId: v.id("cases") },
  returns: v.number(),
  handler: (ctx, args) => extractOne(ctx, args.policyId, args.caseId),
});

export const mostRelevant = internalAction({
  args: {
    caseId: v.id("cases"),
    question: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"clauses">>> => {
    const [vector] = await embed([args.question]);
    const hits = await ctx.vectorSearch("clauses", "by_embedding", {
      vector,
      filter: (q) => q.eq("caseId", args.caseId),
      limit: args.limit ?? 8,
    });
    return await ctx.runQuery(internal.clauses.byIds, {
      ids: hits.map((h) => h._id),
    });
  },
});
