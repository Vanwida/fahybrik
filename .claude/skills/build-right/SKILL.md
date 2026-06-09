---
name: build-right
description: INVIOLABLE. Invocar SIEMPRE antes de construir, diseñar, especificar o lanzar agentes sobre cualquier cosa no trivial del dominio FAHYBRIK (modelos de datos, prescripciones, ejercicios, bloques, planes, UI con lógica, endpoints, migraciones). Garantiza correctitud OBJETIVA independiente de Alex, completitud del dominio, stress-test contra datos reales, uso pleno de capacidad (agentes paralelos / planificación) y auto-QA. NO es opcional.
---

# BUILD RIGHT — protocolo inviolable

## Principio raíz
Lo que construyo tiene que estar **OBJETIVAMENTE bien, independiente de Alex**. Él NO es mi QA. Soy un LLM con 1M de contexto y agentes paralelos gratis; actuar rápido / barato / superficial traiciona eso y le cuesta dinero y dolor de cabeza. Su atención es el recurso caro — mi tiempo y los tokens NO.

## La línea que NO cruzo: Objetivo vs Subjetivo
- **OBJETIVO** (correctitud, completitud del dominio, estándares de mercado, coherencia): es **MÍO**. Debe quedar bien **sin que Alex lo valide**. NUNCA lo dejo incompleto, NUNCA pregunto "¿debería llevar X?" cuando X es objetivamente necesario.
  - Ej.: un **RUN** lleva medida (distancia|tiempo) + objetivo (ritmo|zona|RPE). Un **squat** lleva sets → por serie {reps, carga, RIR/RPE, tempo, descanso}. Omitirlo = fallo mío, no algo que Alex deba cazar.
- **SUBJETIVO** (layout, qué botón dónde, naming, estética, prioridad de roadmap): eso SÍ se lo pregunto.
- Antes de preguntar algo: *"¿esto es objetivo (lo decido y lo hago bien yo) o subjetivo (suyo)?"*. Si es objetivo → NO preguntar, hacerlo bien.

## Gate obligatorio — se dispara con "voy a construir / especificar / lanzar agente"
1. **Completitud del dominio.** Enumerar TODAS las dimensiones que la pieza requiere objetivamente (matriz de prescripción abajo). No la pieza delante: el sistema entero.
2. **Stress-test contra la realidad.** Coger ≥10 casos reales (plan de Pablo / Excel) y verificar que TODOS entran en el modelo con **cero texto libre**. Si uno no entra → el MODELO está mal, no el caso; arreglo la raíz.
3. **Uso pleno de capacidad.** Planificar. Si el trabajo son N unidades independientes (p.ej. 98 bloques, 11 semanas) → **FAN-OUT en varios agentes paralelos bien repartidos** (Workflow o múltiples Agent en background), NO 1 agente secuencial. El nº de agentes lo dicta la estructura del trabajo, jamás la prisa.
4. **Auto-QA antes de decir "hecho".** Yo verifico contra criterios objetivos. Filtro de cada campo: ¿el atleta lo entiende sin ambigüedad? ¿la app calcula analíticas con él? ¿la IA lo adapta? Si algo cae a texto libre → está mal.
5. **A Alex solo le llega:** lo subjetivo (a decidir él) + "listo para verlo". CERO validación de lo objetivo, cero ruido técnico.

## Matriz de completitud — PRESCRIPCIÓN (la fuente repetida de fallos)
Toda prescripción = **cómo se mide el trabajo × contra qué objetivo × por modalidad**.
- **Medida del trabajo:** distancia | tiempo | reps | calorías
- **Objetivo / intensidad:** ritmo (/km, /500m) | zona HR (1-5) | RPE | %RM | RIR
- **Mínimos objetivos por modalidad** (si falta alguno → incompleto):
  - **Correr:** (distancia|tiempo) + (ritmo|zona|RPE). Series → reps × (dist|tiempo) + descanso + objetivo.
  - **Ergo (row/ski/bike):** (distancia|tiempo|cals) + (ritmo /500m | RPE).
  - **Fuerza:** sets → por serie {reps, carga (%RM|kg|RIR|RPE), tempo, descanso}.
  - **WOD/Metcon:** formato (AMRAP|EMOM|For Time) + componentes + objetivo/cap (tiempo|rondas).
  - **Core/movilidad:** reps|tiempo + (RPE opcional).

## Regla de oro
No optimizo por rápido ni por barato. Hacer las cosas bien a la primera, con TODA mi capacidad (planificación + agentes paralelos + 1M de contexto + auto-revisión), es la única opción aceptable.

Refuerza memorias: coherencia-sobre-no-errores, sentido-y-estándares-de-mercado, CEO/CTO-cero-ruido.
