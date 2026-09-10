# FH-106 — Goals owner alignment (athlete owns targets)

**Build 92.** El atleta es dueño de sus objetivos; el coach solo los ve.

## Modelo de propiedad (binding)

| Actor | Puede | No puede |
|---|---|---|
| **Atleta (iOS)** | Elegir/cambiar/quitar objetivos del calendario o custom (`POST/DELETE /api/athlete/races/target`) | Pedir al coach que añada carreras (flujo eliminado) |
| **Coach (web)** | Ver próximas + pasadas en ficha (`GET /api/coach/athletes/[id]/races`) | Fijar/cambiar/quitar objetivo del atleta |
| **Coach (MCP)** | `get_races` (lectura) | `set_target_race` (eliminado) |
| **Coach (catálogo)** | Sembrar eventos compartidos (`POST /api/coach/events`) | — |

Lista de objetivos ordenada por tiempo (soonest-first), misma proyección en app y panel.

**Fecha obligatoria (un solo modelo mental):** todo objetivo tiene un *cuándo* concreto. Crear custom y fijar del catálogo usan el mismo bloque «Para cuándo es» (`ObjectiveWhenSection`). Catálogo con fecha → pre-rellena y el atleta confirma; TBD → el atleta elige; custom → obligatorio. `start_date` siempre viaja en `POST /api/athlete/races/target` y ordena la lista.

## Cambios

### iOS
- Eliminado `SolicitarCarreraView.swift` y flujo ask-coach en `BuscarCarreraSheet`.
- Conservado: catálogo + «Crear objetivo personalizado» (FH-77).
- Copy custom sin implicar verificación del coach.
- `CrearObjetivoCustomView`: fecha obligatoria (sin toggle «Sé la fecha»).
- `ObjectiveWhenSection`: UX compartida custom + catálogo; siempre visible al fijar.
- `FijarObjetivoView`: pre-rellena fecha del catálogo; hint extra solo si TBD.

### Web coach
- `CarrerasTab`, `TargetRaceCard`: solo lectura.
- Eliminado `SetTargetRaceModal`.

### API / MCP
- `POST/DELETE /api/coach/athletes/[id]/races/target` → **403**.
- MCP `set_target_race` eliminado.
- `POST /api/athlete/events/custom`: `start_date` obligatorio (400 si falta).
- `POST /api/athlete/races/target`: `start_date` **siempre** obligatorio; `races.race_date` = confirmación del atleta; persiste en `events` si TBD o custom privado.

## Preservado
- FH-77 familias/custom del catálogo.
- Goal-gap HYROX únicamente (`event_type === 'hyrox'`).

## Verificación Owner
Archive + TestFlight build **92** (no Done hasta TF).
