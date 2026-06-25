# Handoff: FHP — Plataforma de entrenamiento híbrido (HYROX)

## Overview
FHP es una plataforma de entrenamiento híbrido de alto rendimiento (resistencia + fuerza, formato HYROX por estaciones) que se **revende a múltiples coaches**: cada coach trae su propia metodología y su propia base de atletas; la plataforma es **agnóstica de método** y no impone ninguna estructura de periodización.

El producto tiene **dos lados del mismo sistema**:

1. **Panel del entrenador (web de escritorio)** — donde el coach codifica su método, gestiona atletas, construye planes por microciclos, modela sesiones, supervisa a escala y se comunica. *(Entregado como wireframe lo-fi.)*
2. **App del atleta (iOS/Android)** — donde el atleta recibe su plan semana a semana, ejecuta y registra (con conexión a reloj), ve sus analíticas de running y estaciones, gestiona la modalidad Dobles y habla con su coach. *(Entregado en alta fidelidad.)*

El bucle: el coach asigna un **microciclo** → las **semanas se publican solas** en la app del atleta (salvo que el coach ajuste) → el atleta ejecuta y registra → vuelve como señales/analíticas al panel → el coach adapta la siguiente fase.

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML** — prototipos que muestran el aspecto y comportamiento previstos, **no código de producción para copiar tal cual**. La tarea es **recrear estos diseños en el entorno del codebase destino** (React Native / Expo o Swift+Kotlin para la app; React/Vue para el panel web) usando sus patrones y librerías establecidos. Si aún no existe codebase, elegir el framework más apropiado e implementar allí.

Los archivos `.dc.html` usan un pequeño runtime propio (`support.js`) solo para la navegación del prototipo (estado de pantalla activa). **Ignóralo**: no forma parte del producto. Lo relevante es el marcado, los estilos inline, la jerarquía de pantallas y la copy.

## Fidelity
- **App del atleta → ALTA FIDELIDAD (hi-fi).** Colores, tipografía, espaciado e interacciones son los definitivos. Recrear pixel-perfect con las librerías del codebase.
- **Panel del entrenador → BAJA FIDELIDAD (lo-fi, wireframe).** Estilo "boceto" (tipografía manuscrita, papel) **intencionadamente provisional** para validar estructura y flujo. Usar como guía de **layout y funcionalidad**, NO de estilo visual: aplicar la identidad real de FHP (ver tokens hi-fi de la app) al implementarlo.

---

## MARCA / DESIGN TOKENS

### Logo
`uploads/marca-1781876709103.png` — wordmark **FHP** en blanco, bold itálica, atlético. Pensado para fondo oscuro. Para fondo claro hará falta una variante en tinta oscura (no incluida).

### App del atleta (hi-fi) — paleta oscura "performance"
| Token | Hex | Uso |
|---|---|---|
| `bg/page` | `#070A0E` | Fondo de la galería / fuera del teléfono |
| `bg/app` | `#0A0E14` | Fondo de la pantalla de la app |
| `surface/1` | `#11161D` | Tarjetas/list-rows base |
| `surface/2` | `#141A22` | Tarjetas elevadas |
| `surface/3` | `#1B2430` | Chips, avatares, controles |
| `border/1` | `#1f2733` | Bordes sutiles |
| `border/2` | `#283341` | Bordes de tarjeta estándar |
| `accent/red` (marca) | `#E23B2E` | Acción primaria, acento, carrera, "a mejorar" |
| `accent/red-tint` | `rgba(226,59,46,.10)` | Fondos de aviso suave |
| `accent/red-border` | `#3a2326` | Borde de tarjetas con tinte rojo |
| `blue` (ergómetro / Marcos) | `#3B82D9` | Modalidad Dobles compañero, ergómetros, secundario |
| `green/success` | `#34C77B` | Completado, mejor que benchmark |
| `amber/warn` | `#E0A93B` | Atención, ligeramente sobre benchmark |
| `text/primary` | `#F2F5F8` | Texto principal |
| `text/secondary` | `#93A0AE` | Texto secundario |
| `text/muted` | `#5C6773` | Etiquetas, metadatos |
| `divider` | `#161D26` | Separadores de nav/header |

**Tipografía (app):**
- **Saira** (Google Fonts) — display y UI. Pesos 400/500/600/700/800. **Los títulos van en cursiva (italic) y peso 800** — es el rasgo de marca (atlético, deportivo). `font-style:italic;font-weight:800`.
- **Space Mono** (Google Fonts) — **todas las métricas, tiempos, ritmos, números** (700 para destacados). Da el carácter "datos de rendimiento".

**Escala tipográfica observada (app):** título de pantalla 26–28px / 800 italic; título de tarjeta hero 22–25px / 800 italic; sección 13–15px / 700; cuerpo 13–14px; metadato 11–12px; etiqueta mayúscula 10–11px `letter-spacing:.12–.16em;text-transform:uppercase`. Métricas grandes 22–34px Space Mono 700; cronómetros gigantes 48–70px.

**Radios:** chasis teléfono 52px (marco) / 42px (pantalla); tarjetas 12–22px; chips/pills 999px; barras de progreso 3–4px.
**Sombra de tarjeta del teléfono:** `0 30px 70–80px rgba(0,0,0,.6)`.
**Botón primario:** fondo `#E23B2E`, texto `#fff`, radius 13–16px, padding ~14–16px, peso 700, centrado; suele llevar glifo `▶`.

### Panel del entrenador (lo-fi wireframe — NO usar estos estilos en producción)
Tinta `#2c2b28` sobre papel `#e7e5df`; tarjetas `#fff`/`#f4f2ec`/`#faf9f5`; acento `#c4503e`; señales `#4f8a5b` (verde), `#c79a3e` (ámbar), `#4a6f9c` (azul). Fuentes *Caveat* (títulos manuscritos) y *Patrick Hand* (cuerpo). **Esto es deliberadamente boceto** — reemplazar por la identidad real al construir.

---

## APP DEL ATLETA — PANTALLAS

Archivo navegable principal: **`App Atleta - Flujo.dc.html`** (toca la barra inferior y los botones). Marco de iPhone 390×822 (área de pantalla; diseñar responsive a anchos reales 360–430). Barra de navegación inferior fija de 5 destinos: **Inicio · Plan · Carreras · Chat · Perfil** (altura 78px, borde superior `#161D26`, indicador activo: barra 22×3px `#E23B2E` sobre el icono).

### 1. Inicio (`Inicio`)
- **Propósito:** abrir y ver "qué toca hoy" sin ruido.
- **Layout:** columna scroll, padding 6px 20px 16px. Header (logo FHP izq. + campana con punto rojo + avatar). Saludo: kicker rojo mayúscula con fecha + "Hola, Ana" (28px 800 italic) + chip de racha "🔥 12 días".
- **Componentes:**
  - **Aviso de publicación** (clic → Plan): fila tinte rojo `rgba(226,59,46,.10)` borde `#3a2326`, avatar coach "P", texto "Pablo publicó tu semana 2/4", CTA "Ver ›".
  - **Sesión hero AM** (tarjeta `#141A22`, borde sup. 5px `#E23B2E`): badge "AM", kicker "Carrera · sesión principal", título "Intervalos de umbral" (24px 800 italic), subtítulo "≈ 55 min · 3 bloques · 5×1000m @ 3:45/km", botón primario "▶ Empezar" (→ Detalle AM).
  - **Sesión PM compacta** (fila `#11161D`): badge azul "PM", "Fuerza · tren inferior", "≈ 40 min · más tarde hoy" (→ Detalle PM).
  - **Dos tiles** lado a lado: "Próxima carrera" (38 días Space Mono rojo, "HYROX Barcelona" → Carreras) y "Semana 2/4" (5/6 hechas + mini barra de progreso de 5 segmentos → Plan).
  - **Nota del coach** (fila): avatar P + texto + punto rojo no-leído (→ Chat).

### 2. Plan (`Plan`)
- **Propósito:** la semana publicada por el coach (derivada del microciclo). El atleta SIEMPRE ve semanas; el coach asigna microciclos y las semanas se publican solas.
- **Layout:** header (logo + chip "Dobles · Marcos" + avatar). Título "Tu semana" (26px 800 italic) + contador "2 / 4 ›" + subtítulo "Publicada por Pablo · microciclo «Construcción» · se publica sola".
- **Lista de días (Lun–Dom):** filas `#11161D` radius 12px con: etiqueta día Space Mono, punto de color por modalidad, nombre de sesión, estado (✓ verde / test ámbar). **El día de hoy se expande** mostrando que tiene **2 sesiones (AM intervalos + PM fuerza)** en una tarjeta resaltada borde `#E23B2E` (→ Detalle). Leyenda inferior de colores: fuerza / ergómetro (azul) / carrera (rojo).
- **Estados:** día completado (✓), hoy (resaltado rojo), futuro (punto gris), descanso (texto muted), test (badge ámbar).

### 3. Detalle de sesión (`Detalle`) — soporta 1 o 2 sesiones/día
- **Propósito:** ver el contenido de la sesión y registrarla.
- **Layout:** botón atrás (← círculo) + "Miércoles 14 · 2 sesiones hoy". **Conmutador de sesión** (2 segmentos AM carrera / PM fuerza) con subrayado de color activo. NOTA: la barra de nav inferior se mantiene visible (corregido respecto a versión previa donde no se podía salir).
- **Contenido AM (carrera):** título 22px 800 italic + meta; nota del coach ("generado y revisado por Pablo"); bloques: **Calentamiento** (con placeholder de **vídeo de técnica** — rectángulo rayado con botón play), **Principal · series** (tarjeta borde rojo, badge "Z5", "5×1000 m" Space Mono 28px + "@ 3:45 /km" + "descanso 2:00"), **Core** (opcional).
- **Contenido PM (fuerza, sesión Dobles):** tabla de ejercicios — columnas Ejercicio / S×R / Carga (%·kg, resuelta sobre 1RM del atleta) / RPE. Filas: Sentadilla trasera 5×5 80%·100kg RPE8; Peso muerto rumano 3×8 70%·85kg RPE7; Zancada 3×10 RIR2. Aviso "👥 Sesión compartida: la hacéis juntos en el box".
- **Registro (ambas):** textarea libre "Cómo te fue…"; selector **RPE** 6–10 (Space Mono, 8 seleccionado en rojo); nota "⌚ o importa automáticamente desde Garmin / Polar / Strava".
- **Footer:** botón primario "Marcar completada ✓" (→ Inicio).

### 4. Carreras (`Carreras`) — el diferenciador
- **Propósito:** resultados HYROX, informe IA de puntos débiles y analítica de carrera.
- **Componentes (scroll):**
  - **Última carrera** (tarjeta): "Última · 02 nov · Pro", "HYROX Barcelona" + tiempo total "1:08:42" Space Mono; splits Run/Estaciones/RoxZone; banda verde "Top 18% de tu división · −2:34 vs anterior".
  - **Informe IA** (tarjeta con tinte rojo): "a priorizar" → texto generado ("empuje de trineo y wall balls", "RoxZone sobre la media Pro") + chips de **grupos de entrenamiento recomendados** (G03 Ergómetros / G09 Circuitos f-r / G07 Simulaciones).
  - **Estaciones vs benchmark Pro:** filas con barra y delta de tiempo coloreado (rojo = peor, ámbar = ligeramente peor, verde = mejor). Sled Push +0:42, Wall Balls +0:31, Burpee BJ +0:14, Sled Pull −0:08, SkiErg −0:03, Farmer Carry −0:05.
  - **Ritmo por km** (8 barras k1–k8): detección de **caída de ritmo final** ("+18s/km en los últimos 2 km — resistencia específica").
  - **Evolución** (3 barras de tiempo total descendente 1:14→1:11→1:08).
  - **Historial** de carreras anteriores.

### 5. Chat (`Chat`)
- **Propósito:** mensajería directa casi en tiempo real con el coach.
- **Layout:** header con avatar coach + "en línea"; burbujas (recibidas `#141A22` borde, enviadas `#E23B2E` blanco, radios asimétricos); barra de composición con campo pill + botón enviar circular rojo.

### 6. Perfil (`Perfil`)
- Avatar + nombre (22px 800 italic) + "Nivel avanzado · división Pro"; filas de ajuste: Modalidad (Dobles · con Marcos), Suscripción (Activa · renueva 1 feb), Objetivo (Sub 1:05 · HYROX BCN), Dispositivos (⌚ Garmin conectado), Idioma.

---

## ANALÍTICA COMPLETA — `App Atleta - Analitica.dc.html`
Profundización de métricas (los atletas viven de los datos; running y estaciones son el corazón de HYROX). Tres vistas que cuelgan de "Carreras"/"Rendimiento":

1. **Hub de rendimiento** — pestañas Running / Estaciones / RoxZone. Tile resumen de Running (ritmo umbral). Grid 2col de las **8 estaciones** con tiempo (Space Mono) y delta vs benchmark; las deficitarias con borde rojo `#4a2420` y bandera ⚑. Tile RoxZone.
2. **Running · análisis completo** — métricas clave (ritmo umbral, VO₂ est., mejor 1 km, volumen semanal); **splits 8×1 km** (barras coloreadas verde→ámbar→rojo mostrando deriva); **zonas de ritmo** Z2–Z5; **progresión** del umbral; **entrenos que lo trabajan** (con grupo G04/G05 y nº de veces, + próximo). Cada métrica enlaza con el entrenamiento.
3. **Detalle de estación (ej. Sled Push)** — vídeo técnica; tu última vs benchmark Pro + percentil; **tendencia entre carreras**; sub-métricas (mejor, medio, **peso del trineo**, **paradas**); **entrenos que la mejoran** (grupos G01/G09 + próximo); **recomendación IA** con objetivo (sub 2:20). Replicable para las 8 estaciones.

---

## MODALIDAD DOBLES — `App Atleta - Dobles.dc.html`
Definición correcta: **dos atletas conectados; cada uno tiene su propio plan pero se ven los entrenos y comparten analíticas/resultados.** Entrenar a la vez es **opcional**; las **simulaciones sí son conjuntas**. Un pago, dos cuentas. Código de color: **Ana = rojo `#E23B2E`, Marcos = azul `#3B82D9`**. Cuatro pantallas:

1. **Plan conectado** — tu semana + toggle "Mi plan / Plan de Marcos 👁" (lectura del compañero); marca qué es opcional-juntos, qué hace cada uno por su lado (pueden diferir: Ana 5×1000, Marcos 6×1000), y la **simulación del sábado como 👥 conjunta obligatoria**. Banner "compartís analíticas y resultados".
2. **Analíticas compartidas** — mejores marcas individuales head-to-head + **marca Doubles conjunta**; "quién aporta qué" (Marcos fuerza/trineos, Ana wall balls/burpees, running parejos); comparativa semanal (adherencia, remo 2k) — pique sano.
3. **Entrenar a la vez (opcional)** — misma sesión con **carga por atleta** (columnas Ana/Marcos resueltas sobre el 1RM de cada uno); botones "Hacerla juntos / Por mi cuenta"; los dos resultados quedan visibles para ambos y el coach.
4. **Simulación conjunta** — estrategia de reparto de las 8 estaciones (barras Ana/Marcos: Sled Push 100% Marcos, Wall Balls 65/35 Ana, ergómetros alternan 250m, etc.), running juntos, relevos en RoxZone, nota táctica del coach.

---

## EXPLORACIONES (referencia de decisiones)
- **`App Atleta - Inicio 3 enfoques.dc.html`** — 3 direcciones para la pantalla de inicio que se exploraron. **Decisión del cliente:** enfoque **A (Hoy, sin ruido)** como Inicio + el formato lista del enfoque **B** como visualización de la semana en Plan. Ambas decisiones ya están aplicadas en `App Atleta - Flujo.dc.html`.

---

## PANEL DEL ENTRENADOR — `Panel Entrenador - Seleccion.dc.html` (lo-fi)
Web de escritorio (frames ~1330px). **Wireframe** — recrear con la identidad real. Pestañas en orden del bucle del coach: **Triage · Hoy → Atletas → Atleta · detalle → Biblioteca → Editor de sesión → Plan por fases → Microciclo → Editor de día → Añadir bloque → Mensajes.**

- **Triage · Hoy** — la home; NO una lista plana. Triage de quién necesa atención hoy (falló sesiones / listo para progresar / señales fisiológicas / espera respuesta).
- **Atletas** — directorio completo (tabla escaneable: nivel, estado, fase+progreso, adherencia, último registro, próximo test; filtros).
- **Atleta · detalle** — 5 sub-pestañas: **Perfil & objetivos** (tests → objetivos absolutos versionados, ajustables a mano), **Plan actual** (panel rico: progreso microciclo, sesión de hoy, ejecución reciente prescrito→hecho+RPE, "a vigilar", acciones), **Histórico**, **Biometría** (VFC/sueño/carga A:C), **Mensajes**.
- **Biblioteca** — método codificado: Sesiones / Bloques / Fases; categorías por modalidad y objetivo.
- **Editor de sesión** — cada pieza de trabajo estructurada combinando 3 ejes: **medida** (distancia·tiempo·reps·calorías) × **objetivo** (ritmo·zona·RPE·%máx·RIR) × **modalidad** (carrera·ergómetro·fuerza·circuito). Sin texto libre.
- **Plan por fases** — el coach define sus propias fases y asigna **fase a fase** (no semana a semana); estado borrador + gesto explícito de **publicar**.
- **Microciclo** — editor de semana en foco + vista general de 4 semanas.
- **Editor de día** — día › sesión (AM/PM) › bloque › ítems; "añadir bloque" desde biblioteca o desde cero.
- **Mensajes** — lista · hilo · panel de contexto del atleta.

NOTA de re-encuadre: el panel se diseñó inicialmente para un solo coach. El producto real es **multi-coach revendible**: cada coach es un tenant con su propio método, biblioteca, fases y atletas. Tenerlo en cuenta en el modelo de datos (aislamiento por coach/tenant).

---

## INTERACCIONES Y COMPORTAMIENTO (app)
- **Navegación:** barra inferior de 5 destinos; estado de pantalla activa. "Empezar" en una sesión abre Detalle con la sesión correcta seleccionada (AM/PM). Atrás vuelve a Plan.
- **Conmutador AM/PM** en Detalle: cambia el contenido sin cambiar de pantalla.
- **Selector RPE** 6–10: un valor activo.
- **Registro:** texto libre + RPE manual **o** importación automática desde dispositivo (Garmin/Polar/Strava).
- **Publicación de semanas:** automática desde el microciclo del coach (no acción del atleta).
- Transiciones sugeridas: 150–200ms ease para cambios de pestaña/segmento; el prototipo no las especifica.

## STATE (app, mínimo del prototipo)
- `screen`: inicio | plan | detalle | carreras | chat | perfil
- `session`: am | pm (dentro de Detalle)
- Reales a añadir: usuario/atleta, semana/microciclo publicado, sesiones y bloques, resultados/registro, datos de dispositivo, carreras + splits + informe IA, hilo de chat, vínculo Dobles y datos del compañero.

## ASSETS
- `uploads/marca-1781876709103.png` — logo FHP (blanco, para fondo oscuro). Hace falta variante en oscuro para fondo claro.
- Placeholders de **vídeo de técnica** (rectángulos rayados con botón play) → reemplazar por reproductor real.
- Iconos de la barra inferior y badges son formas CSS simples → usar el set de iconos del codebase.
- Gráficas (barras de splits, progresión, zonas) son divs con alturas → implementar con la librería de charts del proyecto.

## FILES (en este paquete)
| Archivo | Lado | Fidelidad | Contenido |
|---|---|---|---|
| `App Atleta - Flujo.dc.html` | Atleta | hi-fi | **App navegable principal**: Inicio, Plan, Detalle (1–2 sesiones), Carreras, Chat, Perfil |
| `App Atleta - Analitica.dc.html` | Atleta | hi-fi | Hub rendimiento + Running deep-dive + Detalle de estación |
| `App Atleta - Dobles.dc.html` | Atleta | hi-fi | Plan conectado, analíticas compartidas, entrenar juntos, simulación |
| `App Atleta - Inicio 3 enfoques.dc.html` | Atleta | hi-fi | Exploración de inicio (decisión: A + lista de B) |
| `Panel Entrenador - Seleccion.dc.html` | Coach | lo-fi | Panel web completo (10 pestañas) |
| `support.js` | — | — | Runtime del prototipo (NO es producto, ignorar) |
| `uploads/marca-1781876709103.png` | — | — | Logo FHP |

> Para previsualizar: abrir cualquier `.dc.html` en un navegador (necesita conexión para Google Fonts). La navegación funciona con clics.
