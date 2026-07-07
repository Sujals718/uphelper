# Uphelper

A Codeforces-focused upsolving assistant. Uphelper pulls in your real contest
history, helps you find video explanations that are actually good (not just
popular), and closes the loop with mistake logging and spaced-repetition
revision — all without ever writing your solution for you.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Motivation / problem statement](#2-motivation--problem-statement)
3. [Features](#3-features)
4. [Architecture](#4-architecture)
5. [Technology stack](#5-technology-stack)
6. [Screenshots](#6-screenshots)
7. [Installation](#7-installation)
8. [Environment variables](#8-environment-variables)
9. [Running locally](#9-running-locally)
10. [Project structure](#10-project-structure)
11. [API overview](#11-api-overview)
12. [Design decisions](#12-design-decisions)
13. [Trade-offs](#13-trade-offs)
14. [Current limitations](#14-current-limitations)
15. [Future scope](#15-future-scope)

---

## 1. Project overview

Uphelper is a full-stack web app for competitive programmers who use
Codeforces. It links a Codeforces handle, syncs every contest the account has
ever attended, and turns each unsolved problem into an actionable next step:
find a genuinely well-explained video, generate a structured (copy-paste)
hint or debugging prompt, log the mistake, and schedule it for spaced
repetition.

It is **not** an AI tutor that solves problems for you. The two prompt
templates it generates are designed to be pasted into whatever AI assistant
you already use, and are written to refuse to reveal full solutions until you
explicitly ask. The video ranking pipeline is Uphelper's own — YouTube search
plus LLM-scored comment sentiment, not view count.

The repo is a monorepo: `apps/web` (frontend), `apps/api` (backend), and
`packages/shared-types` (types shared by both).

## 2. Motivation / problem statement

Competitive programmers lose time in two specific ways this project targets:

- **Picking a tutorial video by view count or thumbnail**, which is gameable
  and says nothing about whether the video actually explained the idea well.
  Comment sentiment — people saying "finally got AC," "still confused," "TLE
  even after this" — is a better (if noisier) signal, but reading comments by
  hand doesn't scale.
- **Re-attempting a failed problem with no memory of why it failed last
  time.** Without a mistake log and a revision schedule, the same conceptual
  gap resurfaces on the next problem that needs it.

Uphelper addresses both directly: a scoring pipeline that ranks videos by
sentiment instead of popularity, and a mistake/revision system built on the
SM-2 spaced-repetition algorithm.

## 3. Features

- **Google OAuth login** — the only auth method. Short-lived JWT access
  token (in-memory on the frontend, never persisted) plus a rotating,
  Argon2id-hashed refresh token in an httpOnly cookie.
- **Codeforces integration** — link a handle, sync, and see **every**
  contest the account has attended (not just the latest), each with its
  solved/total count and its unsolved problem, computed from a small, fixed
  number of Codeforces API calls (`user.status`, `problemset.problems`,
  `contest.list`) aggregated in memory rather than one call per contest.
- **Mistake log** — create/list/edit/delete notes, optionally tagged to a
  problem.
- **Spaced-repetition revision** — revision items with an optional self-left
  hint and a reminder time, driven by a pure, independently unit-tested SM-2
  implementation (0–5 recall-grade scale). Grading a review recalculates the
  next due date; marking an item "done" is a separate, deliberate action.
- **Video search & scoring** — a YouTube Data API search (one query plus one
  quota-conscious fallback if it returns nothing), with results grouped by
  detected language and shown **top 3 per language** rather than one flat
  list. Bundle videos that cover a whole contest (not just one problem) are
  labeled as such rather than scored as if they were problem-specific.
  Comment-sentiment scoring uses a single Gemini call per video — and to
  stay within Gemini's free daily quota, only the top few candidates based on engagement metadata (per language group) are
  sent for sentiment scoring, not the full result pool. This keeps quota
  usage predictable, at the cost of occasionally not sentiment-scoring a
  lower-metadata video that might otherwise have scored well. If the quota
  runs out mid-day anyway, the pipeline falls back to popularity-only
  ranking and says so on the results screen rather than pretending every
  video was sentiment-scored.
- **Portable prompt library** — two finalized, versioned templates (stepwise
  hint, branching debug) filled server-side with your problem/contest/code
  and copy-pasted into whatever AI assistant you use — Uphelper itself never
  calls an LLM to solve anything.
- **Combined tools page** — video search and the two prompt generators in
  one page with a shared problem/contest input, deep-linkable from any
  unsolved-problem badge on the Contests page.
- **Weakness heatmap** — aggregates your own mistakes and unsolved problems
  by tag.
- **Admin panel** — user list/search and disable, Codeforces + transcript
  platform-health status, YouTube quota/cache/queue metrics, and a template
  editor for the two prompt templates (edit, save, version bump).

## 4. Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│   apps/web           │  REST  │   apps/api                │
│   Next.js App Router  │◄──────►│   NestJS (modular)         │
│   TanStack Query +    │        │   Auth · Platforms ·       │
│   Zustand + Framer     │        │   Mistakes · Revision ·    │
│   Motion               │        │   Videos · Prompts ·       │
└─────────────────────┘        │   Analytics · Admin        │
                                  └──────────┬───────────────┘
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    │                        │                         │
              ┌─────▼─────┐          ┌───────▼──────┐         ┌────────▼───────┐
              │ PostgreSQL │          │     Redis      │         │  External APIs  │
              │ (pgvector) │          │  quota counters,│         │  Codeforces API │
              │  system of │          │  video-score TTL │         │  YouTube Data   │
              │  record    │          │  cache, BullMQ  │         │  API v3         │
              └───────────┘          │  queues        │         │  Gemini API      │
                                       └───────────────┘         │  (unofficial)    │
                                                                   │  transcript      │
                                                                   │  endpoint        │
                                                                   └─────────────────┘
```

- **apps/web** talks only to `apps/api` over REST; no direct DB or
  third-party API access from the browser.
- **apps/api** is organized as one NestJS module per domain (`auth`,
  `codeforces`, `platforms`, `mistakes`, `revision`, `videos`, `youtube`,
  `gemini`, `prompts`, `analytics`, `admin`), so each domain stays
  independently testable.
- **Video scoring pipeline order** (the part with the most moving pieces):
  search → relevance filter → language detection → group by language →
  metadata-based ranking (popularity score) → select top candidates per
  language group → Gemini sentiment scoring (only on the already-trimmed
  set) → final blended score → return. Ranking by metadata *before* spending
  a Gemini call, rather than after, is what keeps the free-tier quota from
  being exhausted by scoring candidates that would just get truncated away
  anyway.
- **pgvector** is enabled on the Postgres schema (part of the base image)
  but has no consumer yet — see [Future scope](#15-future-scope).

## 5. Technology stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling / motion | Tailwind CSS + Framer Motion |
| Frontend server state | TanStack Query |
| Frontend local UI state | Zustand |
| Backend | Node.js + TypeScript, NestJS (modular, one module per domain) |
| Database | PostgreSQL (`pgvector/pgvector:pg16` image) via Prisma |
| Cache / queues | Redis (`ioredis`) + BullMQ for video-scoring jobs |
| Auth | Google OAuth 2.0 (Passport) + JWT access token + Argon2id-hashed rotating refresh token |
| External APIs | Codeforces public API · YouTube Data API v3 · Google Gemini API (free tier, sentiment scoring) |
| Language detection | `franc` (text-based language ID) + YouTube's `defaultAudioLanguage` metadata + transcript fallback |
| Shared types | `packages/shared-types`, consumed by both apps |
| CI | GitHub Actions — install, generate Prisma client, migrate against a real Postgres service container, lint, unit + e2e tests |
| Local dev infra | Docker Compose (Postgres, Redis) |

## 6. Screenshots

**Landing Page**
![Dashboard](docs/images/d.jpeg)

**Contest Dashboard**
![Contest](docs/images/c.jpeg)

**Mistakes Dashboard**
![Mistake](docs/images/m.jpeg)

**Revision Dashboard**
![Revision](docs/images/r.jpeg)

**Search Video Dashboard**
![Video](docs/images/v.jpeg)

**Prompt Dashboard**
![Prompt](docs/images/p.jpeg)

**Analytics Dashboard**
![Analytics](docs/images/g.jpeg)

**Admin Panel**
![Admin](docs/images/a.png)

## 7. Installation

**Prerequisites**: Node.js 20+, npm, Docker (for Postgres + Redis), a Google
OAuth 2.0 client ID, a YouTube Data API key, and a Gemini API key (free
tier).

```bash
git clone <this-repo>
cd uphelper
npm install
```

This is an npm-workspaces monorepo (`apps/*`, `packages/*`) — install once
from the repo root, not inside individual `apps/` folders.

## 8. Environment variables

One `.env` file lives at the **repo root**. `apps/api`'s npm scripts load it
explicitly via `dotenv-cli` regardless of which workspace runs the command.

```bash
# --- Database / cache ---
DATABASE_URL=postgresql://uphelper:uphelper@localhost:5432/uphelper?schema=public
REDIS_URL=redis://localhost:6379

# --- API server ---
API_PORT=4000
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000

# --- Auth ---
# Signs the short-lived access token only — refresh tokens are opaque random
# strings, never JWTs, and are never signed with this.
JWT_ACCESS_SECRET=replace-with-a-long-random-string-in-real-env

# Google OAuth (console.cloud.google.com -> APIs & Services -> Credentials
# -> OAuth client ID -> Web application)
GOOGLE_CLIENT_ID=replace-me.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# --- YouTube & Gemini ---
YOUTUBE_API_KEY=your_youtube_data_api_key
GEMINI_API_KEY=your_gemini_api_key

# --- Frontend (apps/web) ---
NEXT_PUBLIC_API_ORIGIN=http://localhost:4000
```

`apps/web/.env.local` needs its own copy of `NEXT_PUBLIC_API_ORIGIN`
(`apps/web/.env.local.example` provided).

Optional tuning variables (all have working defaults in code — only set
these if you need to change pipeline behavior):

| Variable | Purpose |
|---|---|
| `GEMINI_MODEL` | Override the Gemini model used for sentiment scoring |
| `GEMINI_SCORING_CONCURRENCY` | Concurrent Gemini scoring calls (default 3) |
| `YOUTUBE_DAILY_QUOTA` | YouTube quota ceiling used for the 80% throttle check |
| `TRANSCRIPT_FETCH_CONCURRENCY` | Concurrency limit on the unofficial transcript endpoint (default 3) |
| `VIDEO_SCORING_PIPELINE_TIMEOUT_MS` | How long `GET /videos/search` waits for the full pipeline before returning (default 100s) |

### Google OAuth setup

Create an OAuth 2.0 Client ID at
[console.cloud.google.com → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials),
type "Web application", with an authorized redirect URI of
`http://localhost:4000/auth/google/callback`.

### Promoting a user to admin

There's no self-serve way to become an admin, and no signup-time way to
request it — this is deliberate. Set it directly in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## 9. Running locally

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Configure environment variables (see Section 8)
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local

# 3. Generate the Prisma client and apply migrations
npm run db:generate
npm run db:deploy      # or `npm run db:migrate` if you're actively changing the schema

# 4. (Optional) seed the two prompt templates
npm run db:seed

# 5. Run both apps in separate terminals
npm run dev:api        # http://localhost:4000
npm run dev:web         # http://localhost:3000
```

### Tests

```bash
npm run test            # backend unit tests (SM-2, contest-summary building,
                         #  score aggregation, video-scope heuristic, metadata
                         #  ranking, admin platform-health util, auth rotation, ...)
npm run test:e2e        # full protected-route chain against a real Postgres
npm run lint             # both apps
```

## 10. Project structure

```
uphelper/
├── apps/
│   ├── api/                       NestJS backend
│   │   ├── prisma/                 schema + migrations + seed
│   │   └── src/
│   │       ├── auth/                Google OAuth, JWT, refresh-token rotation
│   │       ├── users/                GET /users/me
│   │       ├── codeforces/           CodeforcesClient + buildContestSummaries()
│   │       ├── platforms/            link/unlink/sync/contests/status endpoints
│   │       ├── mistakes/             mistake CRUD
│   │       ├── revision/             revision CRUD + SM-2 (sm2.util.ts)
│   │       ├── videos/               search pipeline, scoring, language
│   │       │                          detection, transcript canary job
│   │       ├── youtube/              YouTube Data API client + quota tracking
│   │       ├── gemini/               Gemini client (sentiment + quota tracking)
│   │       ├── prompts/               templates.constant.ts + fill endpoints
│   │       ├── analytics/             weakness heatmap
│   │       ├── admin/                 users, platform health, pipeline metrics,
│   │       │                          prompt-template editor endpoints
│   │       ├── redis/                 Redis module
│   │       └── common/                shared guards, concurrency-limit util
│   └── web/                       Next.js frontend
│       └── app/
│           ├── (landing page)         hero + "Get Started" (Google OAuth)
│           ├── auth/callback/          reads access token from URL fragment
│           ├── dashboard/
│           │   ├── contests/            per-contest history + unsolved problems
│           │   ├── mistakes/            mistake log UI
│           │   ├── revision/            spaced-repetition UI
│           │   ├── tools/                video search + hint/debug prompt tabs
│           │   └── analytics/            weakness heatmap
│           └── admin/                  role-gated admin panel
├── packages/
│   └── shared-types/               TypeScript contracts shared by both apps
└── docker-compose.yml              Postgres (pgvector image) + Redis
```

## 11. API overview

**Auth**
- `GET /auth/google` — start Google OAuth
- `GET /auth/google/callback` — issue tokens, redirect to frontend
- `POST /auth/refresh` — rotate refresh token
- `POST /auth/logout`

**Users**
- `GET /users/me`

**Platform integration (Codeforces)**
- `POST /platforms/:platform/link`
- `DELETE /platforms/:platform/unlink`
- `POST /platforms/:platform/sync`
- `GET /platforms/:platform/contests` — every attended contest, with
  solved/total and its unsolved problem
- `GET /platforms/status`

**Mistakes**
- `POST /mistakes` · `GET /mistakes` · `PATCH /mistakes/:id` · `DELETE /mistakes/:id`

**Revision**
- `POST /revision` · `GET /revision` · `PATCH /revision/:id` · `DELETE /revision/:id`
  — `PATCH` is intentionally one endpoint covering plain edits, grade-based
  SM-2 review completion, and raw SM-2 restore (undo), distinguished by which
  fields are present in the body — there is no separate "complete review"
  route.

**Video scoring**
- `GET /videos/search`
- `GET /videos/:id`
- `GET /videos/:id/score-breakdown`
- `POST /videos/:id/flag-language`

**Prompt library**
- `GET /prompts/hint`
- `POST /prompts/debug` — POST because `user_code` doesn't belong in a query string

**Analytics**
- `GET /analytics/weakness-heatmap`

**Admin** (role = admin only)
- `GET /admin/users` · `PATCH /admin/users/:id` (Can enable disable or search any user)
- `GET /admin/platform-health`
- `GET /admin/video-pipeline-metrics`
- `GET /admin/prompt-templates` · `PATCH /admin/prompt-templates` (can edit prompt to a newer version)

## 12. Design decisions

- **No `PlatformAdapter` interface for a single platform.** Codeforces is
  called directly from `CodeforcesClient`. Building an interface designed for
  multiple implementations when only one exists is speculative generality —
  worth revisiting only if a second platform is actually added.
- **Refresh tokens are opaque random strings, not JWTs.** Nothing to decode,
  so only a hash-comparison lookup is possible — never a signature-forgery
  risk. Stored Argon2id-hashed, with rotation-on-use: reusing an
  already-rotated-away-from token kills the session, on the assumption it was
  stolen and replayed.
- **Access token delivery via URL fragment** (`#accessToken=...`) on the
  OAuth redirect, not a query string or a second round trip — fragments are
  never sent to a server or logged, and the access token itself lives only in
  memory (Zustand, no `persist` middleware) on the frontend.
- **"Unsolved problem" per contest** is defined as the highest-index problem
  attempted (via a `CONTESTANT`-type submission) but never solved — a
  documented assumption, since it wasn't fully specified up front.
- **SM-2 uses the classic 0–5 recall-grade scale**, not a simplified 0–3
  scale, matching the scale the original SM-2 algorithm defines.
- **Video ranking does metadata-based ranking *before* Gemini scoring**, not
  after — candidates are grouped by language and trimmed to the top few per
  group using a popularity score, and only the surviving set is sent to
  Gemini. This is the concrete lever that keeps the free-tier Gemini quota
  from being exhausted after a handful of searches.
- **`GET /videos/search` waits for the full scoring pipeline** (up to a
  configurable timeout) rather than returning partial results at a fixed
  cutoff — a straggler that never finishes is dropped from the result rather
  than shown as "not scored yet."
- **Prompt templates are versioned database rows**, not hardcoded strings —
  `type` + `version`, an `isActive` flag, newest-active-wins at read time —
  so the admin panel can edit them and see history without a redeploy. The
  two canonical template bodies exist in exactly one hand-typed source file
  (`prompts/templates.constant.ts`); tests and the seed script both import
  from it rather than re-typing the strings.

## 13. Trade-offs

- **Single Node/TypeScript backend, no separate Python service.** Both
  sentiment scoring and language detection are light enough to run
  in-process — avoided the deployment/operational cost of a second service
  until a workload actually needs Python's ML ecosystem (e.g. a custom
  fine-tuned model).
- **Transcript-based language detection over audio-based (Whisper)
  detection.** Cheaper and simpler — no audio download, no STT model to
  host — at the cost of depending on an unofficial transcript-fetch endpoint
  (same fragility class as any scraped integration) with no fallback for
  videos that have no captions at all. Handled via explicit
  `"uncertain"`/`user_flagged_incorrect` states rather than a silent guess,
  plus a scheduled canary job that checks the endpoint still returns
  parseable captions for a known test video.
- **Single-query video search over multi-tier query broadening.**
  `search.list` costs 100 of YouTube's default 10,000 daily quota units, so
  the pipeline uses one primary query plus exactly one bounded fallback
  (only on zero results) rather than a broadening strategy that could burn
  the daily budget several times over per search. This makes caching, not
  search sophistication, the actual lever for serving real traffic within
  quota.
- **Google Gemini's free tier for sentiment scoring.** Acceptable for a demo project using the
  author's own test data.
- **Portable copy-paste prompts over in-house LLM calls for hint/debug.**
  Zero control over model behavior once the templates are pasted elsewhere,
  but zero inference cost and zero quota risk for two of the three AI-assist
  surfaces.
- **httpOnly cookie refresh tokens over client-stored JWTs.** Slightly more
  CSRF-handling complexity, in exchange for meaningfully reduced XSS-based
  token-theft risk.

## 14. Current limitations

- The YouTube transcript endpoint used for language detection is
  unofficial and can occasionally fail or get rate-limited.
- Language detection leans heavily on uploader-provided metadata
  (`defaultAudioLanguage`) and title/description text ID before falling
  back to a transcript fetch — it can be wrong or `"uncertain"` for videos
  with sparse metadata and no captions.
- Only a metadata-trimmed subset of candidates per search gets sentiment-scored
  by Gemini (to stay within the free daily quota), so ranking within that
  subset is more reliable than the completeness of the candidate pool itself.
- The Gemini free tier can hit its daily quota under real usage, at which
  point the pipeline falls back to popularity-only ranking for the rest of
  the day.
- Anonymized community mistake sharing is not yet implemented — mistakes
  are currently private to each user.

## 15. Future scope

- **Conversational agent / tool-calling layer.** A single conversational
  entry point that could combine contest history, mistake logs, revision
  schedules, and video recommendations into one coaching conversation.
  Deferred because the dedicated pages for contests, mistakes, revision,
  video search, and prompts already expose this functionality one or two
  clicks away — an agent layer would add LLM API cost, latency, and real
  implementation complexity (session/memory management, tool-argument
  extraction, retrieval) without a correspondingly large improvement yet.
- **Anonymized community mistake bank.** Aggregating mistake notes across
  users by problem/tag (e.g. "37% of users who missed this problem cited an
  off-by-one error") was deferred because it introduces moderation,
  ranking, and shared-data concerns that go beyond a single-user-focused
  tool.
- **Embedding-based personal-history retrieval.** The plan is to start with
  a plain SQL filter over a user's own notes and only upgrade to `pgvector`
  similarity search if that proves insufficient — `pgvector` is already
  enabled on the schema for when this is picked back up.
- **Admin manual controls** — force a platform re-sync, requeue a failed
  video-scoring job, or force a transcript re-fetch and language
  re-detection on a specific video, all from the admin panel rather than
  needing direct database/queue access.
- **Whisper-based audio transcription fallback** for videos with no
  captions at all. Traded away specifically to avoid hosting an STT model
  and running long audio-download/transcription jobs; the current pipeline
  marks such videos `"uncertain"` instead of guessing.
- **Fine-tuned video reranking / semantic retrieval / learning from user
  feedback.** The current pipeline uses YouTube search plus a documented
  relevance-filtering heuristic; a manual evaluation of 10 representative
  searches found roughly 45 of 50 returned videos relevant, with most false
  positives caused by ambiguous or inconsistent video titles.
- **Domain-specific sentiment model.** The current pipeline uses a single
  batched Gemini call per video; a manual evaluation of about 30 videos with
  sufficient comments showed strong agreement between Gemini's satisfaction
  scores and human judgment. A fine-tuned, domain-specific model (competitive
  programming jargon, code-mixed text) is a plausible future upgrade if
  Gemini's free-tier limits or accuracy ever become a real constraint.
