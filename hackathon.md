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

Moved off the anonymous local backend onto a cloud dev deployment. Inbound
email is the product, and AgentMail cannot deliver a webhook to `127.0.0.1`.

Built the crawl side. `policies.discover` maps the counterparty's whole domain
and scores every URL against the paths a claim is actually argued from: refunds
and returns rank highest, cancellation and warranty next, terms below that, and
deep paths lose points because those are help-centre articles rather than the
binding policy. Only the top six get scraped, through a workpool at six-way
parallelism. The point is to read the four pages that matter instead of buying
a whole website.

Built the extraction side. `clauses.extractForCase` chunks each policy on
heading boundaries, pulls out individually citable provisions with the
document's own reference, and embeds them behind the vector index. It keeps
unfavourable clauses too, because the exclusion they will quote back is worth
knowing before the letter goes out, not after.

Mounted the AgentMail webhook and routed inbound replies to their case by
thread id.

Two notes for later. `@agentmail/convex` 0.1.0 types against convex ^1.24 and
we are on 1.45, where `runMutation` gained an options argument; a cast is
confined to the one call in `http.ts`. And AgentMail's free tier caps at three
inboxes, so per-case inbox identity has to come from thread routing rather than
an inbox per claim.

Built the drafting side. `drafting.draftClaim` runs a vector search over the
extracted clauses, splits them into what supports the claim and what will be
quoted back to refuse it, and hands both to the model. The letter cites the
company's own provisions by their own reference numbers and pre-empts the
refusal rather than waiting for it.

Two defects worth recording. The model returns citation refs the way it renders
them in prose, bracketed as `[5.]`, while the stored ref is bare `5.`, so every
citation silently failed to bind to its source and the letter looked sourced
without being traceable. Refs are now compared on a stripped key. Separately,
with no claimant name on file the model signed off "The claimant", which reads
as machine-generated; a name is now a case field and its absence produces no
signature block rather than a placeholder.

Sending goes through `letters.approveAndSend`, which is the only path to a
counterparty. A draft cannot skip it, and the mutation refuses anything not in
`draft` status. Delivery is scheduled rather than inline so a slow send never
blocks the approval.

The AgentMail component turned out to be half-broken on convex 1.45. Everything
it exposes as an `internalAction` fails to resolve from the app with
`Couldn't resolve agentmail.lib.listInboxes`; its queries and mutations resolve
normally. The split is exact. That takes out inbox management, thread reads,
and `performSend`, which is the worker that actually delivers mail, so
`enqueueSend` would have queued messages nothing could ever send. The package
ships hand-authored type declarations noting that Convex codegen "does not
reliably produce this file in 1.37+", so it typechecks while the runtime
disagrees.

Outbound now goes through a small REST client in `convex/lib/agentmail.ts`
against the same v0 endpoints the component wraps. The component keeps the
halves that work and matter most: signed webhook ingest and the reactive
`listInboundMessages` query that puts replies on screen as they land.

Round trip proven end to end on the live deployment. A claim citing clauses 5
and 13 of Currys' own terms went out from afolabi-1949@agentmail.to, a human
replied from Gmail, AgentMail signed the webhook, the endpoint verified it, and
the thread id routed the reply back onto the case, which moved itself to
negotiating. Nothing in that path is mocked.

Three presentation problems to fix before the demo: the sender shows as
"AgentMail" rather than the claimant, AgentMail attaches List-Unsubscribe
headers so Gmail offers to unsubscribe from a legal claim, and a "Sent via
AgentMail" footer sits under the letter. All three tell the reader this is bulk
mail, which is the opposite of what the letter is arguing.
