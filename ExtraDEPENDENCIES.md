#  Some more dependencies

Run from `apps/api`:

```bash
npm install ioredis bullmq @nestjs/bullmq @nestjs/schedule franc@5
```

| Package | Why |
|---|---|
| `ioredis` | Redis client for `RedisService` — quota counters, canary status, BullMQ's connection. |
| `bullmq` + `@nestjs/bullmq` | The async job queue for parallel comment-sentiment scoring across ~20 candidate videos per search. |
| `@nestjs/schedule` | Powers `@Cron()` for the transcript-fetch canary job (Section 10's concrete example). |
| `franc@5` | Text-based language ID for the transcript-detection fallback. **Pinned to v5 deliberately** — franc v6+ dropped CommonJS support and is ESM-only, which will break a plain `require()`/default NestJS TS-CommonJS build without extra config. v5 is the last CJS-compatible release and is more than adequate for this use case (just needs a language guess from a paragraph of transcript text, not cutting-edge accuracy). |

