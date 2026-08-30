# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-30** (clase 1: liveStart no sobrevive a Health)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**Walk `b30994bd` (Mac, compile SUCCESS, CFBundleVersion 22, Libre 1×800):**
Health Review, luego «Abre FAHYBRID en el iPhone» + teléfono rojo. Nunca
entró. Nunca 3 páginas. Nunca pausa. iPhone SIN RELOJ. GPS=map 24→393 m.
Recap SÍ (385 m, 2:26, 6:19/km) — no tocar. Sin HR/zonas: no hubo sesión.

**Por qué el delete de `beginCollection` no cambió el walk.** Ese teardown
va DESPUÉS de `startActivity`. El walk nunca llegó. Health Review es
`requestAuthorization` («Asynchronously requests permission»). Se llamaba
ANTES de `startActivity`. Sin sesión, `handleActiveWorkoutRecovery` y
`recoverActiveWorkoutSession` no tienen nada que recuperar. Tras el sheet
el proceso nace idle: `handle(_:)` no se reentrega (`startWatchApp` ya
lanzó); `liveStart` iba por mensaje/userInfo (se consume) y un
`updateApplicationContext` de `today` lo borraba. Idle + sin `today` =
EmptyState.

**Borrado:** el gate auth→sesión. `startActivity` ya. `liveStart` viaja
en el applicationContext CON el día. El aviso se guarda en disco y se
pide al lanzar. `handleActiveWorkoutRecovery` recupera la misma primary
si Apple la tiene. Sin segundo dueño. Sin reintento de `startWatchApp`.
Sin bump de versión. Sin tocar el copy.

**Dueño:** `LiveWorkoutSession`. El espejo no crea sesión.

**105 CORTADA.** `datos | VIVO | controles`.

## Cerrado en código (esta PR · el por qué en DECISIONS)

**Borrado:** el segundo primary · matar la sesión si `beginCollection`
falla · el gate Health-antes-de-sesión · `abandon()` · CONECTANDO ·
`hasRecordedWork` · capa de km · `tickTimer` · cinta de la muñeca ·
degradado · `TabView` sobre el paginador · velos.
**Arreglado:** recap = telemetría · `finish()` escribe la pierna abierta.
**Descartado:** `WatchRunLegDriver` · no rellenar descanso con `rest_s`.

## Pendiente de esta rama

1. **BLOQUEANTE: el km no se canta.** Decide Alex. No se inventa voz.
2. Reloj en solitario: `LiveFlowView` — dos looks.
3. Ruta en `HKWorkoutRouteBuilder`. Crono a 6 glifos / 99 min. «Sin señal»
   en cinta sin emparejar. Span del historial.

**SIN COMPILAR AQUÍ:** no hay Xcode. Este turno no se compiló.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM`
(`S6W4459DDG`). Neon no. Analítica 178 no. **105 cortada.**
