# FAHYBRIK

HYROX / hybrid training platform. Single-coach (Pablo, Fabrik Training Club Barcelona) + elite-athlete iOS app. Template-based personalization indexed by RAG over Pablo's ATR methodology.

## Repo layout

```
ios/        Swift native iOS app (athletes)
web/        Next.js dashboard (Pablo)
shared/     Zod schemas, shared types, generated Swift Codable
infra/      Neon migrations, deploy scripts
docs/       Methodology notes, API contracts
```

## Stack

- **iOS**: Swift native (Xcode), iPhone 17 Pro target
- **Web**: Next.js latest, Tailwind, shadcn, dark UI Whoop-style + orange accent
- **DB**: Neon Postgres + pgvector
- **Hosting**: Vercel (vanwida account)
- **Auth**: Sign in with Apple (athletes) / Resend magic link (coach)
- **Data**: Apple HealthKit + Garmin Health API + Concept2 PM5 (Phase 4)

## Account scope

Everything runs under **vanwida** — Vercel, GitHub, Neon. Never under alexsole / kud0.
