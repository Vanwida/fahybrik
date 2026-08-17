# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-17** (clonabilidad iOS: marca en un solo ajuste)

## Ahora

**Trunk 17-ago:** #27 HUD apaisado · #26 Cómo entrenas · #28 ficha Club.
En `integration/trunk`. No main.

**Dominio compartido iOS/watchOS (`feat/ios-shared-core`, PR abierto):** los ~50
`- path:` a mano del target del reloj mueren. Nace `ios/FAHYBRIKCore/` (52
ficheros, subruta intacta) y la incluyen entera los dos targets, así que lo
compartido lo dice la carpeta. No es módulo Swift aparte a propósito:
`WorkoutModels` alcanza `APIClient` bajo `#if !os(watchOS)` y un framework no
puede depender de su host. Guardián = la build normal (la app embute el reloj).
Ley: DECISIONS 17-ago «lo dice la carpeta». Sin cambios de pantallas ni de firma.

**Ficha Club:** nombre, logo y acento por `coach_id`. Vacío = marca de este
binario. Ruta `/club`, API `/api/coach/club`. No iOS.

**Cómo entrenas:** siete capítulos + espejo + GET/PUT + `/es/como-entrenas`.
Guardar a mitad (autosave 700ms). PUT incompleto; composers notas/plan ven el
espejo; vacío no inventa método. No #23. No #25.

**Copy de periodización:** ya en trunk (#21). Docs vivos, app-store, guía y
comentarios de producto alineados al orden de microciclos que nombra el coach.

**FLEXR copy IDs:** ya en trunk (#20). Emails/team/Neon/Vercel docs del tip
pasan a placeholder o env.

**Clonabilidad iOS (`feat/ios-flexr-clone-gaps`, PR abierto):** marca, bundle id,
dominio, esquema y equipo de firma pasan a 5 ajustes de `settings.base`; los tres
Info.plist, los entitlements y `Marca.swift` (en Core → también reloj) los
expanden. Corregido `FAHYBRIK · Reloj` visible en ajustes de Zepp. Valores
resueltos idénticos (verificado en el bundle construido). Huecos que NO se tocan
—UUID de Connect IQ, appId de Zepp, firma ASC, y la firma de WorkoutKit que dos
marcas compartirían— en `docs/ios-clonabilidad.md`. Sin FLEXR repo.

**Carrera hogar: SHIPEADO en Swift** (13-ago noche, orden directa de Alex:
«haz el mock… dale» — supersede el «sin Swift hasta firmar» de antes). Hub
navegable en la pastilla (Estado etiquetado, sin CTA de tests) + Historial /
Tendencias / Capacidad / Por tipo / Forma / Pedido / Cansado + endpoints
`/api/athlete/running/*` + `shared/domain/running/session-type.ts`. Build OK,
suite iOS 1503/0. Ley: DECISIONS 13-ago (noche). Tandas: comparativa de
sesión (T2) · por zona (T3) · veredicto por fila · volcados tira→hub.
Plan personal sin periodización (atleta 64): cerrado. Tests = loop: informe
CMJ montado + Dar feedback (Del coach, forma `test_result`, mig 0196).
Falta archivo por familia y comparativa de homólogos.

## Espera Alex

- Instalar la build de iOS y probar el hub de Carrera (la instala él).
- Chat contextual: `/es/design/chat-contexto`.
- ZIP GDPR Garmin para validar el importador FIT.

## Parqueado (no tocar)

Onboarding 15 agujeros · 29 rutas coach sin pantalla · `coach_methodology`
vacía · vivo ergo/AMRAP/FT · 22 bloques incompletos · 20 secuencias.

## Ley

`docs/DECISIONS.md`. Se cita la entrada de la pieza, no se pega el fichero.

## Regla de gasto

Un átomo por sesión de agente. Grok default. Claude solo UI gorda.
Bugs 1–3 líneas: Hermes. FOCUS no se hincha: si hace falta relato, va al tablero.
