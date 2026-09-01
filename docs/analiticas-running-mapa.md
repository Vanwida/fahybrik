# Analíticas de Running — el mapa completo (v2 · 13-ago-2026, tarde)

**Objetivo de empresa: que ningún atleta abra Garmin.** Competimos con
TrainingPeaks. Todo lo que Garmin tiene de running lo tenemos nosotros, más lo
que ellos no pueden (coach detrás).

**v2 — la corrección de Alex con la app en la mano (13-ago tarde).** La pastilla
Carrera no es «una analítica»: es **EL HOGAR del running del atleta**. Su
histórico, su análisis en profundidad, sus tendencias — todo lo que miraría en
Garmin vive aquí dentro y **se navega** (adelante y atrás, push real). La v1
acertó el contenido y falló la forma: se construyó como UNA pantalla con scroll
y un CTA de tests que abría la batería entera (1RM de squat incluido) nada más
entrar. Cambios v1→v2:

1. **Navegación push real** (NavigationStack en la tab). Cada bloque del hub ES
   una puerta de verdad, no una sección de la misma tira.
2. **El HISTORIAL de carreras entra en la tab.** La v1 lo mandaba a
   Plan/Historial; revocado por Alex: «que pueda ver su histórico… todo el
   running va ahí dentro». Plan/Historial sigue existiendo (calendario general,
   todas las modalidades); esto es la vista DE RUNNING, con sus agregados.
3. **Nueva vista TENDENCIAS** — informes por métrica y periodo (lo que Garmin
   llama Reports): km/semana, tiempo, ritmo, FC, desnivel, VO₂máx.
4. **La ficha de sesión se alcanza desde dentro de la tab** (historial → ficha),
   no solo al terminar de entrenar.
5. **El CTA de tests sale del arranque.** Vive donde falta el dato (Capacidad →
   umbral sin ancla) y aterriza en el camino de zonas de correr — jamás en la
   batería entera. Regla ya escrita en memoria: cada CTA aterriza en SU arreglo.
6. **Récords y predictor** suben de «remate» a parte estructural de Capacidad.

**Principio de UX que se mantiene (de Alex): nada de tira infinita.** El hub es
un resumen corto donde **cada bloque es una PUERTA a su propia vista**.

**Regla que se mantiene (13-ago): las pastillas mandan.** Carrera lleva SOLO
running; el cuerpo (sueño, HRV, estrés, carga general) vive en Recup.

Leyenda: ✅ hecho · 🟡 a medias · ❌ no existe

---

## NIVEL 0 · El hub (corto: veredicto + puertas)

- Veredicto con evidencia ✅ (se queda como cabecera; SIN CTA de tests)
- **Este mes** — km, tiempo, salidas, desnivel + mini barras → puerta a TENDENCIAS ❌
- **Tus carreras** — las 3 últimas → puerta a HISTORIAL ❌
- **Forma** → su vista 🟡 (bloques existen en la tira; falta la vista propia)
- **Capacidad** → su vista 🟡 (ídem)
- **Por tipo** → su vista ❌
- **Lo que te piden** → su vista 🟡
- **Correr cansado** → su vista 🟡
- **Mi carrera** → ENLACE a la tab Carreras (no duplicar) ✅

## NIVEL 1 · Las vistas propias

### HISTORIAL (se entra) — ❌ ENTERA · **PRIORIDAD 1 (v2)**
- Agregados del periodo arriba (km, salidas, tiempo, desnivel).
- Filtro por tipo y periodo (7d/mes/año/todo); filtros plegados (contrato §6.2).
- Filas agrupadas por semana con subtotal de km (como Garmin).
- Fila: fecha, tipo/nombre, km, ritmo, FC, insignia de récord, punto de
  veredicto si fue prescrita.
- Cada fila → FICHA DE SESIÓN (nivel 2).

### TENDENCIAS (se entra) — ❌ ENTERA · **PRIORIDAD 2 (v2)**
- Periodos: 4 semanas / 6 meses / año / todo.
- Una serie por métrica con media del periodo: km/semana, tiempo, ritmo medio,
  FC media, desnivel, VO₂máx, cadencia (solo si hay fuente).

### FORMA (se entra)
- VO₂máx tendencia ✅ · Eficiencia al mismo pulso ✅ · Carga run con rango
  óptimo 🟡 · Historial largo «desde que empezaste» 🟡 (endpoint ampliado,
  falta la vista)

### CAPACIDAD (se entra)
- Umbral + zonas con procedencia ✅
- Velocidad crítica + D' ✅
- Récords all-time 1k→maratón 🟡 (solo 1/3/5k hoy; catálogo cerrado, calle y
  cinta separados — decisión ya escrita)
- **Predictor 5k/10k/21k/42k con tendencia ❌**
- Curva de mejores esfuerzos por periodo ✅
- El CTA del test de zonas vive AQUÍ (estado sin ancla) y aterriza en el camino
  de zonas de correr ❌
- Tocar una zona → POR ZONA (P. más abajo)

### POR TIPO DE ENTRENO (se entra) — ❌ ENTERA
- Series / Rodajes / Largos / Fartlek / Cuestas / Tempo
- Cada tipo su vista: sus sesiones, progresión del ritmo EN ese tipo,
  adherencia en ese tipo, mejor sesión.
- Ejemplo: «Series» → todos tus 6×800 en el tiempo → ¿voy más rápido en series?

### POR ZONA (se entra) — ❌ ENTERA
- Tocas Z4 → tiempo en Z4 por semana, sesiones donde la pisaste, ritmo medio
  en ella.

### COMPROMETIDO (se entra) — 🟡 solo bloque-resumen
- Vista propia: tendencia, las parejas fresco-vs-cansado que la componen,
  desglose por estación. (Garmin NO tiene esto; es nuestro.)

### ADHERENCIA (se entra) — 🟡
- % dentro ✅ · sesgo del fallo (rápido/lento) 🟡
- **Dónde se rompe dentro de la serie (rep 4-5-6) ❌** (en el panel del coach
  sí; al atleta no)
- Por tipo de sesión ❌

### MI CARRERA (se entra)
- Días + predicho ✅ · camino al objetivo ✅ (vive en Carreras: ENLAZAR, no
  duplicar)

## NIVEL 2 · La ficha de sesión · alcanzable desde el historial

- Curva + banda del coach + splits + mapa + derivados ✅ (13-ago; hoy solo
  post-entreno — falta alcanzarla por push desde el historial ❌)
- **Comparativa vs tu última sesión similar («vs tu último 6×800») ❌**
- **«Qué cambió» respecto a esa ❌**
- **Historial del mismo entreno (todos tus 6×800 en una lista) ❌**
- Insignias de récord detectado en la sesión 🟡 (catálogo existe)

## TRANSVERSAL
- Periodo en todas las vistas (7d/mes/año/todo) 🟡
- Filtro por tipo en las listas de sesiones ❌
- Comparar dos sesiones a elección ❌
- Cifra → días → sesión ✅ (13-ago)

---

## Cobertura vs Garmin — lo que NO entra, y por qué (descartes declarados)

- **Dinámica de carrera** (oscilación vertical, contacto suelo, zancada):
  requiere sensor que no tenemos conectado. Si un FIT importado la trae, se
  guarda; no se pinta hasta tener fuente viva. Honestidad del dato (§7).
- **Training Status / Readiness / carga general**: viven en Recup — las
  pastillas mandan.
- **Potencia de carrera / Stamina**: sin fuente. No se inventa.
- **Clima y zapatillas (gear)**: candidatos de otra tanda; no estructurales.
- **GAP / ritmo ajustado a pendiente**: tenemos altitud + velocidad en la traza
  → motor posible. Remate futuro, no estructura.
- **Social/heatmaps/badges genéricos**: no es el producto (el coach es la capa
  social).

## Los agujeros grandes (v2)
1. **NAVEGACIÓN** — la tab no tiene push. Es la condición de todo lo demás.
2. **HISTORIAL + TENDENCIAS** — el atleta no puede ver sus 160 km del mes.
3. **POR TIPO** — lo que un atleta de series busca a diario.
4. **COMPARATIVA DE SESIÓN** — post-workout dice qué hiciste pero no contra qué.
5. **POR ZONA.**

## Orden acordado (v2)
1º Navegación + hub v2 + Historial · 2º Ficha alcanzable + comparativa ·
3º Tendencias · 4º Por tipo · 5º Por zona · después los remates (predictor,
récords completos, sesgo+ruptura de serie al atleta, filtros, GAP).

## Lo que NO entra aquí (otra pestaña / otra tanda)
- Sueño, HRV, estrés, batería, carga general → Recup.
- Comparativas coach-side → panel.
- El calendario general multimodalidad → Plan/Historial (sigue siendo suyo).
