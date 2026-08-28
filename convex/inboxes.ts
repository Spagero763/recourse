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

// Registers an endpoint for every event the app handles and returns the
// signing secret, because AgentMail reveals it once at creation and never
// again: the list endpoint omits it entirely. Run this yourself so the secret
// prints in your terminal, then set it as AGENTMAIL_WEBHOOK_SECRET on the
// matching deployment.
export const registerWebhook = action({
  args: { url: v.string() },
  returns: v.object({
    webhook_id: v.string(),
    url: v.string(),
    secret: v.string(),
  }),
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
    return {
      webhook_id: created.webhook_id,
      url: created.url,
      secret: created.secret ?? "",
    };
  },
});

// Does AgentMail hold the reply at all? Separates "the mail never arrived"
// from "it arrived and the webhook never fired".
export const webhooksRaw = action({
  args: {},
  returns: v.string(),
  handler: async () => {
    const r = await agentmail.rawGet("/webhooks");
    return JSON.stringify(r).replace(/"secret":"[^"]*"/g, '"secret":"<redacted>"').slice(0, 1400);
  },
});

export const threads = action({
  args: { inboxId: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const r = await agentmail.listThreads(args.inboxId);
    return JSON.stringify(r).slice(0, 1200);
  },
});

export const removeWebhook = action({
  args: { webhookId: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await agentmail.deleteWebhook(args.webhookId);
    return null;
  },
});
