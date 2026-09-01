# Obra: la pastilla Carrera en iOS — hub navegable (mapa v2)

**Orden de Alex (13-ago tarde, literal):** *«haz el mock, ya lo iremos cambiando
poco a poco… y por favor que todo esté conectado, todo circular, no puede haber
una cosa en un sitio que no exista».* Los mocks firmables viven en el doble
(`correr-hub`, `correr-historial`, `correr-ficha`, `correr-tendencias`,
`correr-capacidad`, `correr-por-tipo`); esta obra los lleva a Swift.

**Regla dura de esta obra — TODO CIRCULAR:** cada puerta del hub abre una vista
real. Ninguna puerta a ninguna parte; ningún dato pintado sin fuente. Lo que no
tenga motor todavía NO aparece (ni gris, ni «próximamente»).

**Veredicto (decisión, 13-ago):** Alex ve «Vas mejor» como frase gigante y no
sabe qué es. El concepto es nuestro Training Status (estándar de mercado); la
presentación pasa a DATO ETIQUETADO: etiqueta «Estado», frase compacta, y la
evidencia del peldaño debajo en una línea. Mismo motor, cero cálculo nuevo.

**El CTA de tests desaparece del arranque.** `salidaDeLaPantalla` deja de
colgar de la cabecera; la salida por ancla vive en Capacidad (estado sin
umbral) y lanza EL TEST DE ZONAS DE CORRER directo (mismo mecanismo
`WorkoutLaunch`/start que usa `TestsHubView` por tarjeta), jamás la batería.

## Endpoints nuevos (web) — snake_case, bearer atleta, Zod

### 1 · `GET /api/athlete/running/historial?window=7d|30d|365d|all&tipo=<slug>|all`
```
{ aggregates: { km, salidas, seconds, elevation_m },
  tipos: [{ slug, label_es, count }],            // SOLO tipos con sesiones
  weeks: [{ monday: 'YYYY-MM-DD', km,
    rows: [{ assignment_id, fecha, tipo_slug|null, dosis_label|null,
             km, ritmo_s_km|null, fc_media|null, desnivel_m|null,
             origen: 'app'|'imported', record: bool,
             veredicto: 'ok'|'aviso'|null }] }] }
```
- Filas = ejecuciones con modalidad de correr (las importadas también, mig 0191/0192).
- `tipo_slug` se deriva de la ESTRUCTURA prescrita (gramática run-structure:
  series/fartlek/cuestas/progresivo/…); libre o importada sin estructura → null
  (la UI la lista sin chip). JAMÁS texto libre nuevo.
- `veredicto` solo si sale de un dato ya calculado/almacenado barato; si
  costara recomputar compliance por fila, null y se declara en el informe.
- `record`: la sesión coincide (día + contexto) con una entrada de historial de
  marcas del catálogo run; si no es derivable barato, false y se declara.

### 2 · `GET /api/athlete/running/tendencias?window=4w|6m|1y|all`
```
{ buckets: [{ start: 'YYYY-MM-DD', km, seconds, ritmo_medio_s_km|null,
              fc_media|null, desnivel_m|null, vo2max|null, cadencia_spm|null }],
  prev: { km|null, seconds|null, ... }   // ventana anterior del MISMO largo, para deltas
}
```
- Bucket semanal en 4w/6m, mensual en 1y/all. Métrica sin fuente → null en
  todos los buckets (iOS no pinta el bloque).

### 3 · `GET /api/athlete/running/capacidad`
```
{ umbral: { ritmo_s_km, origen_label, hace_dias|null, sin_revisar: bool } | null,
  zonas: [{ z, nombre, desde_s_km|null, hasta_s_km|null, color }],
  records: [{ slug, label_es, contexto: 'street'|'treadmill', segundos, fecha,
              reciente: bool }],
  predictor: [{ distancia_m, segundos, delta_s|null }] | null,
  test_zonas: { slug, label_es } | null }   // el test de correr lanzable, si existe en la batería
```
- REUTILIZAR motores reales: `shared/domain/running/vdot.ts` +
  `mark-projection.ts` (predictor), resolver de zonas existente,
  `shared/domain/athlete/marks.ts` (catálogo cerrado, `run_context` separa
  calle/cinta). CERO fórmulas nuevas.
- SIN `vc` (corregido 13-ago): la velocidad crítica ya tiene motor y pintor
  únicos — el grupo `capacidad` de `/analytics/lecturas`, que la vista iOS
  reutiliza. Servirla aquí también serían dos números para el mismo hecho.
- Tests reales contra rama Neon (patrón `web/tests/**/*.db.test.ts`); OJO
  footgun: jamás apuntar tests a la DB de producción (memoria del symlink).

## iOS (vistas)

- `AnalyticsView`: la sección running gana NavigationStack propio (patrón
  CarrerasView) con destino enum: historial · ficha(assignment) · tendencias ·
  capacidad · porTipo · forma · adherencia · cansado.
- Hub (sustituye la tira): Estado etiquetado + puertas del mock. Bloques
  existentes (Forma/esfuerzos/volumen/pedido/cansado) se MUDAN a sus vistas
  de nivel 1 — no se duplican.
- Ficha: push a `ExecutedWorkoutView(assignmentId:…)` (ya enruta a la lectura
  de carrera). La comparativa «vs tu último 6×800» es TANDA 2 (endpoint aún no
  existe) y queda declarada aquí.
- Por tipo: chips = `tipos` del historial (solo los reales).
- Mi carrera: la puerta cambia a la tab Carreras (AppShell), no duplica.

## Qué NO entra en esta tanda (declarado)
- Comparativa de sesión + historial del mismo entreno dentro de la ficha (T2).
- Vista Por zona (T3, el mapa lo fija).
- Clasificador de tipo para importadas sin estructura (cae a null honesto).
