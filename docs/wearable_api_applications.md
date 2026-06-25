# Solicitudes de API de wearables — FAHYBRID (COROS · WHOOP · Garmin)

Este documento es la guía de traspaso (handoff) para **enviar las solicitudes de acceso de desarrollador/partner** a cada proveedor de wearables que FAHYBRID quiere integrar. Cada bloque incluye el **enlace oficial del formulario**, el proceso paso a paso, y una **tabla con cada campo técnico ya respondido** listo para copiar y pegar. Las respuestas técnicas (URLs de callback, webhooks, scopes, modelo de autenticación) ya están resueltas por ingeniería — **no las cambies**. Solo tienes que rellenar los campos marcados como `[RELLENAR]`, que son datos de empresa (nombre, emails, logo, etc.). La prosa está en español, pero **los valores a pegar en los formularios están en inglés a propósito** porque los formularios están en inglés.

---

## Datos comunes de la empresa `[RELLENAR]`

Estos datos se repiten en los tres formularios. Rellénalos UNA vez aquí y reutilízalos. Son **lo único** que la empresa tiene que aportar:

| Campo | Valor a poner |
|---|---|
| Nombre de la app / plataforma | `[RELLENAR]` (p. ej. "FAHYBRID") |
| Empresa (razón social) | `[RELLENAR]` |
| URL de la plataforma | `https://fahybrid.com` |
| Email de contacto principal | `[RELLENAR]` |
| Email de contacto secundario | `[RELLENAR]` |
| URL de política de privacidad | `[RELLENAR]` (p. ej. `https://fahybrid.com/privacidad`) |
| Logo (PNG) | `[RELLENAR]` — ver tamaños exactos exigidos en cada proveedor abajo |
| Nº de usuarios activos | `[RELLENAR]` (estimación honesta; afecta a tier/aprobación) |

> Nota: usa el **mismo** email de contacto en los tres proveedores si es posible — facilita el seguimiento de la aprobación.

---

## WHOOP

### Cómo se solicita

- Crea la app **tú mismo (self-serve)** en el dashboard de desarrollador: **https://developer-dashboard.whoop.com**
- Al crearla, WHOOP genera **al instante** un `Client ID` y un `Client Secret`. No hay espera ni aprobación previa para empezar a probar.
- **Límite en modo desarrollo: 10 usuarios (miembros).** Puedes integrar y probar con hasta 10 cuentas WHOOP reales sin aprobación.
- Para **superar los 10 usuarios / pasar a producción**, hay que enviar la solicitud de producción: **https://whoopinc.typeform.com/to/XmzituEp**
- **Coste: gratis.** Pero ojo: **cada usuario final necesita su propia membresía WHOOP de pago** (la pulsera WHOOP funciona por suscripción).
- **No hay SLA público de aprobación**: WHOOP no publica cuánto tarda en revisar la solicitud de producción.

### Respuestas a los campos del formulario

| Campo | Respuesta a poner |
|---|---|
| App name | `[RELLENAR — dato de empresa]` |
| Contact email | `[RELLENAR — dato de empresa]` |
| Contact email (secundario, si lo piden) | `[RELLENAR — dato de empresa]` |
| Privacy policy URL | `[RELLENAR — dato de empresa]` |
| Designs / screenshots | `[RELLENAR — dato de empresa]` (capturas de la app) |
| Description of use | `[RELLENAR — dato de empresa]` (describir: app de coaching de HYROX/hybrid; leemos recuperación, sueño y entrenamientos para adaptar el plan del atleta) |
| Redirect URL | `https://fahybrid.com/api/whoop/callback` |
| Scopes | `read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement offline` |
| Webhook URL | `https://fahybrid.com/api/whoop/webhook` |
| Auth model | OAuth2 Authorization Code |

### Configuración técnica OAuth / Webhooks

```text
Auth model:    OAuth2 Authorization Code
Redirect URL:  https://fahybrid.com/api/whoop/callback
Webhook URL:   https://fahybrid.com/api/whoop/webhook
Scopes:        read:recovery read:cycles read:workout read:sleep
               read:profile read:body_measurement offline
Webhook auth:  WHOOP firma los webhooks con el Client Secret
               (NO hay un webhook secret separado)
```

### Avisos / riesgos

- **Tope de 10 usuarios** hasta que WHOOP apruebe la app para producción. No se puede dar de alta a más de 10 atletas hasta entonces.
- **Rate limit: 100 peticiones/min y 10.000/día POR APP.** Es por app, no por usuario → con muchos atletas se agota rápido. **Por eso usamos webhooks (push), no polling.**
- **Los Términos de WHOOP PROHÍBEN construir bases de datos permanentes / cachear más allá de lo que indique la cabecera de caché.** Esto choca con que FAHYBRID quiere guardar histórico del atleta para analítica a largo plazo → **hace falta autorización escrita de WHOOP** para ese uso. **Plantéalo explícitamente en la solicitud de producción.**
- **No hay SLA de aprobación publicado.**

---

## COROS

### Cómo se solicita

- La solicitud se hace mediante el **formulario de COROS API Application (Google Form)**, accesible desde el artículo del Help Center **"Submitting an API Application"** en **support.coros.com**.
- Formulario en vivo actualmente: **https://docs.google.com/forms/d/e/1FAIpQLSe2i_nIRV62yCeld8J9UR41I_vC34Z2_S82CodxurHHjFEo9Q/viewform**
- **Coste: GRATIS.**
- **Aprobación MANUAL y SELECTIVA**: COROS revisa caso por caso. Factores que pesan: tamaño de mercado de tu app y el uso que harás de los datos. **La aceptación NO está garantizada.**
- **Modelo de autenticación: OAuth2 Authorization Code.**
- **Una vez aceptados**, COROS exige añadir un **"Login Portal + Support Page"** en la web (un punto de inicio de sesión y una página de soporte para los usuarios COROS).
- **No publican plazo de aprobación.**

### Respuestas a los campos del formulario

| Campo | Respuesta a poner |
|---|---|
| Company | `[RELLENAR — dato de empresa]` |
| Contacts (email/persona) | `[RELLENAR — dato de empresa]` |
| Application Description (máx. 100 caracteres) | `[RELLENAR — dato de empresa]` (HYROX/hybrid coaching: sync workouts + push planned sessions) |
| Total Active Users (tier) | `[RELLENAR — dato de empresa]` |
| Personal vs Public | `Public` |
| Commercial vs Non-commercial | `Commercial` |
| Intended data use | `[RELLENAR — dato de empresa]` (leer entrenos del atleta y enviar sesiones planificadas al reloj) |
| Expected launch date | `[RELLENAR — dato de empresa]` |
| Authorized Callback Domain | `https://fahybrid.com/api/coros/callback` (dominio: `fahybrid.com`) |
| API functions (checkboxes) | Marcar **"Activity / Workout Data Sync"** + **"Structured Workouts and Training Plans Sync"** (leer entrenos Y enviar sesiones planificadas al reloj). Considerar también **"GPX Route Import/Export"**. |
| Workout data receiving Endpoint URL (webhook) | `https://fahybrid.com/api/coros/webhook` |
| Service Status Check URL | `https://fahybrid.com/api/coros/webhook` (responde 200 a GET) |
| Logos | `[RELLENAR — dato de empresa]` — `144x144` + `102x102` (y además `120x120` + `300x300` si se pide sync de workouts / training-plan) |

### Configuración técnica OAuth / Webhooks

```text
Auth model:                 OAuth2 Authorization Code
Authorized Callback Domain: https://fahybrid.com/api/coros/callback
                            (dominio raíz: fahybrid.com)
Webhook (workout data):     https://fahybrid.com/api/coros/webhook
Service Status Check URL:   https://fahybrid.com/api/coros/webhook
                            (debe responder 200 a un GET)
API functions a pedir:      - Activity / Workout Data Sync
                            - Structured Workouts and Training Plans Sync
                            - (opcional) GPX Route Import/Export
Token endpoint:             POR CONFIRMAR — está en la API Reference Guide
                            privada que COROS comparte SOLO tras aceptar
                            (esto va en COROS_TOKEN_URL del .env)
```

### Avisos / riesgos

- **La aceptación NO está garantizada**: COROS aprueba de forma selectiva según mercado y uso de datos.
- **El token endpoint exacto, los scopes y los rate-limits están en una API Reference Guide PRIVADA** que COROS solo comparte **después** de aceptar la solicitud → por eso `COROS_TOKEN_URL` queda marcado "TO CONFIRM" en el `.env` hasta ese momento.
- **Requisito tras aceptación**: hay que añadir un **"Login Portal + Support Page"** en la web antes de salir a producción.
- **El plazo de aprobación no está publicado.**

---

## Garmin

> **Ya está parcialmente integrado en código** (Garmin Connect Developer Program, modelo server-to-server). Antes de tocar nada, revisa la documentación existente del repo:
> - `docs/garmin_partner_application.md`
> - `docs/garmin_oauth.md`
> - `docs/garmin_data_scopes.md`
> - `docs/garmin_setup.md`

### Cómo se solicita

- Formulario oficial de acceso: **https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/**
- **Programa correcto: Garmin Connect Developer Program** (APIs Health / Activity / Training / Courses). Es el bueno porque la **Training API permite enviar entrenamientos planificados al reloj** (lo que FAHYBRID necesita).
- **Coste: sin tasa de acceso**, pero **algunas métricas requieren una licencia de pago o un pedido mínimo de dispositivos**. Es de **uso exclusivamente empresarial (business-use only)**.
- **Modelo de autenticación: OAuth 2.0 + PKCE.**

### Respuestas a los campos del formulario

| Campo | Respuesta a poner |
|---|---|
| Company | `[RELLENAR — dato de empresa]` |
| Contact email(s) | `[RELLENAR — dato de empresa]` |
| Platform / app name | `[RELLENAR — dato de empresa]` |
| Platform URL | `https://fahybrid.com` |
| Privacy policy URL | `[RELLENAR — dato de empresa]` |
| Redirect / callback URL | `https://fahybrid.com/api/garmin/callback` |
| Webhook URL | `https://fahybrid.com/api/garmin/webhook` |
| APIs to request | `Health API`, `Activity API`, `Training API` |
| Auth model | OAuth 2.0 + PKCE |

### Configuración técnica OAuth / Webhooks

```text
Auth model:        OAuth 2.0 + PKCE
Redirect/callback: https://fahybrid.com/api/garmin/callback
Webhook:           https://fahybrid.com/api/garmin/webhook
APIs a solicitar:  Health API, Activity API, Training API
Referencia repo:   docs/garmin_partner_application.md
                   docs/garmin_oauth.md
                   docs/garmin_data_scopes.md
                   docs/garmin_setup.md
```

### Avisos / riesgos

- **RIESGO CRÍTICO (verificar YA):** según respuestas de staff de Garmin en su foro (~abr–may 2026), el **formulario para nuevos partners fue retirado y las solicitudes de acceso están EN PAUSA**, sin fecha de reapertura. **Confirmar directamente con Garmin antes de contar con esta integración.**
- Algunas métricas pueden exigir **licencia de pago o pedido mínimo de dispositivos**.
- Acceso **business-use only**: no es para uso personal/hobby.

---

## Arquitectura técnica común

Las tres integraciones usan **OAuth de servidor (server-to-server)**:

- El `Client Secret` / `Consumer Secret` vive **SOLO en el backend** — nunca en la app iOS, nunca en el navegador.
- La app iOS **solo abre el navegador de consentimiento** del proveedor; no maneja secretos.
- El **backend intercambia el código de autorización por los tokens**, los guarda **cifrados** (tabla `wearable_connections`, con `ENCRYPTION_KEY`) y **recibe los webhooks** entrantes de cada proveedor.
- **Una integración solo-en-el-móvil es imposible en las tres**: todas requieren un secreto de servidor y un endpoint de servidor que reciba los webhooks.
