import { v } from "convex/values";
import { action } from "./_generated/server";
import * as agentmail from "./lib/agentmail";

export const list = action({
  args: {},
  returns: v.array(v.any()),
  handler: () => agentmail.listInboxes(),
});

// The sender name is what a claims handler reads before a word of the letter.
// AgentMail has no update endpoint for it, so correcting it means creating an
// inbox with the right name rather than editing the one that exists.
export const create = action({
  args: { username: v.string(), displayName: v.string() },
  returns: v.any(),
  handler: (_ctx, args) =>
    agentmail.createInbox({
      username: args.username,
      displayName: args.displayName,
    }),
});
