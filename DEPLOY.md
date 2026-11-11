# Deploying LEVee on Vercel

LEVee deploys as one Vercel project: the website in `frontend/`, which bundles the backend from `backend/`. Supabase keeps all state, because Vercel's servers don't keep files between requests. Everything stays on the PayPal sandbox.

It takes about 15 minutes.

## Before you start

You need:

- This repository on GitHub
- A Vercel account (Hobby is fine), signed in with GitHub
- Your Supabase project, with both files in `supabase/migrations/` already run in its SQL editor
- Your PayPal sandbox app, and the two partner sandbox business accounts
- An Anthropic API key

## 1. Import the project

1. On [vercel.com/new](https://vercel.com/new), import this repository.
2. **Root Directory:** click *Edit* and choose `frontend`.
3. Leave the build settings alone. `frontend/vercel.json` sets them, including an install command that also installs the backend's packages.
4. Under *Root Directory*, keep **Include files outside the root directory in the Build Step** turned on (the default). The website imports `../backend`.
5. Don't deploy yet: add the settings below first.

## 2. Add the environment variables

In *Environment Variables*, add these for **Production** (and Preview, if you want preview deployments to work). Copy the values from your own `frontend/.env.local`. Never commit them.

| Name | Value | Needed for |
|---|---|---|
| `PAYPAL_CLIENT_ID` | Sandbox app client ID | Every PayPal step |
| `PAYPAL_CLIENT_SECRET` | Sandbox app secret | Every PayPal step |
| `PAYPAL_PARTNER_A_EMAIL` | Partner A's sandbox business email | Payouts in the live demo |
| `PAYPAL_PARTNER_B_EMAIL` | Partner B's sandbox business email | Payouts in the live demo |
| `SUPABASE_URL` | From Supabase, *Settings > API* | Accounts and all stored state |
| `SUPABASE_ANON_KEY` | From Supabase, *Settings > API* | Accounts |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase, *Settings > API*. Secret | Accounts and all stored state |
| `LEVEE_OPS_EMAILS` | Comma-separated emails of the ops logins | `/ops` |
| `ANTHROPIC_API_KEY` | Your Anthropic key | The agents: pledge chat, live storm briefs, the Narrator, proof checks |
| `LEVEE_BASE_URL` | `https://<your-project>.vercel.app` | PayPal return links, skip links, PayPal's domain check |
| `NEXT_PUBLIC_DEMO_URL` | `https://<your-project>.vercel.app` | The footer's QR code |

Optional:

| Name | What it does |
|---|---|
| `PAYPAL_SPONSOR_EMAIL` | A sandbox account that receives the sponsor's match invoice |
| `LEVEE_OPS_TOKEN`, `LEVEE_PARTNER_TOKENS`, `LEVEE_TICK_SECRET` | Tokens for scripts and the hourly storm check. A blank token refuses every script |
| `LEVEE_PAYMENTS`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RESERVE_PLAN_ID` | Only for the full backend on PayPal. See `frontend/.env.example` |

Don't set `LEVEE_STORE` or `LEVEE_LIVE_STORE`: those are for running on one machine without Supabase.

You won't know the exact `.vercel.app` address until the project exists. Deploy once, set both URL variables to the address Vercel gives you, then redeploy. `NEXT_PUBLIC_DEMO_URL` is built into the page, so a change needs a redeploy.

## 3. Deploy

Click **Deploy**. The build installs four packages and builds the site, which takes 2 to 4 minutes. After that, every push to `main` deploys again.

## 4. Point Supabase at the new address

In Supabase, *Authentication > URL Configuration*:

- **Site URL:** `https://<your-project>.vercel.app`
- **Redirect URLs:** add `https://<your-project>.vercel.app/**`

Without this, sign-up confirmation and password-reset emails link back to localhost.

## 5. Check it works

| Check | What you should see |
|---|---|
| Open `/` | The home page |
| Open `/give`, give $5 | PayPal's own window opens; the gift appears with a PayPal reference |
| Log in as a donor, open `/pledge` | The Concierge builds a pledge card; saving it opens PayPal's window |
| Open `/run`, trigger Hurricane Helene | Notice, charge, payouts and the sponsor's match, each with a PayPal reference |
| Open `/live` | Today's storms; opening one writes Sentinel's brief |
| Log in with an ops email, open `/ops` | The responder approvals |

If something fails, open the deployment in Vercel and check its *Logs* tab. PayPal and Supabase errors say which setting is missing.

## Good to know

- **Sandbox only.** The code refuses live PayPal keys, whatever is in the settings.
- **AI costs are capped.** Live storm briefs are cached per advisory and limited per day. The `/run` demo uses the recorded Helene results unless a visitor picks live AI.
- **The hourly storm check isn't scheduled.** To run it, call `POST /api/tick` with `Authorization: Bearer <LEVEE_TICK_SECRET>` from any scheduler, such as a GitHub Action or cron-job.org. The demo doesn't need it.
