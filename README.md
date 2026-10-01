# AI Marketing Service

Subscription-based marketing workspace with a reusable Worker Engine and an AI Marketing Agent. Agent runs take structured product and campaign inputs, create a reviewable plan from package-authorized workers, execute the approved plan, evaluate each result, and save a final structured marketing brief.

## Architecture

### V1 manual worker flow

`User → REST API → Worker Engine → Worker prompt → AI Service → provider → model → validator → WorkerExecution/WorkerResult`

Manual worker API and output format remain available. Manual and Agent modes now share `src/services/workers/executeWorker.js`, including package authorization, context loading, provider calls, and result persistence.

### V2 Agent flow

`Product + Marketing Goal + Selected Workers → Planner → reviewed plan → Executor → shared Worker Engine → AI Service → provider/model → schema validator → Evaluator → retry/continue/finish → final brief`

The Planner and Evaluator use the same provider abstraction as Workers. The Executor stores an AgentRun and AgentSteps and links every Agent WorkerExecution to its step. Prior outputs are summarized and bounded before being passed to later Workers. Plans contain an order, reason, and dependencies; the API verifies that the plan contains only the selected workers and that dependencies point to earlier steps.

The Agent allows up to 8 selected steps and one retry per step. Runs are queued in-process and can be polled through the run detail endpoint. A process restart during a run may leave it in `RUNNING`; a durable job queue is outside V2 scope.

### Providers and structured output

`AI Service → Provider Interface → MockProvider | GeminiProvider → configured model → JSON/schema validation`

`AI_PROVIDER=mock` uses deterministic mock outputs. `AI_PROVIDER=gemini` uses Google’s `@google/genai` SDK and server-side `GEMINI_API_KEY`. Gemini receives JSON Schema output constraints; AI Service parses and validates the response with Zod. Providers never leak SDK response formats into Workers or Agent modules. There is no silent provider fallback.

## Technology and structure

- Backend: Node.js, Express, Prisma, MySQL, Zod, JWT, bcrypt
- Frontend: React, Vite, React Router, Tailwind/PostCSS, reusable SaaS dashboard components
- `src/agents`: product/goal schemas, Planner, Evaluator, Executor, orchestration and run state
- `src/routes`: auth, packages, marketing context, workers, analytics, approvals, workflows, Agent
- `src/services/workers/executeWorker.js`: shared and authorized worker execution
- `src/services/ai`, `src/services/providers`: provider-neutral generation, Mock, Gemini
- `src/workers/catalog`: the existing M1/M2/M3/M4 worker registry
- `prisma/schema.prisma`, `prisma/migrations`: database model and additive migrations
- `frontend/src/pages/AgentPage.jsx`: product/goal form, worker selection, plan review, progress, outputs and history

## Setup

Requires Node.js 22 or later and MySQL. Copy `.env.example` to `.env`; set a database URL and a long random JWT secret. The mock provider does not need an API key.

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The backend defaults to port 3000 and Vite to port 5173. For Gemini, set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `AI_MODEL` in the backend `.env`. Choose a Gemini model that supports structured JSON output. The model name is always configuration-driven.

Other environment variables: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`, `FRONTEND_URL`, `NODE_ENV`. `.env` is gitignored; `.env.example` contains placeholders only.

## API

All Agent and existing private APIs require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| GET | `/api/packages` | Package catalog |
| GET/PUT | `/api/marketing-context` | Read/update business context |
| GET | `/api/workers` | Worker registry and package availability |
| POST | `/api/workers/:workerSlug/execute` | Manual worker execution |
| GET | `/api/workers/executions` | Manual and Agent worker history |
| GET | `/api/analytics` | Internal execution analytics |
| POST | `/api/agent/plan` | Validate inputs, authorize workers, persist a proposed plan |
| POST | `/api/agent/run` | Approve and start an awaiting plan (`202` response) |
| GET | `/api/agent/runs` | User-owned Agent history |
| GET | `/api/agent/runs/:id` | User-owned run, step status and Worker outputs |
| GET/POST | `/api/approvals` | Existing approval foundation |
| PATCH | `/api/approvals/:id` | Decide a pending approval |
| GET/POST | `/api/workflows` | Custom workflow definition foundation |

### Meta Ads

Meta Ads uses a server-side OAuth callback at `META_REDIRECT_URI` (set the exact same URL in the Meta app dashboard). Configure `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, and a random 32-byte `META_TOKEN_ENCRYPTION_KEY` encoded as 64 hexadecimal characters. The default Graph API version is `v26.0`; override it with `META_GRAPH_API_VERSION` when needed. OAuth requests `ads_management`, `ads_read`, `pages_show_list`, and `pages_read_engagement`; Meta app review/advanced access may be required for users outside the app's roles.

Authenticated routes under `/api/meta` create the OAuth URL, report connection status, list ad accounts and Pages, save selected assets, create a Campaign Specification from a successful Agent run, and create/read/pause/resume campaigns. The OAuth callback is the only public route and is protected by a short-lived, single-use state. Access tokens are encrypted at rest and are never returned to the frontend.

The Agent's **Approve & Launch** action creates only a Meta campaign with `PAUSED` status. This MVP does not create an ad set or ad, so the campaign cannot deliver ads from this flow. **Launch Campaign** is a separate, confirmed action that sets a paused campaign to `ACTIVE`; use it only after reviewing any ad sets or ads on the Meta account.

Create plan input shape:

```json
{
  "product": { "name": "Gundam RX-78-2", "description": "Entry-level model kit", "price": "390000 VND" },
  "marketingGoal": { "objective": "Increase sales in October", "budget": "10000000 VND", "targetPlatforms": ["Facebook"] },
  "selectedWorkers": ["customer-persona", "competitor-research", "usp-offer", "ad-copy-headline"]
}
```

Plan creation only returns `AWAITING_APPROVAL`; the separate run request starts execution. Package entitlements, worker registry membership, selection membership, and run ownership are checked on the backend.

## Adding capabilities

### Worker

Add metadata to the existing `src/workers/catalog/workers.js` registry. Keep the shared worker contract, add focused instructions and schemas, and use `executeWorker` for manual and Agent runs. The generic registry currently uses a common recommendation output shape; specialized Worker contracts can be introduced incrementally.

### Provider

Add an implementation in `src/services/providers` that accepts normalized prompt/model/schema input and returns `{ model, output }`. Register it in `src/services/ai/aiService.js`. Keep keys in server environment configuration and validate output through the supplied Zod schema.

### Packages and integrations

Update package capability seed data for new commercial access. Meta Ads uses the provider/service boundary in `src/services/ads`; other Google Ads, TikTok, CRM, ERP, CDP, and website adapters remain unconfigured. V3 can connect approved marketing output to those adapters.

## V1 capabilities preserved

JWT authentication, password hashing, package/subscription checks, Marketing Context, the M1–M4 Worker catalog, manual Worker execution, provider abstraction, Mock Provider, structured output validation, persisted WorkerExecution/WorkerResult, history, analytics, approvals, custom workflow definitions, and existing REST endpoints remain available.

## Known limits

- Meta campaign records can be created paused; ad set/ad creation, publishing, spend, and external ad analytics are not implemented.
- Payment, CRM/ERP synchronization, and a production automation scheduler are not implemented.
- Gemini calls require a valid server-side key and configured model. Provider access was not verified against a live Gemini account.
- Agent runs use a bounded in-process executor, not a durable queue.
- Workers currently share generic input/output contracts; richer specialist schemas remain incremental work.
