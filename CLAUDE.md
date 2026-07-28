# FAHYBRIK — Project Instructions for Claude / Agents

This file is loaded automatically by Claude when working in this repo. It supplements the user's global rules and the broader `/Public/projects/CLAUDE.md`.

## OPERATING RULE Nº1 — DESIGN-FIRST, NO REACTIVE PATCHING (overrides everything below)

**MANDATO:** antes de construir/specificar/lanzar agentes sobre algo no trivial del dominio, INVOCAR la skill `build-right` (`.claude/skills/build-right/`) y seguirla. No es opcional.

**El fallo recurrente:** parchear el síntoma que Alex acaba de señalar en vez de pensar el sistema. La inteligencia (modelar el dominio, edge cases, coherencia) es MÍA y no se delega a agentes. Esto se dispara SOLO, en cada sesión, sin que Alex tenga que pedirlo ni cazarme.

**Objetivo vs Subjetivo (la línea que NO cruzo):** lo OBJETIVO (correctitud, completitud del dominio, estándares) es MÍO y debe quedar bien SIN que Alex lo valide — nunca omito una variable necesaria (un RUN lleva zona/ritmo; un squat lleva carga+RIR/RPE+tempo+descanso) ni pregunto si "debería llevar X" cuando es objetivamente necesario. Lo SUBJETIVO (layout, botón, naming, estética, prioridad) SÍ se lo pregunto. **Alex NO es mi QA: el QA soy yo.**

**Uso pleno de capacidad:** tengo planificación, 1M de contexto y agentes paralelos gratis. Para N unidades independientes (98 bloques, 11 semanas) → FAN-OUT en varios agentes repartidos, NO 1. Jamás optimizar por rápido/barato: la atención de Alex es el recurso caro, mi tiempo y los tokens no.

**Trigger = "voy a construir / specificar / lanzar un agente" sobre algo NO trivial del dominio.** Antes de escribir código o lanzar un agente, OBLIGATORIO:

1. **Modelar el dominio ENTERO de esa pieza, no el caso delante.** Ej.: una "prescripción" no es sets/reps/rpe — es *cómo se mide el trabajo* (distancia | tiempo | reps | calorías) × *contra qué objetivo* (ritmo | zona | RPE | %RM | RIR) × *por modalidad* (correr, ergo, fuerza, WOD). Se diseña UNA vez, completo.
2. **Romperlo contra la realidad ANTES de construir:** coger ~10 casos reales y verificar que TODOS entran en el modelo con CERO texto libre. Si alguno no entra → el modelo está mal, no el caso. **Las fuentes las marca Alex.** No salir a buscar material por iniciativa propia: nada de ficheros del repo que nadie ha citado, nada de planes de terceros. Si no hay fuente dada, se pregunta.
3. **Test de cada campo = uso final:** (a) el atleta lo entiende sin ambigüedad, (b) la app calcula analíticas con él, (c) la IA lo adapta. Si acaba en texto, falla los tres → no está bien (da igual que compile).
4. **Surfacear a Alex 3 líneas: modelo + contra qué casos reales lo rompí + dónde podría fallar** — ANTES de construir. Ahí va la profundidad, en su momento, como propuesta. NO build-then-explain.
5. **Cuando un fallo revela un hueco del modelo → arreglar la RAÍZ (el modelo), no el caso.**

Si me pillo saltando a construir/delegar sin haber hecho 1-4, PARO y vuelvo al diseño. Ver memoria [[feedback-coherence-over-no-errors]], [[feedback-sense-and-market-standards]].

## HARD RULE — TODO SE COMMITEA. NADA SE PIERDE.

Alex tiene una plataforma propia (**mentalOS**) que lee los cambios en disco y el historial de git de todos sus proyectos, y se los sirve al móvil. Si el trabajo no está en git, para él **no existe**.

Por tanto, en cada sesión:

- **Commitear siempre** al terminar cualquier pieza de trabajo — código, migraciones, docs, diseño. No esperar a que Alex lo pida. No dejar trabajo solo en el scratchpad.
- **Commits pequeños y con mensaje honesto** de qué se hizo y por qué. Nada de un commit gigante al final.
- **Solo lo propio.** El repo es compartido entre sesiones: añadir por ruta explícita, nunca `git add -A` ni `git add .`, y **jamás `git stash`** (se lleva el trabajo de otras sesiones). Ver [[feedback_never_git_stash_shared_worktree]].
- **`FOCUS.md` en la raíz siempre al día.** Es lo que lee mentalOS para saber en qué andamos. Se actualiza en el mismo commit que el trabajo: en qué estamos ahora, qué acaba de cerrarse, qué es lo siguiente y qué está pendiente de decisión. Corto — es un estado, no un diario.
- Los artefactos publicados (HTML de diseño, documentos de metodología) van a `docs/`, y su enlace se referencia desde `FOCUS.md` para que quede rastro.
- **`docs/DECISIONS.md`** recoge toda decisión estructural del dominio o del modelo de datos — y **sobre todo lo que se elimina o se descarta**. Lo que se borra sin dejar constancia es lo que alguien reconstruye seis meses después. Leerlo ANTES de rediseñar nada del dominio; escribir en él al tomar la decisión, no al final.

Esto no depende de que me acuerde: el hook `SessionStart` (`.claude/hooks/session-context.sh`) sirve al arranque de cada sesión el `FOCUS.md`, el trabajo sin commitear y los últimos commits.

**Por qué existe todo esto:** en julio de 2026 hubo que rehacer la metodología entera porque el trabajo previo estaba en el repo pero era indescubrible — una spec huérfana, un motor de reglas muerto y migraciones que creaban y eliminaban entidades sin dejar el porqué en ningún sitio legible.

## What this project is

**FAHYBRID** — premium HYROX / hybrid training app. (La marca acaba en **D**: FAHYBRID. `FAHYBRIK` es solo el nombre heredado del repo, el proyecto Vercel y el de Neon — nunca se escribe en prosa, copy, docs ni artefactos.) Single coach (Pablo, Fabrik Training Club Barcelona) → his elite athletes. Two surfaces: iOS Swift native (athletes) + Next.js dashboard (Pablo). Templates created by Pablo + IA selects/adapts (NOT IA generating from scratch). Pablo's methodology = ATR block periodization, indexed via RAG + pgvector.

## Account scope — HARD RULE

Everything runs under **vanwida**. Vercel, GitHub (Vanwida org/user), Neon, Resend. **Never** under `alexsole@gmail.com` or `kud0`.

- Tokens: `~/.openclaw/credentials/vanwida-tokens.env` (don't echo, don't commit)
- Local DB connection: `.env.local` (gitignored, 600 perms)
- Confirm `gh auth status` shows Vanwida active before any GitHub operation
- Confirm `git config user.email` is `vanwida@aistudios.pro`

## Stack

- iOS: Swift native (Xcode), iPhone 17 Pro simulator for dev
- Web: Next.js latest, Tailwind, shadcn/ui, dark theme by default + orange accent
- DB: Neon Postgres + pgvector (`fahybrik` project, `aws-eu-central-1`)
- Hosting: Vercel (vanwida)
- Auth: Sign in with Apple (athletes) / Resend magic link (Pablo)
- Data: HealthKit + Garmin Health API + Concept2 PM5 (Phase 4)
- LLM: **DO NOT propose a model.** Alex picks. Read the credentials file for whatever provider he's chosen.

## Code conventions

- Snake_case for API responses (Swift Codable convention from user's Brain)
- Explicit columns in DB; no JSON blobs except: ML feature vectors, embedding vectors
- Files under 500 lines; modular design
- Server-side validation on every mutation (Zod for both web and shared)
- Test-first where it makes sense (TDD London style for service layers)
- Lint + typecheck must pass before merge
- No console.log in committed code
- Never commit secrets; `.env.local` is the local secrets sink

## UX standard — TOP PRIORITY

UX must be polished, never rough — even for early demos. Pablo is **very demanding** on UX. Before any UI-heavy surface gets coded:
1. Produce a UX design pass (information hierarchy, wireframes, states, copy)
2. Get explicit sign-off from Alex
3. Only then implement (use frontend-design skill where appropriate)

Reference: **Whoop app** for dark + dense + premium athletic vibe. Brand: black + Fabrik orange. Italic-bold display typography (derivative of Fabrik wordmark).

**El doble** (`app.fahybrid.com/<locale>/design`, grupo `(design)` + `web/components/design-twin/`): réplica viva de la app del atleta para dirigir UX. REGLA: los mockups de UI de la app se construyen como pantallas `propuesta` del doble — nunca más artifacts/HTML sueltos; todo cambio de UX shipeado en Swift actualiza su pantalla `espejo` en el mismo lote; si Theme.swift cambia tokens, `twin.css` cambia en el mismo lote. Ver docs/DECISIONS.md (2026-07-27 «El doble»).

## Workflow

- The `fahybrik` team coordinates work via TaskList at `~/.claude/tasks/fahybrik/`
- Agents claim tasks in ID order (lowest first) when unblocked
- Mark tasks completed via TaskUpdate immediately on finish
- Use SendMessage for inter-agent coordination
- Cross-cutting changes: write a mini-map in chat before executing

## Verification protocol

Before declaring "done" on any non-trivial change, paste a short **Verificado:** block listing 3-5 things you checked. If you couldn't verify something, say so explicitly.

## What NOT to do

- Don't mock the database in tests (use a real Neon branch — see infra/scripts)
- Don't propose LLM models
- Don't default to dark mode in unrelated projects (this one IS dark, by Alex's explicit ask)
- Don't use Sparkles icon, purple/fuchsia AI gradients, or other AI-app clichés
- Don't write working files / scratch markdown to repo root
- Don't commit `.env*` (only `.env.example`)
