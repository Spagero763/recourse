import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const caseStatus = v.union(
  v.literal("drafting"),
  v.literal("awaiting_reply"),
  v.literal("negotiating"),
  v.literal("escalated"),
  v.literal("resolved"),
  v.literal("closed"),
);

export const disposition = v.union(
  v.literal("accepted"),
  v.literal("partial"),
  v.literal("refused"),
  v.literal("info_requested"),
  v.literal("acknowledged"),
  v.literal("unclear"),
);

export default defineSchema({
  cases: defineTable({
    ownerId: v.optional(v.string()),
    // Signed at the bottom of every letter. Without it the claim reads as
    // machine-generated, which is the fastest way to have it ignored.
    claimantName: v.optional(v.string()),
    title: v.string(),
    counterparty: v.string(),
    counterpartyDomain: v.optional(v.string()),
    counterpartyEmail: v.optional(v.string()),
    narrative: v.string(),
    amountClaimed: v.optional(v.number()),
    currency: v.string(),
    jurisdiction: v.optional(v.string()),
    status: caseStatus,
    // Position on the escalation ladder: 0 first ask, 1 chase, 2 formal, 3 external body.
    stage: v.number(),
    inboxId: v.optional(v.string()),
    inboxAddress: v.optional(v.string()),
    threadId: v.optional(v.string()),
    openedAt: v.number(),
    lastActivityAt: v.number(),
    nextNudgeAt: v.optional(v.number()),
    settledAmount: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_activity", ["lastActivityAt"])
    .index("by_nudge", ["nextNudgeAt"])
    .index("by_thread", ["threadId"]),

  policies: defineTable({
    caseId: v.optional(v.id("cases")),
    domain: v.string(),
    url: v.string(),
    title: v.string(),
    kind: v.union(
      v.literal("refund"),
      v.literal("terms"),
      v.literal("statute"),
      v.literal("other"),
    ),
    markdown: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_case", ["caseId"])
    .index("by_domain", ["domain"])
    .searchIndex("search_body", {
      searchField: "markdown",
      filterFields: ["domain", "kind"],
    }),

  clauses: defineTable({
    policyId: v.id("policies"),
    caseId: v.id("cases"),
    // Whatever the source calls it: "7.3", "Section 4", "Article 5(1)(c)".
    ref: v.string(),
    heading: v.string(),
    text: v.string(),
    sourceUrl: v.string(),
    // False when the clause is what the counterparty will quote back at you.
    favourable: v.boolean(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_case", ["caseId"])
    .index("by_policy", ["policyId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["caseId"],
    }),

  letters: defineTable({
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
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    approvedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_case", ["caseId"])
    .index("by_case_status", ["caseId", "status"]),

  replies: defineTable({
    caseId: v.id("cases"),
    messageId: v.string(),
    from: v.string(),
    body: v.string(),
    receivedAt: v.number(),
    disposition,
    offeredAmount: v.optional(v.number()),
    missingInfo: v.array(v.string()),
    summary: v.string(),
  })
    .index("by_case", ["caseId"])
    .index("by_message", ["messageId"]),

  attachments: defineTable({
    caseId: v.id("cases"),
    storageId: v.id("_storage"),
    filename: v.string(),
    label: v.string(),
    uploadedAt: v.number(),
  }).index("by_case", ["caseId"]),

  caseEvents: defineTable({
    caseId: v.id("cases"),
    kind: v.string(),
    detail: v.string(),
    at: v.number(),
  }).index("by_case", ["caseId"]),
});
