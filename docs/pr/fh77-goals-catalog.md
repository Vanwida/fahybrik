# FH-77 — Catálogo de objetivos (goals catalog)

**Build 88.** Extiende el modelo `events` + `races` existente — no hay segundo catálogo.

## Modelo

Un **objetivo** del atleta sigue siendo una fila `races` (prioridad `target` | `secondary` | `tune_up`) enlazada opcionalmente a `events` vía `event_id`.

| Capa | Qué es |
|---|---|
| `events` | Catálogo compartido (scraper / coach / admin) + eventos **custom privados** del atleta (`athlete_id`, `source='athlete_custom'`) |
| `events.type` | Categoría amplia: `hyrox` · `crossfit` · `running` · `ocr` · `other` |
| `events.series` | Marca / circuito (whitelist DB + Zod, escape `other`) |
| **Familia UI** | Derivada en código (`shared/domain/objectives/catalog.ts`): Running · Híbrida · CrossFit · OCR · Otro — agrupa el picker, no es columna |
| `races.*` objetivo | Atributos de participación: HYROX conserva `format`/`division`/`gender`; otros formatos usan `objective_variant`, `division_label`, `distance_meters`, `homologada` |

### Familias → type + series

- **Híbrida:** `type=hyrox` o series `hyrox`, `deka`, `athx`, `deadly_dozen`, `hunter_race`
- **CrossFit:** `type=crossfit` o series `cf_*`, `wodapalooza`
- **Running:** `type=running` o series `rfea`
- **OCR:** `type=ocr` o series `spartan`
- **Otro:** resto / `series=other`

### Series nuevas (migration 0210)

`hunter_race`, `rfea`, `spartan`, `cf_open`, `cf_quarterfinals`, `cf_semifinals`, `cf_games`, `cf_throwdown`, `wodapalooza` (+ existentes + `other`).

### Hunter Race (híbrida)

Formatos fijos (fuente hunter-race.com, sin scraper day-1):

| variant | Carrera | Estaciones |
|---|---|---|
| `legend` | 13 km | 7 |
| `alpha` | 7 km | 7 |
| `sprinter` | 3.5 km | 7 |

Se guarda en `races.objective_variant`. **Sin goal-gap por estaciones** — no hay modelo de 8 tramos HYROX.

### Running

Presets de distancia (m): 5000 · 10000 · 21100 · 42200 · custom → `races.distance_meters`.  
Homologada RFEA → `races.homologada` (nullable bool).

### CrossFit

Series whitelist para tipo de competición; división = texto libre (`division_label`).

## Flujos

1. **Calendario:** `GET /api/races/calendar?family=&q=&…` — eventos visibles + custom del atleta; facet `family` en servidor.
2. **Custom:** `POST /api/athlete/events/custom` → crea `events` privado → el picker navega a fijar objetivo.
3. **Fijar:** `POST /api/athlete/races/target` — campos HYROX opcionales; añade `objective_variant`, `division_label`, `distance_meters`, `homologada`.
4. **Varios objetivos / uno plan:** invariante existente — un solo `priority='target'`; el resto `secondary`/`tune_up`. Promote sin cambios.

## Goal-gap / predicho

Solo `event_type === 'hyrox'` (singled HYROX con modelo 8+8). Cualquier otro objetivo: fecha + tipo + tiempo opcional; `availability: no_data` sin segmentos inventados.

## Fuera de alcance (ticket)

Scrapers por marca, planes Hunter/CF Open, IAP, BLE/Watch live, día de competición.

## Smoke

- Running no-HYROX + custom
- Hunter (Legend/Alpha/Sprinter)
- Varios objetivos, uno target
- HYROX sin regresión; Hunter sin tablero de estaciones
