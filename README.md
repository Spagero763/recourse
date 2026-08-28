# Recourse

An agent that pursues small consumer claims by email, citing the clause that
entitles you to the money.

You describe what went wrong. Recourse reads the counterparty's own refund
policy and terms, drafts a claim that cites the governing provision by its own
reference number, and waits for you to approve it. Once approved it sends from
an inbox belonging to that case, receives the reply, extracts what the
counterparty actually committed to, and handles the chase on a schedule until
the matter is settled or exhausted.

Nothing leaves the outbox without a human approving it.

## Why cite their own terms

A claim that says "this is unfair" gets a form response. A claim that quotes
clause 9.2 of the company's own returns policy back at them, by number, gets
routed to someone who can settle it.

The hard part is that the governing provision is usually one paragraph buried
in a forty page document that the claimant has never read. Recourse finds it.

It also extracts the provisions that work *against* the claim, because the
exclusion they will quote back is worth knowing before the letter goes out
rather than after. The drafted letter answers it pre-emptively:

> Although [5.] also says that payment is taken when an order is submitted,
> that does not explain or authorise a second charge for the same order.

## How it works

1. **Map and select.** The counterparty's domain is mapped, and every URL is
   scored against the paths a claim is actually argued from. Refunds and
   returns rank highest, cancellation and warranty next, terms below that.
   Matching is on whole hyphen-separated tokens, so a slug like
   `noise-cancelling-headphones` does not register as a cancellation policy.
   Commerce paths and anything carrying a SKU are rejected outright.
2. **Read.** Each selected document is chunked on heading boundaries and mined
   for individually citable provisions, kept verbatim with the document's own
   reference, and marked as supporting or opposing the claim.
3. **Retrieve.** Provisions are embedded and searched by vector similarity
   against the claimant's account of what happened.
4. **Draft.** The letter cites what it retrieved, states one amount and one
   deadline, pre-empts the strongest opposing provision, and signs as the
   claimant. Citations are bound back to the clause records they came from, so
   every reference in the letter is traceable to its source.
5. **Correspond.** Sent from a real inbox. Replies arrive by signed webhook and
   are read for what was committed to rather than how warmly it was said: an
   apology carrying no decision is an acknowledgement, not a concession.
6. **Chase.** An hourly sweep advances stalled claims along a four rung
   escalation ladder. Each rung is a different letter, not the same letter sent
   louder. The ladder stops where the next step becomes the claimant's decision
   rather than the app's.

Evidence can be attached to a case and is sent with the next reply. Replies go
out on the existing thread rather than as new mail, so the counterparty keeps
the history they are working from. A settled claim records what was actually
recovered, which is the only number that proves any of this worked.

Delivery failures close the case. A claim sent to a dead address that sits in
`awaiting_reply` looking healthy is the worst possible failure for a tool whose
promise is that it chased on your behalf.

## Stack

| Layer | Choice |
| --- | --- |
| Backend, database, scheduling | Convex |
| Frontend | React 19, Vite, Tailwind v4, Motion, GSAP |
| Hosting | Convex static hosting |
| Crawling and extraction | Firecrawl |
| Email identity and correspondence | AgentMail |
| Drafting, reading replies, embeddings | OpenAI |

Seven tables, fifteen indexes, a full-text index over policy bodies and a
vector index over extracted clauses. Crons, scheduled functions, HTTP actions,
and two workpools: one wide for crawl fan-out, one deliberately narrow for
outbound mail so a case never bursts a counterparty.

## Running it

```bash
npm install
npx convex dev
```

Four environment variables, set on the deployment rather than in a file:

```bash
npx convex env set FIRECRAWL_API_KEY fc-...
npx convex env set OPENAI_API_KEY sk-...
npx convex env set AGENTMAIL_API_KEY ...
npx convex env set AGENTMAIL_WEBHOOK_SECRET whsec_...
```

Point an AgentMail webhook at `<your-deployment>.convex.site/agentmail/webhook`.
The endpoint verifies every delivery and rejects anything unsigned.

Then:

```bash
npm run dev      # local frontend against the dev backend
npm run deploy   # build and publish to <deployment>.convex.site
```

## Notes

`@agentmail/convex` 0.1.0 exposes its remote calls as `internalAction`s, and on
Convex 1.45 those do not resolve from the parent app. Queries and mutations
resolve normally. Outbound mail therefore goes through a small REST client in
`convex/lib/agentmail.ts` against the same v0 endpoints the component wraps,
while the component keeps signed webhook ingest and the reactive message store.

## Licence

MIT
