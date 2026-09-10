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

**Fecha obligatoria:** un objetivo sin fecha no entra en el orden temporal. El atleta siempre indica *para cuándo es* — en custom, al fijar un evento TBD del catálogo, y el servidor rechaza custom sin `start_date`.

## Cambios

### iOS
- Eliminado `SolicitarCarreraView.swift` y flujo ask-coach en `BuscarCarreraSheet`.
- Conservado: catálogo + «Crear objetivo personalizado» (FH-77).
- Copy custom sin implicar verificación del coach.
- `CrearObjetivoCustomView`: fecha obligatoria (sin toggle «Sé la fecha»).
- `FijarObjetivoView`: si el evento del catálogo no tiene fecha confirmada, pide «Para cuándo es» antes de fijar.

### Web coach
- `CarrerasTab`, `TargetRaceCard`: solo lectura.
- Eliminado `SetTargetRaceModal`.

### API / MCP
- `POST/DELETE /api/coach/athletes/[id]/races/target` → **403**.
- MCP `set_target_race` eliminado.
- `POST /api/athlete/events/custom`: `start_date` obligatorio (400 si falta).
- `POST /api/athlete/races/target`: `start_date` obligatorio cuando el evento es undated/tentative; persiste en `events` + `races`.

## Preservado
- FH-77 familias/custom del catálogo.
- Goal-gap HYROX únicamente (`event_type === 'hyrox'`).

## Verificación Owner
Archive + TestFlight build **92** (no Done hasta TF).
