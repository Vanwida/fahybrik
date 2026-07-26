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
- **Batería de pruebas** — 4 pruebas (5K, remo 2K, 1RM, media simulación). Ya construida y funcionando en producto. → `docs/methodology/test-battery-reference.html`
- **Modelo de fases** — Base → Potencia → Ritmo → Pico → Desconexión. 13–19 semanas. Sin entidad de fase en schema (respeta la decisión de la migración 0064). → `docs/methodology/modelo-de-fases.html`
- **Reglas de progresión y ajuste** — progresión semanal, fuerza por RIR, bandas de readiness (67/45), límites de seguridad y reincorporación. → `docs/methodology/reglas-de-progresion.html`
- **Formatos y cargas de HYROX** — cargas oficiales por división verificadas contra el reglamento 25/26 y 26/27, y qué implica cada formato para el entrenamiento. → `docs/design/formatos-y-cargas-hyrox.html`

---

- **Derivación desde la carrera** — el origen: las 7 exigencias del evento y qué se entrena por cada una. Regla: un tipo solo existe si traza hasta una exigencia. → `docs/methodology/derivacion-desde-la-carrera.html`
- **Los 16 tipos de sesión** — derivados de las 7 exigencias, cada uno con su sesión de ejemplo completamente especificada. → `docs/methodology/catalogo-tipos-sesion.html`
- **La semana** — 6 días de 2-3 bloques. Base 8h30 · Potencia 8h35 · Ritmo 7h25 · Pico 3h40. → `docs/methodology/la-semana.html`
- **Comparativa a 5 semanas de competir** — nosotros contra el Excel y contra TrainingPeaks, misma fase. → `docs/methodology/comparativa-semana.html`
- **EL MANUAL** — todo lo anterior navegable en una sola página, pensado para que un entrenador nuevo entienda cómo trabajamos. También publicado en `web/public/metodo.html`. → `docs/methodology/manual.html`
- **`time_cap`** — objetivo nuevo de prescripción: un reloj a batir en vez de una intensidad. Es lo que hace prescribible la roxzone. Cero migraciones (vive en `prescription_json`). 11 tests.

### Contraste contra fuentes externas (transcripciones de YouTube, 25-jul)

Fuente: `~/Public/projects/health-planning/coach-methodology/sources/youtube` (16 ficheros). Se usaron **solo para buscar contradicciones**, nunca como contenido — el riesgo era derivar hacia "lo que hace todo el mundo".

Lo que cambió a raíz del contraste:
- **Tipo 16 añadido** (velocidad y potencia). Faltaba: las series cortas son ritmo submáximo y la fuerza máxima son 1-5 repes; ninguno entrena producir fuerza *rápido*. Dos creadores independientes convergen.
- **Jerarquía codificada en la semana**: el aeróbico manda porque manda en la prueba. Antes el catálogo era un menú plano que permitía una semana 50/50.
- **Sim completa fuera de Pico** → al final de Ritmo. Meter un esfuerzo máximo de 70 min en la descarga contradice el único consenso unánime.
- **Techo de 150 m de sled por sesión**, calentamiento incluido; push y pull separados desde Ritmo.

Lo que se confirmó bien: nuestro modelo de dos anclas (tempo 4:32 vs ritmo de carrera 5:07) es más fino que la simplificación de las fuentes; nuestras reglas de HRV son más estrictas que el contenido popular; y **ninguna de las 11 fuentes de HYROX menciona la roxzone como entrenable** — ahí vamos por delante.

Aviso de calibración: 6 de los 11 vídeos de HYROX son del mismo creador, así que lo que parece consenso es una voz repetida.

### Cierre del 26-jul

- **19 tipos de sesión** (eran 16). Nuevos: sled a sobrecarga, máximo en tiempo fijo y fuerza de tren superior. La **movilidad queda fuera a propósito**: no traza a ninguna exigencia, es bloque dentro de otras sesiones.
- **Dos datos corregidos, los dos míos:** la zona 2 salía de 220−edad y el sistema usa Tanaka (banda real 119-138 ppm); y el sled como 117% de la sentadilla era el mejor caso — es 126% en single Pro, 136% en mujer Open y 145% en hombre de 52.
- **`time_cap` cerrado en web e iOS.** En iOS caía en el `default` y llegaba al atleta como `.unknown`: el objetivo desaparecía sin aviso. Build en verde, 675 tests.
- **La analítica de roxzone NO se construye todavía.** El lado carrera tiene datos (`roxzone_seconds` desde la 0054); el lado entreno tiene **cero filas**, porque `time_cap` acaba de nacer y ningún coach lo ha usado. No hay hueco de esquema: es de adopción. El editor V2 ya ofrece «Tiempo tope» en un ítem de circuito — en cuanto Pablo prescriba una línea así y alguien la ejecute, habrá qué comparar.
- **FCmáx: no hace falta test nuevo.** El pico de carrera llega al 99% de la FCmáx de laboratorio y lo produce wall balls, la última estación. Tres enmiendas de coste cero: esprint final explícito en 5K y remo, registrar el pulso de wall balls en la media simulación como campo propio, y banda de pecho obligatoria en esos tests (el óptico de muñeca falla justo en remo y wall balls).

**Pendiente de decisión (tuyo):**
1. El método es **ciego a la edad**. Para un atleta de 52: bajar compromised running a 1/semana, descarga cada 2-3 en vez de 3-4, y 72 h entre días duros en vez de 48.
2. Las 8h30 de Base son iguales para todos. Sin resolver si un single Pro necesita más.
3. El atleta de dobles entrena el 100% del volumen de estación en solitario, que no es lo que hará en carrera.

---

## Lo siguiente

1. Que Pablo revise la metodología y corrija lo que no le encaje. Su trabajo es **corregir, no crear**.
2. Los nombres de las fases son decisión de Alex — pendientes de visto bueno.
3. Decidir si la metodología pasa a ser contenido editable en el dashboard o se queda como documento de referencia.

---

## DESPLEGADO EN PRODUCCIÓN (26-jul)

La rama `feat/zepp-app` está en producción, commit `02db046`. Los endpoints de relojes ya responden en fahybrid.com Y app.fahybrid.com: `/api/athlete/wearables/garmin/today|workout|workouts` (401 sin bearer) y `/api/coros/status` (200, la URL que declaramos a COROS). Smoke OK, nada roto.

⚠️ **`fahybrik-demo` YA NO EXISTE.** Un solo proyecto Vercel, `fahybrik-web` (`prj_9Fj582l8dFSGZ2MeC8K1xlGYFVde`), sirve los dos dominios. El id de demo que arrastraban las memorias da `Project not found` y hacía fallar el primer intento de deploy de cada sesión. Corregido en memoria: ver `reference_deploy_produccion`.

## Hilo paralelo: RELOJES — el entreno en la muñeca (prioridad máxima, 25-jul)

Registro vivo, visual: → `docs/design/relojes-entreno-en-la-muneca.html`
Mockup de las apps de reloj (Garmin + Amazfit, antes/durante/sincronización): → `docs/design/relojes-apps-mockup.html`
Pantalla de conexiones, comparada con TrainingPeaks: → `docs/design/conexiones-dispositivos-mockup.html`

**HUECO ABIERTO — sincronía reloj↔móvil.** Con Garmin, `System.exitTo()` cierra nuestra app CIQ y arranca el reproductor nativo: el iPhone NO se entera de que el atleta está corriendo, y el entreno sigue diciendo "empezar" durante toda la sesión. Al terminar sí se cierra solo (HealthKit → `ingest-healthkit.ts` casa por día y marca hecho; `existsOverlappingExecution` impide el duplicado si le dio a los dos). **Fix propuesto, no implementado:** el `.FIT` lo sirve NUESTRO endpoint, así que la descarga es una señal real — marcar el assignment "en el reloj" ahí y que el iPhone muestre "lo estás haciendo en tu Garmin" en vez de ofrecer empezar. Amazfit no tiene el problema (no puede arrancar entrenos). Apple Watch tampoco (mirroring nativo).

**Premisa de Alex:** máxima conectividad. Que el entreno llegue al reloj siempre que se pueda, y donde no (Polar), que la app lea del dispositivo todo lo posible.

**El diseño:** una estructura canónica + un codificador por marca. Dos reglas de dominio que no se negocian: las zonas viajan como banda ABSOLUTA (la Z4 de un Garmin sale de otra FCmáx), y lo que el reloj no puede vigilar (RPE) va como tramo abierto, nunca como objetivo inventado. Fuerza/EMOM/AMRAP quedan fuera a propósito: ningún formato de fabricante los modela.

**Construido y en la rama:** modelo neutro · codificador .FIT de Garmin + endpoints · guías de Suunto (44 tests) · WorkoutKit para Apple Watch · app Connect IQ (`garmin-ciq/`, sin compilar aún) · dos bugs de Zepp que impedían entrar y ver el día · el permiso de Salud del onboarding que no arrancaba la sync.

**Puede empujarse el entreno a:** Apple (nativo, sin permisos), Garmin (vía Connect IQ, NO depende de la API parada), Suunto (spec pública), COROS (solicitud enviada 25-jul). Polar es solo lectura. Wear OS y Fitbit están muertos para iPhone.

**Lo siguiente:**
1. ~~Los 65 segmentos~~ HECHO: `RUN_CONVERTIBLE_SCHEMES` explícito (endurance + rounds + sets/warmup/cooldown, fuera los metcon de verdad) y `collectRunStructures` ya filtra por modalidad — sin eso, 121 segmentos de bici/remo/ski/movilidad se convertían en "carrera". **Producción: 1 → 78 → 112 de 143 segmentos, 48 sesiones, 16 asignadas.**
2. ~~El filtro del Apple Watch~~ HECHO 26-jul (`483db64`): el criterio ya no es «un solo ejercicio» sino «el trabajo principal es correr» — acompañan movilidad, estiramiento y el trote plano del calentamiento; trineo, ergo o fuerza dejan la sesión en nuestra app. 5 tests nuevos + guarda-raíl del andamiaje (`WorkoutBlock.title`/`format` con null descartaban el bloque en silencio). 27 tests del mapper en verde.
3. ~~Bug de `hr_zone`~~ HECHO: `resolveSegmentBand` solo resuelve `pace_zone`; una zona de pulso ya no sale como banda de ritmo. Test que falla si se reintroduce.
4. Dejar vivos `/api/coros/webhook` y `/api/coros/status`, declarados en la solicitud a COROS.
5. ~~Compilar `garmin-ciq/`~~ HECHO 25-jul: SDK 9.2.0 + OpenJDK instalados, clave de firma en `~/.garmin/` (fuera del repo), y BUILD SUCCESSFUL en 12 dispositivos de las 6 familias. Y PROBADA en el simulador (Forerunner 165 virtual): arranca y pide vincular la cuenta, que es el primer estado correcto. Falta el reloj físico para el guiado, que Garmin no simula. Capturas bloqueadas: macOS deniega screencapture a la terminal sin permiso de Grabación de pantalla.

**Solicitudes ENVIADAS el 25-jul:** COROS (sin plazo publicado; pendiente el correo a api@coros.com preguntando si el push de entrenos entra en el tier estándar) y Suunto (responden en dos semanas; pedimos Cloud API + apps de reloj, y van alex@ y hello@ como desarrolladores porque dan una app por correo).

**Migración 0135 APLICADA** (26-jul, con OK de Alex): `suunto` y `amazfit` en `biometric_source`, y además `suunto`/`amazfit`/`polar`/`coros` en `device_type`. Verificado leyendo pg_enum en producción. Ojo: el dry-run destapó que 0134 (rondas EMOM, de otra sesión) también estaba pendiente y entró antes.

**Pendiente de Alex:** solo el modelo del Garmin que llegue la semana que viene.

**CUANDO COROS ACEPTE — los 4 pasos.** El OAuth está TODO construido (connect/callback/webhook/status, `lib/coros/config.ts`). Entonces: (1) meter `COROS_CLIENT_ID`/`SECRET` en env y deja de responder 503; (2) implementar `lib/sync/ingest-coros.ts`, hoy stub vacío a propósito — su esquema vive en la API Reference Guide privada que solo entregan tras aprobar; el propio fichero documenta cómo, espejando `ingest-garmin.ts` (idempotencia por external_id, mapeo de modalidad); (3) registrar el webhook con ellos; (4) probar con el Kiprun de Gerard. El PUSH de entrenos depende de la respuesta al correo a api@coros.com (¿tier estándar o acuerdo aparte?) — ese correo es lo que más desatasca.

**Hardware de pruebas.** El **Kiprun by Coros** de Gerard vale como COROS de pleno derecho: se empareja con la app COROS, el firmware lo hace COROS y su Help Center lo trata como reloj propio (secciones y release notes de KIPRUN GPS 500/900). CONFIRMADO por Alex que el de Gerard es "by Coros". Límites del Kiprun: no traga Strength ni objetivos de Effort Pace/Power, así que cubre el carril de correr entero pero no las estaciones. Único riesgo sin confirmar: que la API de partner devuelva sus actividades idénticas a las de un COROS de marca (inferencia fuerte, no fuente oficial, porque COROS no publica docs). Para Garmin: Forerunner 165 de 2ª mano, 145-170 €.

**COROS TAMBIÉN entra hoy por Apple Salud**, sin esperar su aprobación: COROS App › Perfil › Ajustes › 3rd Party Apps › Data Sync › Apple Health (support.coros.com/hc/en-us/articles/360041549551). Como nuestra ingesta de HealthKit no filtra por app de origen, los entrenos del Kiprun de Gerard llegarían igual que los de un Apple Watch. Eso permite probar la mitad de la integración HOY y gratis; la API de partner solo hace falta para MANDARLE el plan al reloj y para tener atribución/laps propios.

**Amazfit ya entra hoy** por Apple Salud (la app Zepp sincroniza ahí y nuestra ingesta de HealthKit no filtra por app de origen). El ingest directo de Huami sigue stub: su api-doc.html devuelve 404 y developer.zepp.com es marketing. Es un MEJOR (atribución, laps), no un NECESARIO.

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
