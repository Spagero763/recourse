import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// The escalation ladder. Each rung is a different letter, not the same letter
// sent louder. Stage 3 is the last one we write: past that the claimant is
// going to an ombudsman or a chargeback, and that is their decision to make.
export const LADDER = [
  {
    stage: 0,
    kind: "followup" as const,
    instruction:
      "A short chase. Reference the original letter and its date, restate the amount, and ask for a substantive answer. Assume it was overlooked rather than refused.",
  },
  {
    stage: 1,
    kind: "followup" as const,
    instruction:
      "A firmer second chase. Note that this is the second time of asking and that the deadline in the first letter has passed. Restate the clause relied on.",
  },
  {
    stage: 2,
    kind: "escalation" as const,
    instruction:
      "A formal letter before further action. State that this is a final request, name the remedy and a seven day deadline, and say that the claimant will take the matter to the relevant ombudsman or dispute process if it is not resolved. Do not name a specific body unless the material supplies one.",
  },
  {
    stage: 3,
    kind: "escalation" as const,
    instruction:
      "A closing letter recording that the claim was not resolved and that the claimant is proceeding elsewhere. Factual, brief, no new argument.",
  },
];

export const due = internalQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Array<Doc<"cases">>> => {
    const candidates = await ctx.db
      .query("cases")
      .withIndex("by_nudge", (q) => q.lt("nextNudgeAt", args.now))
      .take(args.limit ?? 25);

    return candidates.filter(
      (c) =>
        c.nextNudgeAt !== undefined &&
        (c.status === "awaiting_reply" || c.status === "negotiating"),
    );
  },
});

export const sweep = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const cases: Array<Doc<"cases">> = await ctx.runQuery(internal.chase.due, {
      now,
    });

    let started = 0;
    for (const claim of cases) {
      // Clear the clock before scheduling so a slow draft cannot be picked up
      // twice by the next sweep.
      await ctx.db.patch(claim._id, { nextNudgeAt: undefined });

      if (claim.stage >= LADDER.length - 1) {
        await ctx.db.patch(claim._id, { status: "closed" });
        await ctx.db.insert("caseEvents", {
          caseId: claim._id,
          kind: "ladder_exhausted",
          detail: "Every stage of the escalation ladder has been sent",
          at: now,
        });
        continue;
      }

      await ctx.scheduler.runAfter(0, internal.drafting.draftFollowUp, {
        caseId: claim._id,
      });
      started += 1;
    }
    return started;
  },
});

export const advance = internalMutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.caseId);
    if (!claim) return null;
    await ctx.db.patch(args.caseId, {
      stage: claim.stage + 1,
      status: claim.stage + 1 >= 2 ? "escalated" : claim.status,
    });
    return null;
  },
});

// Lets a claimant chase now rather than waiting for the clock.
export const chaseNow = mutation({
  args: { caseId: v.id("cases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.caseId);
    if (!claim) throw new Error("Case not found");
    if (claim.status === "resolved" || claim.status === "closed") {
      throw new Error("This case is finished");
    }
    await ctx.scheduler.runAfter(0, internal.drafting.draftFollowUp, {
      caseId: args.caseId,
    });
    return null;
  },
});
