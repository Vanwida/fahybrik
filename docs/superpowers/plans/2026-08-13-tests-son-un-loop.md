# Tests son un loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el loop del test: ocurrencia anclada, informe (misma pantalla atleta/coach), archivo por familia, comparativa de homólogos, publicación por Del coach. CMJ es el primer informe completo.

**Architecture:** La unidad es el assignment. `athlete_benchmarks.assignment_id` ancla el número a ESA vez. El informe se deriva al leer (no se guarda un póster). Del coach gana la forma `test_compare` (config = dos assignment ids; se resuelve al servir). iOS y web pintan el mismo DTO.

**Tech Stack:** TypeScript shared domain, Zod, Neon (0195), Next.js, SwiftUI, design twin.

## Global Constraints

- Multi-coach: cero nombres propios en código/copy. WCSE/Pablo son el *defecto* editable.
- Un dato, un sitio. Misma pantalla de informe para las dos caras.
- No sexta pestaña. No sexto `kind` de comunicado. No reutilizar `comparativa` (minutos/zona).
- Precisión honesta: salto se enseña en cm enteros.
- iOS no sale por Vercel. El doble del informe se actualiza en el mismo lote que Swift.
- Commits pequeños, rutas explícitas, nunca `git add -A`. `FOCUS.md` y `DECISIONS.md` en el commit de cierre de cada eslabón.
- Spec: `docs/superpowers/specs/2026-08-13-tests-son-un-loop.md`.

---

### Task 1: La ocurrencia existe

**Files:**
- Create: `infra/migrations/0195_test_occurrence.sql`
- Modify: `web/lib/athlete/record-test-benchmark.ts`
- Modify: `web/lib/coach/test-battery-bridge.ts` (pasar `assignment_id` a cada insert)
- Modify: `web/lib/coach/battery-status.ts` (leer por assignment, no último slug)
- Test: `web/tests/jump/occurrence.db.test.ts` (o extender el db test de battery-status)

**Interfaces:**
- Consume: `recordTestBenchmark(sql, event)`
- Produce: `recordTestBenchmark(sql, event, { assignment_id?: number })`; `CalibrationTestStatus` sigue igual de cara, pero `result_captured` / `jump_profile` / `result_label` salen de ESA assignment.

- [x] Migración 0195: columna `assignment_id` nullable + índice + backfill conservador (un assignment por slug, o mismo día).
- [x] Writer: el puente de batería escribe el id. Ritmos / Marcas / onboarding no.
- [x] Reader: `loadBatteryStatus` agrupa por `assignment_id`. Fallback CMJ: `jump_attempts` de esa assignment.
- [x] Test: dos CMJ del mismo atleta → dos perfiles distintos. El segundo no pisa el primero.
- [x] Commit.

### Task 2: DTO de informe + renderer CMJ

- [x] `shared/domain/test-report/cmj.ts` + test del caso 47,33 / 39,38 / 15 / 76 / LRI 0,85.

### Task 3: Pantalla de informe (web + iOS + doble)

- [x] Web `CmjInforme` sustituye el diálogo. iOS `JumpReportView` pinta el DTO. Doble `test-informe`.

### Task 4: Archivo por familia

Fuerza (coach) y TestsHub (atleta) agrupan por `TestFamily` → protocolo → ocurrencias. Tocar una hecha abre el informe de ESA fila.

### Task 5: Comparativa de homólogos

Config = dos assignment ids del mismo slug. CMJ compara cm/LRI. El que calibra añade escalera (reusar propuesta `test-comparativa`). Sin homólogo no hay CTA.

### Task 6: Del coach `test_compare`

Nueva forma de sección. «Dar feedback» desde la comparativa. iOS pinta. No es un sexto kind.

---

Cada task deja un eslabón que el otro lado puede abrir. No se fusiona un informe que iOS no pinta.
