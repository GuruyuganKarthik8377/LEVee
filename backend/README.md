# LEVee backend: payments, rules and AI

Levee pays local responders before a hurricane lands. Donors pledge once through PayPal. AI agents read forecasts and proof, and a fixed-rule Policy Engine decides when money moves: tranche 1 before landfall, and tranche 2 after landfall once a partner's proof passes.

This folder is LEVee's payments, rules and AI. The website in [`../frontend`](../frontend) serves it through its `/api` routes, with Supabase for storage. Everything runs on the PayPal **sandbox** only: the code refuses live PayPal settings.

**The one rule that matters:** AI proposes and rules decide. No agent can move money. Only the Policy Engine (`policy/src/engine.ts`) calls PayPal to charge or pay, and only when its fixed rules pass.

## What's in here

| Folder | What it does | Tests |
|---|---|---|
| `payments/` | PayPal: saving a donor's account (Vault), charges (Orders), partner payouts (Payouts), sponsor invoices, refunds, the monthly Reserve gift (Subscriptions), and webhooks. Also a mock with the same behaviour, for building without PayPal. | 86 |
| `policy/` | The Policy Engine and the published playbook: when tranches fire, how much each donor pays, caps, the skip window, ops approval, reviews, the Reserve and sponsor money. No AI inside. | 80 |
| `agents/` | The five Claude agents, and `createLevee`, the one module that connects them to the engine. | 212 |

The five agents, all on `claude-haiku-5-5`:

| Agent | Job | If Claude fails or says no |
|---|---|---|
| **Sentinel** | Scores how likely a storm is to hit, from GDACS forecasts, river data and news | Nothing fires. The next hourly tick tries again |
| **Allocator** | Proposes how to split a tranche between partners | The engine uses an equal split |
| **Verifier** | Checks a partner's photos and receipts | The upload fails and nothing is paid. With no proof by the deadline, a person reviews |
| **Concierge** | Turns a donor's words into a pledge card they confirm | The request fails, so nothing is saved |
| **Narrator** | Writes notices, receipts and stories, and answers "where did my money go?" | Plain English text written by code |

Code works out every number that matters. Claude only judges, and any figure Claude writes is checked against the facts before a donor sees it.

## Setup

You need **Node 24 or newer**, because the code runs TypeScript directly. It was built and tested on Node 26. There's no build step. From the top folder, `npm run setup` and `npm run check` do the steps below for you.

```bash
cd payments && npm install
cd ../policy && npm install
cd ../agents && npm install
```

`payments/` and `agents/` each have a `.env.example`. Copy each to `.env` and fill it in. `policy/` reads the payments settings:

| File | Setting | Where it comes from |
|---|---|---|
| `payments/.env` | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com, Apps & Credentials, Sandbox |
| `payments/.env` | `PAYPAL_API_BASE` | Leave as `https://api-m.sandbox.paypal.com` |
| `payments/.env` | `PAYPAL_WEBHOOK_ID` | Printed by `npm run webhook-register -- https://<public host>/webhooks/paypal` |
| `payments/.env` | `PAYPAL_RESERVE_PLAN_ID` | Printed by `npm run reserve-setup`, once per PayPal app |
| `agents/.env` | `ANTHROPIC_API_KEY` | console.anthropic.com |
| `frontend/.env.local` | `ANTHROPIC_API_KEY` | The same key. The website only reads this file, so its agents need it here too |

The `.env` files are never committed. Use your own PayPal sandbox app and Anthropic API key.

Check everything works with no keys at all:

```bash
cd payments && npm run typecheck && npm test
cd ../policy && npm run typecheck && npm test
cd ../agents && npm run typecheck && npm test
cd ../../frontend && npx tsc --noEmit && node --test $(find src -name "*.test.ts")
```

## How it's wired

[`agents/scripts/wiring-example.ts`](agents/scripts/wiring-example.ts) is the whole wiring in about 40 lines, and the type check proves it still compiles. `createLevee` takes:

| Setting | What the server supplies |
|---|---|
| `kv` | A key-value table for Levee's state (below) |
| `ledger`, `readLedger` | The ledger of every PayPal event |
| `audit` | An append-only log of every decision, shown on the public audit page |
| `payments` | `createPaypalPayments(...)`, or `createMockPayments(ledger)` while building |
| `reader` | `toolkitReader(...)`: read-only PayPal lookups for the Narrator |
| `playbook` | `US_GULF_HURRICANE` |
| `snapshots` | Live: `activeCycloneIds()` and `liveSnapshot(id)` from `agents/src/sentinel/feeds.ts` |
| `partners`, `sponsors` | Vetted partners, and companies matching gifts |
| `deliver` | Sends a notice, receipt or story by email or SMS. **If it throws for a notice, that donor isn't charged** |
| `skipUrl` | The one-tap skip link in each notice |

### Routes

The website already has these routes, under `/api` (so `POST /api/pledges/chat`). Each is a short file in `frontend/src/app/api/` that checks the caller and calls one function. `frontend/src/server/levee.ts` builds `createLevee`, the same way `wiring-example.ts` does.

| Route | Calls | Notes |
|---|---|---|
| `POST /pledges/chat` | `pledgeChat(turns)` | One Concierge turn. Keep the turns on the client |
| `POST /pledges/confirm` | `confirmPledge(...)` | Returns PayPal's approval link, plus a second one if the donor added a monthly Reserve gift |
| `GET /pledges/approved` | `completePledge(setupTokenId)` | After PayPal sends the donor back. The terms come from what they confirmed, not this request |
| `GET /skip/:trancheKey/:pledgeId` | `skip(...)` | Returns false once the window has closed |
| `GET /donors/:id/activity` | `donorActivity(id)` | Only that donor's charges |
| `POST /donors/:id/ask` | `askNarrator(id, question)` | May include a refund decision from the engine |
| `POST /donors/:id/reserve/cancel` | `cancelReserve(id)` | Stops future monthly gifts |
| `GET /reserve` | `reserveBalance()` | |
| `GET /events/:eventKey` | `getEvent(eventKey)` | What the storm map, responder and ops screens read |
| `POST /events/:eventKey/landfall` | `confirmLandfall(...)` | **Ops only.** Needs an official source |
| `POST /proofs` | `submitProof(upload)` | **Partners only.** Amounts, dates and service area come from Levee's records, never from the upload. Photos and receipt images are sent as base64, up to 15 MB each. Only Levee's own `/run` can mark a pack as a sample |
| `GET /responder` | `partnerEvents(partnerId)` | **Partners only.** The storms this partner was considered for, with only its own share, money, proof and review |
| `GET /ops/reviews` | `listOpenReviews()` | **Ops only** |
| `POST /ops/reviews/:eventKey/:partnerId` | `decideReview(...)` | **Ops only.** Final once made |
| `POST /ops/tranches/:trancheKey/approve` | `approveTranche(...)` | **Ops only.** For a tranche over $1,000 |
| `GET /ops/responders`, `POST /ops/responders/:userId` | `frontend/src/server/responders.ts` | **Ops only.** Responders that signed up, and approving (with the service area, radius, capacity and time zone Levee pays them by) or rejecting them. Needs Supabase |
| `POST /webhooks/paypal` | `createWebhookHandler(...)` | Checks PayPal's signature, then writes the ledger |
| `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot`, `POST /auth/password` | `frontend/src/server/accounts.ts` | Donor and responder accounts on Supabase Auth, not part of `createLevee`. JSON only. 503 until Supabase is set up |
| Hourly job | `tick()` | **Run one at a time.** Overlapping ticks can't pay twice, but they waste AI calls |

`createLevee` does no login itself. The server decides who is a donor, a partner or ops, and ops routes must check that. `frontend/src/server/http.ts` does it like this:

- **Ops** are people who log in with an email listed in `LEVEE_OPS_EMAILS`, and are recorded as who decided. Nobody can sign up as ops: make each one a login in Supabase (Authentication > Users > Add user). Scripts can send `Authorization: Bearer <LEVEE_OPS_TOKEN>` instead, with `by` in the body. A logged-in ops change must be JSON.
- **Partners** are an approved responder, logged in, or a script with its own token from `LEVEE_PARTNER_TOKENS`. The login or token decides which partner they are, whatever the upload says.
- **Donors** are their browser: the httpOnly `levee_demo` cookie `/run` already uses. A donor route only answers for that id, and `POST /api/pledges/confirm` starts a cookie if there isn't one. Logging in sets this cookie to the account's donor id, so the donor routes and `/run` act for the logged-in donor, and logging out clears it.
- **Accounts** (`/login`, `/signup`, `/reset-password`): email and password on Supabase Auth, in `frontend/src/server/accounts.ts`. Supabase keeps the password, sends the confirmation and reset emails, limits repeated attempts, and holds the session in httpOnly cookies that only this server reads (`frontend/src/server/supabaseAuth.ts`). The rest of an account is a row in `levee_profiles`. "Keep me logged in" off makes those cookies last until the browser closes. Email links land on `/auth/confirm`, which logs the person in. Sign-up keeps the browser's donor id, so a pledge saved on `/run` carries over, but never one another account owns. A donor's pledge terms are saved on the account, and are the terms `/run` saves and charges when they're logged in; saving a new pledge on `/pledge` replaces them. A responder is saved as `pending_review` and isn't paid until ops approve it on `/ops`. Once approved, `/responder` shows its own storms and `/responder/proof` takes its proof; anyone else sees the Helene recording there.
- **The hourly job** is `POST /api/tick` with `Authorization: Bearer <LEVEE_TICK_SECRET>`, called by any scheduler. A second tick while one is running gets a 409.

A route whose setting is blank refuses everyone. The settings go in `frontend/.env.local`:

| Setting | What it does |
|---|---|
| `LEVEE_PAYMENTS` | Blank: the `/api` routes use mock PayPal, and `/run` uses the sandbox once `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set, as it always has. `paypal`: everything uses the sandbox, and needs both partner emails. `mock`: the backend's charges and payouts never reach PayPal, `/run`'s included |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Keeps everything in Supabase (below). Without them, the state goes in a JSON file |
| `SUPABASE_ANON_KEY` | With the two above, turns on accounts. Server only |
| `LEVEE_STORE` | Without Supabase, where the state file goes. Defaults to the system's temporary folder |
| `LEVEE_BASE_URL` | The site's public address, for PayPal's return links and the skip links in notices. Defaults to `http://localhost:3000` |
| `LEVEE_OPS_EMAILS` | The ops logins above, comma-separated |
| `LEVEE_OPS_TOKEN`, `LEVEE_PARTNER_TOKENS`, `LEVEE_TICK_SECRET` | The tokens above. Partner tokens are written `partner-a:token,partner-b:token` |
| `PAYPAL_WEBHOOK_ID`, `PAYPAL_RESERVE_PLAN_ID` | Only with `LEVEE_PAYMENTS=paypal`. Without a webhook id, `POST /api/webhooks/paypal` returns 503 |

Notices, receipts and stories go to the server log until an email or SMS sender is chosen. Once accounts are set up, real storms pay the responders ops have approved on `/ops`, at their PayPal email; until a responder is approved, there's nobody to pay. Without accounts, and always on `/run`, the partners are the two Helene samples in `agents/fixtures/helene/partners.json`.

### What to store

With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, `frontend/src/server/supabaseStore.ts` keeps all three in Supabase Postgres, along with `/run`'s browser sessions. Create the tables first by running [`supabase/migrations/0001_levee_store.sql`](../supabase/migrations/0001_levee_store.sql) in the project's SQL editor. Row Level Security is on with no policies, so only the server's service-role key can read or write them. Without those settings, `frontend/src/server/store.ts` keeps everything in a JSON file, which only works on one server; the tests use that.

One limit remains with Supabase: changes to one browser's `/run` record queue up on one server only.

- **Key-value table:** the keys start with `tranche:`, `review:`, `event:`, `verdict:`, `pledge:`, `vault:`, `vault-done:`, `language:`, `image:`, `translation:` and `sent:`.
- **Ledger:** append-only. Make `(kind, paypal_id, status)` unique and ignore duplicates, because PayPal resends webhooks.
- **Audit log:** append-only.

#### Turning on accounts

1. Run [`supabase/migrations/0002_levee_profiles.sql`](../supabase/migrations/0002_levee_profiles.sql) in the SQL editor, after 0001.
2. Set `SUPABASE_ANON_KEY` from Settings > API.
3. In Authentication > URL Configuration, set the Site URL to the site's address and add `<site>/auth/confirm**` to the redirect URLs, for example `http://localhost:3000/auth/confirm**` (the `**` lets the link carry the page to open next).

Email confirmation is on by default, so a new account logs in from the link in its email, opened in the same browser. Supabase's built-in email sender only sends a few emails an hour and is meant for testing: set up your own SMTP server in Authentication > Emails before real people sign up. To let links open in any browser, change the email templates to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (or `type=recovery&next=/reset-password` for the reset email).

## Running the real thing

These use the PayPal sandbox, which is fake money. Anything marked live calls Claude, which costs real money.

| Command, in `agents/` | What it does | Claude cost |
|---|---|---|
| `npm run helene -- <vault_id> <partner A email> <partner B email>` | Hurricane Helene from start to finish, live on Haiku, with real sandbox charges and payouts. Writes `fixtures/helene/run.json`, which the website's figures come from | About $0.035. Stops itself at $0.25 |
| `npm run pipeline -- <vault_id> <emailA> <emailB>` | Cyclone Remal (an older storm) through the same pipeline, with saved agent results | None |
| `npm run concierge -- eval --effort=low` | 18 real phrases scored | About $0.006 |

`<vault_id>` is a saved sandbox PayPal account, from `cd payments && npm run vault-save`.

## The website

The website is in [`../frontend`](../frontend). It already takes real sandbox payments through two pages:

- **Give now** (`/give`): a one-time gift through PayPal Checkout, which joins the Reserve.
- **Live demo** (`/run`): a saved pledge charged and paid out, step by step, by the real Policy Engine.

Its server needs `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PARTNER_A_EMAIL` and `PAYPAL_PARTNER_B_EMAIL` in `.env.local`. `LEVEE_LIVE_STORE` is optional: it sets where the demo's state file goes, which is otherwise the system's temporary folder.

How they use the backend:

- **`/run`** replays Hurricane Helene for each browser through `createLevee`, with its own clock and its own corner of the key-value table (`src/server/replay.ts`). Sentinel's code, the Policy Engine and PayPal run for real. Claude's judgments are the saved results in `agents/fixtures/helene/run.json`, and every other Claude call fails on purpose, so a run costs no AI money even with a key set. `src/server/liveRun.ts` turns each button into what a person or the hourly job would do, and describes the result.
- **`/give`** still takes the gift through PayPal Checkout itself, as the backend has no one-time gift. It then writes the gift to the backend's ledger as a `reserve_credit`, and a refund as a `reserve_draw`, so the Reserve is one balance that `/run`, `GET /api/reserve` and the engine all read.

`/run` follows the engine's rules exactly: the partners' split is rounded the engine's way, by a cent; a pledge with no yearly cap left and an empty Reserve doesn't fire at all; and with no donor to notify, the Reserve's share goes out as the rules fire. A pledge's timing is followed: one that waits for landfall is charged nothing in tranche 1 and its whole amount in tranche 2, and with an empty Reserve tranche 1 has nothing to collect, so neither tranche fires.

Logged-in people get live data on two more pages: ops approve responders on `/ops`, and an approved responder sees its own storms and sends proof on `/responder` and `/responder/proof`. Everything else, including those pages for visitors, reads `src/fixtures/helene.ts`, a recording of the live sandbox run: its timings, PayPal references, sample proof and text. Only its `HELENE` object is shaped like `GET /events/:eventKey`. Keep it as a recording: fetching it would make those pages dynamic and lose what the recording shows.

## Known limits

**Money**
- PayPal charges $0.25 per partner on every payout batch, on top of the amount. Pools pay out everything they receive, so Levee's PayPal balance needs some spare money to cover these.
- Money no partner can take, because of capacity or a rejected review, stays with Levee and is reported. It isn't moved to the Reserve. That's a product decision still to make.
- PayPal only remembers a charge's retry key for 6 hours. A charge still unresolved after 5 hours goes to a person instead of retrying, so a donor can never be charged twice.
- Sandbox payouts near $620 were refused for a day with `INSUFFICIENT_FUNDS`, then worked again. The cause is unknown, so do a test run before any demo.

**Untested live**
- A sponsor paying an invoice through PayPal itself. Replays mark invoices paid by bank transfer.
- Narrator answers about the Reserve, which have only run against a fake Claude.
- Whether PayPal's monthly Reserve payments carry the fee. If they don't, the Reserve balance reads slightly high.
- The Verifier on Haiku has only seen labelled placeholder photos, never real ones.

**Accounts**
- A responder's proof needs `ANTHROPIC_API_KEY` for the Verifier to judge it. Without one, only a set the code checks already send to a person gets a verdict; the rest fail with "try again later".
- Responders aren't told by email when they're approved or rejected; they see it when they log in.

**Simplifications**
- A coast is one line of latitude (`agents/src/sentinel/feeds.ts`). That works for Florida's Big Bend, but not for coasts running north to south.
- There's one region, the US Gulf Coast. Hurricanes are called `cyclone` in code.
- All the rules come from one playbook, `US_GULF_HURRICANE` in `policy/src/playbook.ts`. Its numbers, such as the 40% first charge and the Reserve's 50% share up to $500, are published to donors, so change them carefully.
