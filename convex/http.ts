import { httpRouter } from "convex/server";
import { AgentMail } from "@agentmail/convex";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";

const agentmail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});

const http = httpRouter();

// @agentmail/convex 0.1.0 types its ctx against convex ^1.24, before
// runMutation took an options argument. Structurally compatible, so the cast
// is confined to this one boundary.
type WebhookCtx = Parameters<typeof agentmail.handleWebhook>[0];

// Firecrawl mounts its own crawl-completion route at /firecrawl/webhook via
// the httpPrefix set in convex.config.ts.
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction((ctx, req) =>
    agentmail.handleWebhook(ctx as unknown as WebhookCtx, req),
  ),
});

export default http;
