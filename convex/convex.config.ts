import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import agentMail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import rag from "@convex-dev/rag/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp();

app.use(agentMail);
app.use(firecrawl);
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
