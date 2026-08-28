# Recourse

An agent that pursues small consumer claims by email, citing the clause that
entitles you to the money.

You describe what went wrong. Recourse reads the counterparty's own refund
policy and terms alongside the statutory rights that override them, drafts a
claim that cites the governing clause by reference, and waits for you to
approve it. Once approved it sends from an inbox belonging to that case,
receives the reply, extracts what the counterparty actually committed to, and
handles the chase on a schedule until the matter is settled or exhausted.

Nothing leaves the outbox without a human approving it.

## Stack

| Layer | Choice |
| --- | --- |
| Backend | Convex |
| Frontend | React 19, Vite, Tailwind, Motion |
| Frontend host | Convex static hosting |
| Crawl and extraction | Firecrawl |
| Email identity and correspondence | AgentMail |
| Drafting and reply analysis | OpenAI |

## Links

| | |
| --- | --- |
| Live URL | not deployed yet |
| Repository | not published yet |
| Demo video | not recorded yet |

## Convex components registered

Wired in `convex/convex.config.ts`:

- `@agentmail/convex` per-case inboxes, inbound webhook, durable send
- `@firecrawl/firecrawl-convex` policy and statute crawling
- `@convex-dev/agent` drafting and negotiation threads
- `@convex-dev/rag` clause retrieval over the crawled corpus
- `@convex-dev/workflow` the claim lifecycle, durable across weeks
- `@convex-dev/rate-limiter` outbound ceiling per counterparty
- `@convex-dev/static-hosting` serving the built frontend
- `@convex-dev/workpool` two pools, `crawlPool` wide and `mailPool` narrow

## Data model

Seven tables in `convex/schema.ts`: `cases`, `policies`, `clauses`, `letters`,
`replies`, `attachments`, `caseEvents`. A search index over policy bodies and a
vector index over extracted clauses.

## Log

### 2026-08-28

Picked the problem. Surveyed what the sponsor stack pushes people toward, which
is crawl the web, email out, parse the replies onto a board. Several entries are
already there, so went looking for the shape that stack supports but nobody is
using: a long running adversarial correspondence where the agent needs a real
identity, a real thread, and a memory of what was said. That is a consumer claim.

Scaffolded Vite with React and TypeScript. Installed Convex and the eight
components above. Wired `convex.config.ts` and wrote the schema: seven tables,
fifteen indexes, one search index over policy text, one vector index over
clauses. No deployment yet.
