# LEVee website

The LEVee website and its server, built with Next.js 15 (App Router), React 19 and Tailwind CSS 4. The server's API routes call the payments, rules and AI in [`../backend`](../backend). See the [main README](../README.md) for what LEVee is.

## What's where

| Folder | What's in it |
|---|---|
| `src/app/` | One folder per page: `/`, `/pledge`, `/give`, `/run`, `/live`, `/replay`, `/donor`, `/ops`, `/responder`, `/simulate`, `/track`, `/transparency`, `/audit`, and the account pages |
| `src/app/api/` | The server's routes: pledges, gifts, donors, storms, proofs, ops, PayPal, accounts, the hourly tick and PayPal webhooks. Each is a short file that checks the caller and calls one function |
| `src/server/` | Connects the routes to the backend (`levee.ts`), accounts on Supabase Auth, storage, the live demo (`liveRun.ts`, `replay.ts`) and Sentinel's live briefs (`liveBrief.ts`) |
| `src/components/` | The UI, one folder per page |
| `src/lib/` | Shared helpers: the PayPal calls the website makes (`paypal.ts`), the published rules, storm data from GDACS |
| `src/fixtures/helene.ts` | The recording of the live Hurricane Helene run that the replay pages show |
| `src/middleware.ts` | Sends visitors to log in before pledging or the live demo, when accounts are set up |

## Commands

From this folder, after `npm install`:

```bash
npm run dev       # http://localhost:3000
npm run build     # production build
npm run lint
npx tsc --noEmit
node --test src/server/*.test.ts src/components/pledge/*.test.ts src/lib/*.test.ts
```

## Settings

Copy `.env.example` to `.env.local`. Every setting is optional, and each is explained in that file: the PayPal sandbox app and partner accounts, Supabase for accounts and storage, the Anthropic API key for the agents, and the tokens for scripts and the hourly tick. Keys stay on the server: none are `NEXT_PUBLIC_` settings.
