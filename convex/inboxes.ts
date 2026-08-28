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

// Secrets are deliberately not returned: this exists to answer "what is
// registered and where does it point", not to hand credentials around.
export const webhooks = action({
  args: {},
  returns: v.array(v.any()),
  handler: async () => {
    const rows = await agentmail.listWebhooks();
    return rows.map((w) => ({
      webhook_id: w.webhook_id,
      url: w.url,
      enabled: w.enabled,
      event_types: w.event_types,
      hasSecret: Boolean(w.secret),
    }));
  },
});

// Registers an endpoint for every event the app handles. The signing secret
// is deliberately not returned: read it from the AgentMail console and set it
// as AGENTMAIL_WEBHOOK_SECRET on the matching deployment.
export const registerWebhook = action({
  args: { url: v.string() },
  returns: v.object({ webhook_id: v.string(), url: v.string() }),
  handler: async (_ctx, args) => {
    const created = await agentmail.createWebhook({
      url: args.url,
      eventTypes: [
        "message.received",
        "message.sent",
        "message.delivered",
        "message.bounced",
        "message.rejected",
        "message.complained",
      ],
    });
    return { webhook_id: created.webhook_id, url: created.url };
  },
});
