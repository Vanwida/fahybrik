# FAHYBRID — Arquitectura base (hecha para durar)

> Objetivo: estructura estándar, simple y abierta. No reinventar la rueda, no atarse a una escuela,
> y que Pablo/Gerard (cero técnicos) la entiendan sola. Diseño antes de código.

---

## 1. Qué es (principios que mandan)

1. **Plataforma de coaching.** El atleta paga para que le entrenemos. Los coaches entregan programas; el admin lleva el negocio.
2. **La IA NUNCA crea de cero.** Solo **selecciona y adapta** desde una **biblioteca que construimos nosotros (humanos)**. (= Documento Maestro.)
3. **Metodología configurable.** El orden de los microciclos lo nombra el coach. No hay un marco grabado en el código.
4. **Unidad de entrega = el MICROCICLO** (varias semanas). Se asigna entero; las semanas salen solas. El coach trabaja ~**mensual** (aprobar el siguiente microciclo); solo entra antes si hay un **cambio**.
5. **Simplicidad por encima de todo.** UX/UI obvia. El coach, en su día a día, casi solo **aprueba/rechaza**.

---

## 2. Roles y superficies (una app web + iOS)

| Rol | Quién | Superficie | Qué hace |
|---|---|---|---|
| **Admin** | Alex (hoy), luego Pablo/Gerard | Web `/admin` | Aprobar/rechazar coaches · métricas y dinero de TODO el negocio |
| **Coach** | Pablo, Gerard | Web `/coach` | Aprobar microciclos asignados · aprobar adaptaciones de la IA · gestionar sus atletas · biblioteca |
| **Atleta** | Clientes | App iOS | Recibe su plan semana a semana · registra · chatea · onboarding |

- **Un mismo usuario puede tener varios roles** (Alex = admin+coach+atleta). Capacidad multi-rol; un cliente normal tiene solo "atleta".
- **Web = una sola app** (coach + admin por rol). **iOS = la app del atleta.** Misma auth en las dos.

---

## 3. Auth — ESTÁNDAR (Clerk). Fuera lo casero.

**Decisión:** sustituir toda la auth hecha a mano (sesiones, JWT, magic-link, allowlist) por **Clerk**.

**Por qué Clerk (no reinventar):**
- **Nativo en Vercel** + primera clase con Next.js. UI de login ya hecha (menos código nuestro = menos bugs).
- Cubre **web (email/enlace/social)** e **iOS (Sign in with Apple)** con un solo proveedor.
- **Roles/organizaciones** integrados → el modelo admin/coach/atleta sale de fábrica.
- **Alta de coaches escalable**: invitaciones, registro, aprobación — resuelto, no a mano.
- Gestión de usuarios, sesiones, seguridad, MFA, recuperación — todo mantenido por ellos.

**Cómo encaja:**
- Clerk es la fuente de verdad de **identidad y roles**. Nuestra DB guarda lo del **dominio** (atletas, planes, biblioteca) referenciado por el `user_id` de Clerk.
- Los 3 roles = roles de Clerk (metadata/organización). El gate de `/admin` y `/coach` lee el rol de Clerk.
- iOS: SDK de Clerk → Sign in with Apple pasa por Clerk → el atleta queda identificado igual que en web.

**Migración:** se retira `users.role`/`user_roles`/`coach_allowlist`/`sessions`/`magic_link_tokens` caseros. Los datos de dominio (atletas/planes) se re-vinculan al id de Clerk. (Hoy solo estás tú → migración trivial.)

> Alternativa si algún día no quieres SaaS de auth: **Auth.js** (open-source, self-host). Pero para "estándar y rápido", Clerk gana.

---

## 4. Metodología configurable (dato del coach)

El producto no trae un catálogo de fases. El **orden de los microciclos es la periodización** y su nombre lo pone el coach.

- Un microciclo es una plantilla mensual + su posición en la secuencia.
- Los grupos y el foco de la semana son texto del coach, no un enum fijo.
- Cambiar de marco = cambiar el dato, no tocar código.

---

## 5. Modelo de contenido — la biblioteca (simplificado)

Una sola jerarquía limpia, de abajo a arriba:

```
Ejercicio   (movimiento; global, agnóstico de coach)         ← ya está bien
   └─ Bloque   (unidad de trabajo: ejercicios + params; global)   ← tenemos 97
        └─ Sesión / Día  (AM/PM)
             └─ Semana
                  └─ MICROCICLO  (la unidad que se ASIGNA)      ← hay que construir la biblioteca (hoy: 1)
```

- **La biblioteca de MICROCICLOS es el activo central.** Los creamos nosotros. Cada uno etiquetado con: metodología/fase + **criterios de perfil** (nivel, objetivo, distancia de carrera, días/semana…) → para que la IA pueda emparejar.
- **Se tira el modelo viejo de `templates`** (la auditoría lo encontró conviviendo y medio muerto). Una sola forma de representar contenido.

---

## 6. La IA — SELECTOR + ADAPTADOR (nunca generador)

1. **Onboarding del atleta** (PRs, tiempos, objetivos, disponibilidad, lesiones) → criterios.
2. **La IA empareja** esos criterios con la biblioteca → **propone el microciclo de inicio** (elige uno ya hecho). No compone, no inventa.
3. **El coach aprueba** (en los días siguientes) → se asigna.
4. El microciclo **avanza solo**, semana a semana, al atleta.
5. **Excepción** (el atleta va mal / pide cambio): la IA **sugiere una adaptación** — cambiar un bloque/sesión **por otro de la biblioteca** → el coach aprueba.

La IA es emparejamiento por reglas + LLM para el matiz, pero **acotada a la base de datos**. (El modelo LLM lo eliges tú.)

> Nota honesta: lo que montamos de "la IA compone una semana juntando bloques" es MÁS de lo que quieres. Se reorienta a **seleccionar microciclo** + **sugerir swaps**. Componer-desde-bloques queda como herramienta para que NOSOTROS construyamos la biblioteca, no para el flujo del atleta.

---

## 7. El flujo end-to-end (simple)

```
Atleta se registra y paga (web)
   → onboarding (PRs/objetivos/días)
   → IA propone microciclo de la biblioteca
   → COACH aprueba  ───────────────►  se asigna
   → la app entrega la semana 1, 2, 3… del microciclo
   → al acabar el microciclo: IA propone el siguiente → coach aprueba (≈ mensual)
   ┌─ si el atleta va mal / pide cambio:
   │     IA sugiere adaptación (de la biblioteca) → coach aprueba → se aplica
   └─────────────────────────────────────────────────────────────
```

---

## 8. Simplicidad para Pablo/Gerard

El coach, casi siempre, ve **un inbox de "para aprobar"**:
- "Nuevo atleta → microciclo propuesto: [X]. **Aprobar / Cambiar / Rechazar**."
- "La IA sugiere para [atleta]: cambiar [bloque] por [bloque]. **Aprobar / Rechazar**."

Sin jerga, sin montar nada a mano en el día a día. Montar contenido (biblioteca) es una tarea aparte, no diaria.

---

## 9. Qué se conserva / rehace / tira (mapa honesto)

| Pieza | Acción |
|---|---|
| Stack (Next.js, Neon, Vercel, iOS nativo) | **Conservar** |
| Catálogo de ejercicios + bloques (97) | **Conservar** (es buena base) |
| Auth casera (sesiones/JWT/magic-link/allowlist) | **TIRAR → Clerk** |
| `users.role`/`user_roles`/`coach_allowlist` | **TIRAR** (lo gestiona Clerk) |
| Periodización hardcodeada (enum, grupos atados) | **Rehacer** → metodología configurable |
| Modelo `templates` legacy | **TIRAR** → jerarquía única |
| `program_month/week_templates` + slots_json | **Rehacer/simplificar** → modelo microciclo limpio |
| IA "compone semana desde bloques" | **Reorientar** → selector + adaptador |
| El loop atleta (plan/week, detalle, chat) ya arreglado | **Conservar** (re-vincular a Clerk) |
| Datos de prueba/demo | Ya limpiados |

---

## 10. Plan por fases (orden de ataque)

1. **Auth a Clerk** — la base. Migrar identidad/roles; re-vincular datos de dominio al user de Clerk; gates `/admin` y `/coach` por rol de Clerk; iOS por Sign in with Apple vía Clerk.
2. **Metodología configurable** — el orden de los microciclos lo nombra el coach; des-hardcodear.
3. **Modelo de contenido limpio** — jerarquía única; retirar templates legacy; microciclo como unidad asignable con tags de perfil.
4. **IA selector + adaptador** — emparejar onboarding→microciclo; flujo de propuesta→aprobación coach; sugerencias de swap.
5. **Inbox del coach** (simplicidad) — la pantalla de "aprobar/rechazar".
6. **Construir la biblioteca de microciclos** (contenido humano) — con las herramientas anteriores.

Cada fase: diseñada, validada contigo, y construida con sentido (no solo "que compile").

---

**Resumen en una frase:** una plataforma de coaching con auth estándar (Clerk), metodología configurable (el coach nombra el orden), una biblioteca humana de microciclos que la IA solo **elige y adapta**, entregada al atleta semana a semana, y un panel donde el coach casi solo **aprueba** — simple por diseño.
