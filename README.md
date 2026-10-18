# OTTO

Your money. Looking ahead.

Built by Raveena and Vedika at Technica 2026 for Capital One’s Best Use of Nessie track.

[Open OTTO](https://otto-money-autopilot.brown-olive-8463.chatgpt.site/)

## What it does

- **Overview:** connected balances, upcoming bills, banking activity, and idle cash.
- **Simulation:** compare five autonomy levels across a month, including bill timing, overdraft prevention, savings sweeps, and suspicious transfers.
- **Grow:** calculate cash available after upcoming costs and request a confirmed sandbox transfer with a verified receipt.
- **Future You:** edit habits and a target year, compare projected timelines, and save a plan.
- **Approvals:** review itemized requests in a local approval preview.
- **Subscriptions:** recognize recurring bills, add manual entries, and track cancellation requests.
- **Chat:** ask a free, rule-based financial assistant about the data and upcoming costs.

## How Nessie is used

The server reads Capital One Nessie sandbox accounts, balances, bills, purchases, deposits, and transfers. Grow creates a sandbox transfer and verifies its receipt. A persistent ledger tracks confirmed moves because raw sandbox balances do not automatically settle. API keys stay on the server.

Simulation decisions and Future You projections do not modify bank records. The Sample month option is a separate fictional scenario for demonstrating the simulation. When banking history lacks spending or paychecks, Future You can use illustrative assumptions alongside connected balances and bills.

This hackathon project does not move real money, send real approval emails, execute investments, or cancel merchant contracts. Chat uses rules, not a paid language model.

## Stack

React 19, TypeScript, Vite, React Router, CSS modules, Cloudflare Workers, and a D1-backed transfer ledger. `worker/index.ts` is the deployed API entry point. Older `src/endpoints` files remain from the initial scaffold and are not the live Worker routes.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

The frontend opens at http://127.0.0.1:3001. The frontend-only development server does not provide banking API routes. For a complete local preview with an isolated mock bank and an in-memory ledger:

```sh
node --import tsx scripts/audit-preview.ts
```

Open http://127.0.0.1:3002. This preview needs no API keys and makes no external banking requests. Its data resets when the server restarts.

## Checks

```sh
npm run check
npm test
npm run test:nessie
npm run build
```

The test suites cover simulation levels, randomized financial inputs, chat calculations, projection math, local storage, validation, and transfer concurrency and receipt handling. Tests do not guarantee a bug-free application.

## Deployment

`npm run build` bundles the frontend into the Worker at `dist/server/index.js` and includes the hosting metadata and D1 migrations. `.openai/hosting.json` belongs to the existing Sites deployment; importing this source does not transfer ownership of that hosted site.

A separate deployment needs its own host configuration, a D1 database bound as `DB`, and the SQL migration in `drizzle/`. Set `NESSIE_KEY` privately as a server-side secret. Never commit a real key or expose it in browser code. Configure the sandbox accounts separately for your deployment. Other hosts require an adapter for the Worker API and persistent ledger.

## Source export

This repository snapshot contains the latest OTTO source. It excludes local environment files, browser data, dependencies, generated builds, and the original working repository’s Git history.
