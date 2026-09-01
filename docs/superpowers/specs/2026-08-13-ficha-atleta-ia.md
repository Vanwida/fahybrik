# Ficha del atleta — IA (opción 1a + quinta pestaña)

**Fecha:** 2026-08-13  
**Estado:** firmada. Visual de Resumen: spec 1a (`Ficha del atleta - spec 1a.html`).  
**Qué se construye ahora:** cromo (cabecera + 5 pestañas) + pestaña Resumen.  
**Qué se diseña después:** interior de Plan (reestilo), Rendimiento (3 anclas), Atleta.

## Principio

La ficha responde «¿cómo va este atleta y qué toca esta semana?» en menos de 5 segundos.

HOY es donde el coach **decide y ejecuta**. La ficha es donde **entiende y ajusta**. Un dato solo entra si cambia una decisión. Si no, subvista o fuera.

Tres reglas:

1. Nada de banners de alarma. Lo pendiente es **una línea de texto** bajo el nombre, con enlaces. El rojo se reserva para lo que bloquea (sin plan, pago caído). Si ya está en Hoy: `— también en Hoy`.
2. Lo vacío no ocupa lo mismo que lo lleno. Sin datos = **una fila de una línea** con CTA.
3. Un dato, un sitio.

## Cinco pestañas (no más)

| Pestaña | Pregunta | Contiene |
|---|---|---|
| **Resumen** | ¿Cómo va y qué toca esta semana? | Semana en curso · adherencia 4 sem · check-in · lesión activa · próxima carrera · referencias · propuesta de ajuste |
| **Plan** | ¿Qué le mando y cómo lo cambio? | Calendario, bloques, fases, asignar/duplicar |
| **Rendimiento** | ¿El entrenamiento está aterrizando? | Diagnóstico · Cómo corre · Zonas · Carreras · Histórico · Cuerpo · tests/1RM |
| **Del coach** | ¿Qué le he publicado y qué hizo con ello? | Comunicados (decisión 2026-08-09). Quinta pestaña justificada: publicar ≠ chat, vive en la ficha |
| **Atleta** | ¿Quién es y qué le debo? | Perfil, intake, lesiones historial, 1:1, pagos, notas, ajustes |

**Mensajes no es pestaña.** Es el botón de cabecera. Abre el hilo de *este* atleta (`?tab=mensajes`, vista oculta).

Badge numérico solo en la pestaña que tenga trabajo pendiente. Del coach conserva el suyo (`cuantosReclaman`). Atleta marca intake / pago caído.

## Redirects de `?tab=` viejas

| Antes | Ahora |
|---|---|
| *(vacío)* / `perfil` | `resumen` (default) / `atleta` |
| `plan` | `plan` |
| `ritmos` | `rendimiento&vista=zonas` |
| `carreras` | `rendimiento&vista=carreras` |
| `historico` | `rendimiento&vista=historico` |
| `sesiones` | `atleta&vista=sesiones` |
| `biometria` | `rendimiento&vista=cuerpo` |
| `rendimiento` | `rendimiento` |
| `correr` | `rendimiento&vista=correr` |
| `pagos` | `atleta&vista=pagos` |
| `mensajes` | vista oculta (cabecera) |
| `del-coach` | `del-coach` |

## Rendimiento — anclas internas (pase propio, no volcar)

Tres preguntas, no siete pestañas:

- **Carrera** — cómo corre, estaciones, predicción, historial de carreras
- **Fuerza** — 1RM, tests, salto
- **Cuerpo** — carga, zonas, biometría

Hasta ese pase, un raíl temporal reusa las superficies existentes para que nada quede huérfano.

## Cabecera (2 filas, nunca 3)

- Fila 1: avatar · nombre · chip nivel · `Individual · 5 días/sem · alta hace 5 sem`
- Fila 2 (condicional): `N cosas tuyas pendientes:` + enlaces naranja + `— también en Hoy`
- Acciones: `Mensaje` · `Ver plan` · `···` (ciclo de vida)

Nunca en cabecera: VO₂, FC reposo, VFC. Sin tendencia no deciden.

## Resumen — layout

`1300px` máx. Grid `minmax(0,1fr) / 328px`, gap `18px`.

Columna izquierda = lo que el coach mira y toca hoy. Derecha = contexto estable (lesión, carrera, nota privada).

Tokens, estados y copy: spec 1a (secciones 04–07). Proyección HYROX: no inventar — el loader de predicción hoy devuelve null; se pinta objetivo si existe y se calla la proyección.

## Fuera de este lote

Diseño de HOY. Reestilo profundo de Plan. Diseño de Rendimiento (3 anclas). Escritura de nota privada (esta entrega es lectura). Override de zonas.
