import { v } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { Workpool } from "@convex-dev/workpool";
import { action, internalAction, internalMutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const firecrawl = new FirecrawlClient(components.firecrawl);
const crawlPool = new Workpool(components.crawlPool, { maxParallelism: 6 });

type PolicyKind = "refund" | "terms" | "other";

// Matched against whole hyphen-separated tokens, never as substrings. Slugs
// like "noise-cancelling-headphones" would otherwise register as a
// cancellation policy, and "/catalogue/warranties/" as a warranty policy.
const POLICY_TOKENS: Array<[Set<string>, PolicyKind, number]> = [
  [new Set(["refund", "refunds"]), "refund", 10],
  [new Set(["return", "returns"]), "refund", 9],
  [new Set(["cancellation", "cancellations"]), "refund", 8],
  [new Set(["warranty", "warranties", "guarantee", "guarantees"]), "refund", 7],
  [new Set(["terms", "tcs"]), "terms", 6],
  [new Set(["conditions"]), "terms", 5],
  [new Set(["complaints", "complaint", "disputes", "grievance"]), "other", 5],
  [new Set(["consumer", "rights"]), "other", 4],
  [new Set(["legal", "policy", "policies"]), "other", 3],
];

// Sections of a retail site that never hold binding policy text, however
// their slugs read.
const COMMERCE_SEGMENTS = new Set([
  "products", "product", "catalogue", "catalog", "shop", "store", "buy",
  "basket", "cart", "checkout", "search", "brands", "deals", "offers",
  "reviews", "blog", "news", "careers", "press",
]);

function scoreUrl(url: string): { score: number; kind: PolicyKind } | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((s) => COMMERCE_SEGMENTS.has(s))) return null;
  // Product URLs carry a SKU: a token that is a long digit run.
  if (segments.some((s) => /(^|-)\d{5,}(-|\.|$)/.test(s))) return null;

  const tokens = new Set(
    segments.flatMap((s) => s.replace(/\.(html?|php|aspx)$/, "").split(/[-_]/)),
  );

  let best: { score: number; kind: PolicyKind } | null = null;
  for (const [words, kind, weight] of POLICY_TOKENS) {
    let hit = false;
    for (const word of words) {
      if (tokens.has(word)) {
        hit = true;
        break;
      }
    }
    if (hit && (!best || weight > best.score)) best = { score: weight, kind };
  }
  if (!best) return null;

  // Policy pages sit near the root. Anything buried is a help-centre article.
  if (segments.length > 3) best.score -= 3;
  return best.score > 0 ? best : null;
}

function linksFrom(mapped: unknown): Array<string> {
  const raw = (mapped as { links?: Array<unknown> })?.links ?? [];
  const urls: Array<string> = [];
  for (const entry of raw) {
    if (typeof entry === "string") urls.push(entry);
    else if (entry && typeof entry === "object" && "url" in entry) {
      const u = (entry as { url?: unknown }).url;
      if (typeof u === "string") urls.push(u);
    }
  }
  return urls;
}

export const discover = action({
  args: { caseId: v.id("cases"), limit: v.optional(v.number()) },
  returns: v.object({ queued: v.number(), scanned: v.number() }),
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internal.cases.byId, { caseId: args.caseId });
    if (!claim) throw new Error("Case not found");
    if (!claim.counterpartyDomain) {
      throw new Error("This case has no counterparty website to read");
    }

    const mapped = await firecrawl.map(ctx, `https://${claim.counterpartyDomain}`, {
      limit: 500,
    });
    const candidates = linksFrom(mapped)
      .map((url) => ({ url, ...(scoreUrl(url) ?? { score: -1, kind: "other" as const }) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.limit ?? 6);

    // Re-running a scan replaces the previous read rather than layering on it,
    // so a tightened filter actually removes what it now rejects.
    await ctx.runMutation(internal.policies.clearForCase, { caseId: args.caseId });

    await ctx.runMutation(internal.policies.queue, {
      caseId: args.caseId,
      pages: candidates.map(({ url, kind }) => ({ url, kind })),
    });

    await ctx.runMutation(internal.cases.logEvent, {
      caseId: args.caseId,
      kind: "policy_scan",
      detail: `Found ${candidates.length} policy pages on ${claim.counterpartyDomain}`,
    });

    return { queued: candidates.length, scanned: linksFrom(mapped).length };
  },
});

export const clearForCase = internalMutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("policies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);

    const orphaned = await ctx.db
      .query("clauses")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    for (const row of orphaned) await ctx.db.delete(row._id);

    return null;
  },
});

export const queue = internalMutation({
  args: {
    caseId: v.id("cases"),
    pages: v.array(
      v.object({
        url: v.string(),
        kind: v.union(v.literal("refund"), v.literal("terms"), v.literal("other")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const page of args.pages) {
      await crawlPool.enqueueAction(ctx, internal.policies.fetchOne, {
        caseId: args.caseId,
        url: page.url,
        kind: page.kind,
      });
    }
    return null;
  },
});

export const fetchOne = internalAction({
  args: {
    caseId: v.id("cases"),
    url: v.string(),
    kind: v.union(v.literal("refund"), v.literal("terms"), v.literal("other")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await firecrawl.scrape(ctx, args.url, {
      formats: ["markdown"],
      onlyMainContent: true,
      maxAge: 6 * 60 * 60 * 1000,
    });

    const markdown = (page as { markdown?: string })?.markdown ?? "";
    if (markdown.trim().length < 200) return null;

    const title =
      (page as { metadata?: { title?: string } })?.metadata?.title ?? args.url;

    await ctx.runMutation(internal.policies.store, {
      caseId: args.caseId,
      url: args.url,
      title,
      kind: args.kind,
      // A single document is capped well inside Convex's 1MB limit.
      markdown: markdown.slice(0, 400_000),
    });
    return null;
  },
});

export const store = internalMutation({
  args: {
    caseId: v.id("cases"),
    url: v.string(),
    title: v.string(),
    kind: v.union(
      v.literal("refund"),
      v.literal("terms"),
      v.literal("statute"),
      v.literal("other"),
    ),
    markdown: v.string(),
  },
  returns: v.id("policies"),
  handler: async (ctx, args): Promise<Id<"policies">> => {
    const claim = await ctx.db.get(args.caseId);
    const domain = (() => {
      try {
        return new URL(args.url).hostname.replace(/^www\./, "");
      } catch {
        return claim?.counterpartyDomain ?? "unknown";
      }
    })();

    const existing = await ctx.db
      .query("policies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .filter((q) => q.eq(q.field("url"), args.url))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        markdown: args.markdown,
        title: args.title,
        fetchedAt: Date.now(),
      });
      return existing._id;
    }

    const policyId = await ctx.db.insert("policies", {
      caseId: args.caseId,
      domain,
      url: args.url,
      title: args.title,
      kind: args.kind,
      markdown: args.markdown,
      fetchedAt: Date.now(),
    });

    await ctx.db.insert("caseEvents", {
      caseId: args.caseId,
      kind: "policy_read",
      detail: args.title,
      at: Date.now(),
    });

    return policyId;
  },
});

export const forCase = query({
  args: { caseId: v.id("cases") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("policies")
      .withIndex("by_case", (q) => q.eq("caseId", args.caseId))
      .collect();
    // Bodies are large and the list view only needs provenance.
    return rows.map(({ markdown, ...rest }) => ({
      ...rest,
      length: markdown.length,
    }));
  },
});

export const search = query({
  args: { caseId: v.id("cases"), term: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (!args.term.trim()) return [];
    const hits = await ctx.db
      .query("policies")
      .withSearchIndex("search_body", (q) => q.search("markdown", args.term))
      .take(10);
    return hits
      .filter((p) => p.caseId === args.caseId)
      .map(({ markdown, ...rest }) => ({ ...rest, length: markdown.length }));
  },
});
