# AI Marketing Service

Extensible subscription based marketing workspace. Version 1 provides a generic worker engine with a schema validated mock AI provider, account and package management, persisted marketing context and execution history, and a React dashboard. Real advertising execution, payments, and third party data connections are intentionally absent.

## Architecture

`REST API ? Worker Engine ? Worker contract ? shared prompt builder ? AI Service ? Provider interface ? Mock Provider/model ? Zod validator ? Worker result ? MySQL/Prisma`.

Workers are catalog definitions (`src/workers/catalog/workers.js`) that share an input contract, output validator, context formatter and execution service. Package levels are capabilities enforced by the backend at execute time. `AI_PROVIDER` selects an implementation; the Mock provider can be replaced without changing workers. Add a provider under `src/services/providers/` implementing `generate({prompt, model})` and register it in the AI service.

## Structure

- `src/routes`, `src/middleware`, `src/config`: REST and application foundation
- `src/workers`: worker catalog, schema, context prompt construction
- `src/services/ai`, `src/services/providers`: AI abstraction
- `src/integrations`: explicit unconfigured interfaces; no fake external success
- `src/workflows`: custom workflow definition storage foundation
- `prisma`: MySQL schema and package seed
- `frontend/src`: React dashboard and reusable worker/result views

## Requirements and setup

Requires a current Node.js release and MySQL. Copy `backend .env.example` to `.env` in this project and set `DATABASE_URL` and a long random `JWT_SECRET`. `AI_PROVIDER=mock` needs no key.

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In another terminal:

```sh
cd frontend
npm install
npm run dev
```

The API defaults to `http://localhost:3000`; Vite defaults to `http://localhost:5173`. Set `FRONTEND_URL` and optionally `frontend/.env` with `VITE_API_URL=http://localhost:3000/api` if these differ. Production backend command: `npm start`; frontend build: `cd frontend && npm run build`.

## Environment

`PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AI_PROVIDER`, `AI_MODEL`, `FRONTEND_URL`, `NODE_ENV`. `.env` is ignored by Git.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/packages`, `GET /api/packages/subscription`, `POST /api/packages/subscription` (development activation only; no payment)
- `GET|PUT /api/marketing-context`
- `GET /api/workers`, `POST /api/workers/:workerSlug/execute`, `GET /api/workers/executions`
- `GET /api/analytics`, `GET|POST /api/workflows`, `GET|POST /api/approvals`, `PATCH /api/approvals/:id`
- `GET /api/health`

Private routes use bearer JWT. Responses follow `{success,data}` or `{success:false,message,code}`. Registering seeds an M1 subscription when packages have been seeded.

## Packages and workers

M1: Marketing Planner, Customer Persona, Competitor Research, USP & Offer, Facebook Campaign, Ad Copy & Headline, Content Planner, SEO Audit & CEO Summary, Creative Brief, Marketing Context Setup. M2 adds 15 growth capabilities; M3 adds 19 advanced capabilities; M4 provides enterprise capability labels and workflow foundations. Full catalog is in `src/workers/catalog/workers.js`; package entitlements are seeded as cumulative capability lists. Worker discovery communicates availability and execution independently checks package level.

New worker: add a catalog entry with slug, purpose, tier, input schema, output shape, prompt instructions, then ensure output meets the shared Zod schema or extend the registry to select a worker-specific schema. It then automatically appears in the catalog and generic UI. The current catalog uses the same flexible recommendation output shape for all workers; specialist schemas and tailored input controls can be added per capability.

## Frontend

Login/registration, overview, marketing context form, filterable worker catalog, reusable worker execution form and structured result view, execution history, internal usage analytics, and subscription settings. Analytics report only stored worker execution counts and durations; no ad performance is fabricated.

## Extension points and limitations

- AI providers: provider interface under `src/services/providers`; mock only today.
- Integrations: adapter placeholders for Facebook/Google/TikTok, CRM, ERP, CDP, and website explicitly return `NOT_CONFIGURED`.
- Workflows: user-owned JSON workflow definitions can be stored; no scheduler, approval execution, or automation engine yet.
- Packages: update seed capability lists and pricing.
- Payments, real ad APIs/spend, external analytics, enterprise SSO, private AI, voicebot and real-time data sync are not implemented.
- The app needs configured MySQL and Prisma migration/seed before authenticated features work. Use HTTPS, managed secrets, operational monitoring, backups, and deployment hardening before production.

