# @fahybrik/web

Next.js dashboard for Pablo (Fabrik Training Club). Part of the FAHYBRIK monorepo.

## Status

**Scaffolding only.** All real screens (cohort view, athlete deep-dive, template
builder) are blocked on UX design pass + Alex sign-off (tasks #17/#18). The current
page is a placeholder dark wordmark.

## Stack

- Next.js 16 (App Router, Turbopack, React 19)
- Tailwind CSS v4 (CSS-driven config, see `app/globals.css`)
- shadcn/ui (base-nova preset, base-ui primitives)
- Dark theme only (Alex confirmed 2026-05-07; no light variant)
- Brand tokens placeholder — exact orange hue TBD from Fabrik logo sample

## Commands

Run from the repo root (workspace-aware):

```sh
pnpm dev:web      # next dev --turbopack
pnpm build:web    # next build
```

Or from this `/web` directory:

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
```

## Environment variables

Local secrets live in the repo root `.env.local` (gitignored, 600 perms).
This package symlinks to it via `web/.env.local -> ../.env.local`, so Next.js
picks up `DATABASE_URL` and other vars without duplicating them.

If the symlink is missing or broken, recreate it:

```sh
ln -sf ../.env.local .env.local
```

`.env.local` files are listed in `.gitignore`, so the symlink is not committed.

## What NOT to add here yet

- No sidebar, no top nav, no real routes beyond `/`
- No business UI (cohort, athlete, template builder)
- No icons from `lucide-react` on the placeholder page
- No client-side state libs

These come after UX sign-off.
