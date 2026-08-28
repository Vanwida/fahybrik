# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (sesión ready: me + start)

## Ahora

**SESIÓN READY · PR 91** (`cursor/live-un-motor-0406`). EMPEZAR un
día prescrito se quedaba en overlay blanco + spinner. GET detail
ya es 200. GET `/api/auth/me` en Preview era 500 vacío — misma
clase que el detail: el lector nombra columnas que Preview Neon
puede no tener (`athletes.avatar_url` 0179, `club_skin_*` 0199).
El actor de red de iOS encolaba el GET del día detrás de ese me.

Lectura: `to_jsonb(a)` del perfil; `select *` de la piel; club
null si 42703. iOS: `/me` va por `APIClient.identity`; loadPlan
tiene presupuesto 20 s; retomar deja `.ready`.

**NO es hecho de producto.** No se camina el sim. No merge.
Hecho de código: me no 500 vacío; start no depende de un me
roto. Tests de la clase.

No tocar: plan del 67, 105, HUD live, Watch, forks de formato,
inventario de bloques, `DEVELOPMENT_TEAM` (`S6W4459DDG`).
Neon de producto no.
