# FOCUS — FAHYBRID

Estado vivo del proyecto. Se actualiza en el mismo commit que el trabajo.
Última actualización: **2026-07-25**

---

## En qué estamos ahora

**Definir la metodología propia de FAHYBRID.**

El problema de fondo: tenemos tecnología pero no método. Pablo no tiene uno documentado y su referencia es la metodología del entrenador que le entrena a él como atleta — que no es la dirección que queremos. La salida no es discutirle el contenido, es darle un **marco ya decidido y modificable**, para que su trabajo sea corregir en vez de crear.

La tesis de trabajo: *la identidad de un método no está en los ejercicios, está en las reglas*. Los ejercicios los usa todo el mundo; lo que nos hace reconocibles es cómo decidimos, medimos y ajustamos.

---

## Acaba de cerrarse (25-jul)

- **El sistema en seis capas** — las seis decisiones que componen un plan, y en cada una qué fija el sistema y qué elige el coach. → `docs/methodology/sistema-seis-capas.html`
- **La metodología en una página** — la columna del coach, rellenada por nosotros: reglas, fases, pruebas, sesiones, progresión, ajuste diario y variación por formato. → `docs/methodology/metodologia-fahybrid.html`
- **Batería de pruebas** — 4 pruebas (5K, remo 2K, 1RM, media simulación). Ya construida y funcionando en producto. → `docs/methodology/test-battery-reference.html`
- **Modelo de fases** — Base → Potencia → Ritmo → Pico → Desconexión. 13–19 semanas. Sin entidad de fase en schema (respeta la decisión de la migración 0064). → `docs/methodology/modelo-de-fases.html`
- **Catálogo de sesiones** — 18 tipos en 4 familias. ⚠️ **A REHACER**: se ajustó contra ficheros del repo que no son material propio. Hay que rederivarlo desde las exigencias de la carrera. → `docs/methodology/catalogo-tipos-sesion.html`
- **Reglas de progresión y ajuste** — progresión semanal, fuerza por RIR, bandas de readiness (67/45), límites de seguridad y reincorporación. → `docs/methodology/reglas-de-progresion.html`
- **Formatos y cargas de HYROX** — cargas oficiales por división verificadas contra el reglamento 25/26 y 26/27, y qué implica cada formato para el entrenamiento. → `docs/design/formatos-y-cargas-hyrox.html`

---

- **Derivación desde la carrera** — el origen de la metodología: las 7 exigencias del evento y qué se entrena por cada una. Regla: un tipo de sesión solo existe si traza hasta una exigencia. → `docs/methodology/derivacion-desde-la-carrera.html`

---

## Lo siguiente

1. Que Pablo revise la metodología y corrija lo que no le encaje. Su trabajo es **corregir, no crear**.
2. Los nombres de las fases son decisión de Alex — pendientes de visto bueno.
3. Decidir si la metodología pasa a ser contenido editable en el dashboard o se queda como documento de referencia.

---

## Hilo paralelo: RELOJES — el entreno en la muñeca (prioridad máxima, 25-jul)

Registro vivo, visual: → `docs/design/relojes-entreno-en-la-muneca.html`

**Premisa de Alex:** máxima conectividad. Que el entreno llegue al reloj siempre que se pueda, y donde no (Polar), que la app lea del dispositivo todo lo posible.

**El diseño:** una estructura canónica + un codificador por marca. Dos reglas de dominio que no se negocian: las zonas viajan como banda ABSOLUTA (la Z4 de un Garmin sale de otra FCmáx), y lo que el reloj no puede vigilar (RPE) va como tramo abierto, nunca como objetivo inventado. Fuerza/EMOM/AMRAP quedan fuera a propósito: ningún formato de fabricante los modela.

**Construido y en la rama:** modelo neutro · codificador .FIT de Garmin + endpoints · guías de Suunto (44 tests) · WorkoutKit para Apple Watch · app Connect IQ (`garmin-ciq/`, sin compilar aún) · dos bugs de Zepp que impedían entrar y ver el día · el permiso de Salud del onboarding que no arrancaba la sync.

**Puede empujarse el entreno a:** Apple (nativo, sin permisos), Garmin (vía Connect IQ, NO depende de la API parada), Suunto (spec pública), COROS (solicitud enviada 25-jul). Polar es solo lectura. Wear OS y Fitbit están muertos para iPhone.

**Lo siguiente:**
1. Los **65 segmentos de carrera que aún no se convierten**: `legacyToStructure` filtra por `scheme` cuando debería filtrar por MODALIDAD, así que un bloque con `sets[]` y scheme `sets`/`rounds`/`interval` nunca llega a su Path A. Es dominio compartido con el editor del coach.
2. Aflojar el filtro del Apple Watch a «el trabajo principal es carrera» (hoy exige un solo item → en producción eso es cero sesiones).
3. **Bug vivo camino de iOS:** `web/lib/athlete/assignment-detail.ts:918` resuelve un target `hr_zone` con `resolvePaceBandFromZones(...,'per_km')` — una zona de PULSO sale como banda de RITMO.
4. Dejar vivos `/api/coros/webhook` y `/api/coros/status`, declarados en la solicitud a COROS.
5. Instalar el SDK de Connect IQ y compilar `garmin-ciq/` (nunca ha pasado por el compilador).

**Pendiente de Alex:** formulario de Suunto · qué modelo de Garmin llega la semana que viene · OK a la migración que añade `suunto` y `amazfit` al enum `biometric_source`.

**Hardware de pruebas:** el Kiprun *by Coros* de Gerard sirve para COROS (confirmar que pone «by Coros»; el GPS 500 viejo no vale). Para Garmin, Forerunner 165 de 2ª mano, 145-170 €.

---

## Pendiente de decisión

- **Nombres de las fases** (Base / Potencia / Ritmo / Pico / Desconexión) — subjetivo, decide Alex.
- **Reparto de participantes por división en HYROX** — no es dato público y las fuentes que circulan se contradicen. Existe un estudio de la Universidad de Granada (278.063 atletas) que probablemente lo tiene, de pago. Decidir si se compra antes de fijar estrategia por segmento.
- **Nutrición** — fuera de alcance por ahora. Se retoma después del lanzamiento.

---

## Contexto que no está en el código

- La marca es **FAHYBRID** (con D). `FAHYBRIK` es solo el nombre heredado del repo, Vercel y Neon.
- Los tres perfiles de atleta que esperamos: **dobles Open**, **dobles Pro** y **single Pro**. El grueso será dobles; el single Pro es la punta que da credibilidad.
- Competencia directa: TrainingPeaks, comprado por Garmin el 22-jul-2026. Nadie en el mercado diferencia metodología por división.
