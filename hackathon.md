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
| Live URL | https://hearty-lobster-443.convex.site |
| Repository | https://github.com/Spagero763/recourse |
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

Reply analysis reads what a company actually committed to rather than how
warmly they said it. Sympathetic language around a refusal still reads as
refused. It pulls any offered amount, lists exactly what they asked the
claimant to supply, and moves the case accordingly. Tested on a real reply: it
returned info_requested, extracted both requested items, and noted the 30 day
limit being raised as a defence.

Chasing runs on an hourly cron over a four rung escalation ladder: a light
chase, a firmer one, a formal letter before further action, then a closing
letter. Each rung is a different letter rather than the same one sent louder,
and the ladder stops at the point where the next step is the claimant's
decision rather than ours. The follow-up sees everything already sent and the
last reply, so it moves the argument forward instead of repeating it. On the
test case it distinguished the clause they raised from the claim being made:
their 30 day term covers returns and faulty goods, not reimbursement of a
duplicate payment.

Delivery failures now close the case. A bounce, a rejection or a spam complaint
clears the chase clock and records why. Without that a claim sent to a dead
address sits in awaiting_reply looking healthy forever, which is the worst
possible failure for a tool whose promise is that it chased on your behalf.
Complaints stop the chase for a different reason: continuing is not ours to
decide.

Frontend ships through the Convex static hosting component, registered as the
catch-all in `convex/http.ts` after the webhook routes rather than taking the
root. Moving the site to `/` would have pushed `/agentmail/webhook` under
`/api`, breaking a URL already registered with AgentMail, and there was no
reason to move a stable webhook to make room for a frontend.

One frontend defect worth recording because it was invisible rather than
obvious: every colour class was written as `bg-[--color-accent]`, the Tailwind
v3 arbitrary-value form. Tailwind v4 derives utilities from the `@theme`
namespace instead, so the correct class is `bg-accent`, and the v3 form
silently generates nothing. 126 references across eight files compiled without
warning and rendered as unstyled defaults. The custom properties were all
present in the output, which is what made it look like a design problem rather
than a build one.

Moved to production. The backend deployed to hearty-lobster-443 with all eight
components installed, and the frontend was rebuilt against the production
backend before upload, so the published bundle points at
hearty-lobster-443.convex.cloud rather than the dev deployment. Verified: the
site returns 200, the bundle references only the prod backend, and
/agentmail/webhook still rejects an unsigned payload with 401, which is the
correct answer to a forged delivery.

The dev deployment stays alive as the working environment. Editing against the
URL judges will open is a bad way to spend three weeks.

Full round trip verified on production, not inherited from dev. Firecrawl
mapped 497 URLs and selected 2 policy pages, extraction pulled 23 provisions,
the letter bound 3 citations to their source clauses and signed correctly, the
send delivered and bound its thread, and a human reply routed back through the
production webhook. The analyser read that reply as acknowledged rather than
accepted: an apology carrying no commitment is not a concession, and reading it
as one would have closed a live claim.

Sending inbox corrected. Claims went out as "AgentMail <afolabi-1949@...>",
which a claims handler reads as bulk mail before reaching a word of the letter.
AgentMail has no endpoint to rename an inbox, so the fix was to create a
correctly named one and add AGENTMAIL_INBOX_ID so the app selects it
deliberately rather than taking whichever the API returns first. Claims now
send as "A. Afolabi <recourse-claims@agentmail.to>". The "Sent via AgentMail"
footer and the List-Unsubscribe header come from sending on the shared domain
and need a custom domain on a paid plan, so they stay.

Tests cover the three places that produced silent failures rather than errors:
the policy URL scorer, which once accepted a Sony headphones listing because
"noisecancelling" contains "cancel"; citation reference matching, which failed
across "[5.]" and "5." so every letter looked sourced while being untraceable;
and the letter segmenter, which must never lose or duplicate a character of the
letter it is splitting.

Statutory sources now get crawled, which the product had been claiming and not
doing: "statute" existed only in the type unions and no case had ever held one.
`policies.findStatute` searches by jurisdiction and accepts results only from
official sources, because a law firm's summary of a statute is not the statute
and quoting one invites the reply that it is wrong. The John Lewis claim now
carries section 23 of the Consumer Rights Act 2015, the right to repair or
replacement, extracted as [23(1)] through [23(8)].

That work exposed two further defects. The URL scorer was tuned to one
retailer's shapes: John Lewis files its catalogue under /browse, which was not
in the commerce list, and its product ids are prefixed like p112608885, which
the SKU pattern missed because it required the digits to follow a hyphen or
start the segment. Three product pages were being read and paid for, and the
"2 year guarantee" the letter leaned on had come from a freezers facet page
rather than the guarantees policy. Rejection now covers browse trees, facet
markers, any six digit run however prefixed, and anything deeper than five
segments. All three real URLs are regression tests.

Second, re-running a site scan deleted the statute along with the company
pages, because the scan cleared every policy on the case rather than the ones
it was replacing. Statutes are found by a different action and now survive.
