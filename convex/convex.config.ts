import { defineApp } from "convex/server";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import rag from "@convex-dev/rag/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

// AgentMail reads AGENTMAIL_API_KEY and AGENTMAIL_WEBHOOK_SECRET from the
// deployment directly, so credentials never reach a mutation argument.
app.use(agentmail);

app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});

app.use(agent);
app.use(rag);
app.use(workflow);
app.use(rateLimiter);
app.use(staticHosting);

// Crawls fan out wide and are the only thing allowed to saturate the queue.
app.use(workpool, { name: "crawlPool" });
// Outbound mail stays deliberately narrow so a case never bursts a counterparty.
app.use(workpool, { name: "mailPool" });

export default app;
