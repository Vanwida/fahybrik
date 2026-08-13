# Analíticas de Running — el mapa completo (firmado con Alex, 13-ago-2026)

**Objetivo de empresa: que ningún atleta abra Garmin.** Competimos con
TrainingPeaks. Todo lo que Garmin tiene de running lo tenemos nosotros, más lo
que ellos no pueden (coach detrás).

**Principio de UX (de Alex): nada de tira infinita.** La pestaña es un resumen
corto donde **cada bloque es una PUERTA a su propia vista**. Se entra, se mira,
se acciona.

**Regla previa (13-ago): las pastillas mandan.** Carrera lleva SOLO running; el
cuerpo (sueño, HRV, estrés, carga general) vive en Recup.

Leyenda: ✅ hecho · 🟡 a medias · ❌ no existe

---

## NIVEL 0 · La pestaña (corta: veredicto + 6 puertas)

- Veredicto con evidencia ✅
- Seis bloques-resumen, cada uno SE ENTRA a su vista de nivel 1.

## NIVEL 1 · Las vistas propias

### FORMA (se entra)
- VO₂máx tendencia ✅
- Eficiencia al mismo pulso ✅
- Carga run con rango óptimo 🟡
- Historial largo «desde que empezaste» 🟡 (endpoint topaba en 26 sem; ampliado,
  falta la vista)

### CAPACIDAD (se entra)
- Umbral + zonas con procedencia ✅
- Velocidad crítica + D' ✅
- Récords all-time 1k→maratón 🟡 (solo 1/3/5k hoy)
- **Predictor 5k/10k/21k/42k con tendencia ❌**
- Curva de mejores esfuerzos por periodo ✅

### POR TIPO DE ENTRENO (se entra) — ❌ ENTERA · **PRIORIDAD 1**
- Series / Rodajes / Largos / Fartlek / Cuestas / Tempo
- Cada tipo su vista: sus sesiones, progresión del ritmo EN ese tipo,
  adherencia en ese tipo, mejor sesión.
- Ejemplo: «Series» → todos tus 6×800 en el tiempo → ¿voy más rápido en series?

### POR ZONA (se entra) — ❌ ENTERA · **PRIORIDAD 3**
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

## NIVEL 2 · La sesión (post-workout) · **PRIORIDAD 2**
- Curva + banda del coach + splits + mapa + derivados ✅ (13-ago)
- **Comparativa vs tu última sesión similar («vs tu último 6×800») ❌**
- **«Qué cambió» respecto a esa ❌**
- **Historial del mismo entreno (todos tus 6×800 en una lista) ❌**

## TRANSVERSAL
- Periodo en todas las vistas (7d/mes/año/todo) 🟡
- Filtro por tipo en las listas de sesiones ❌
- Comparar dos sesiones a elección ❌
- Cifra → días → sesión ✅ (13-ago)

---

## Los tres agujeros grandes
1. **POR TIPO** — no existe. Es lo que un atleta de series busca a diario.
2. **COMPARATIVA DE SESIÓN** — no existe. Post-workout dice qué hiciste pero no
   contra qué.
3. **POR ZONA** — no existe.

Lo demás son remates sobre vistas que ya están.

## Orden acordado
1º Por tipo · 2º Comparativa de sesión · 3º Por zona · después los remates
(predictor, récords completos, sesgo+ruptura de serie al atleta, filtros).

## Lo que NO entra aquí (otra pestaña / otra tanda)
- Sueño, HRV, estrés, batería, carga general → Recup.
- Comparativas coach-side → panel.
- Historial navegable general (calendario) → ya existe en Plan/Historial.
