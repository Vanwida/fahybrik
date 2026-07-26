# App Connect IQ — el entreno del día en el Garmin

App de reloj (Monkey C) que coge el entreno de carrera de hoy del backend, deja
que el sistema lo guarde como `.FIT` y se lo pasa al **reproductor de entrenos
nativo de Garmin**.

No reimplementamos el guiado: los tramos, los ritmos objetivo, las alertas y la
vibración los hace Garmin. Esta app es un mensajero.

## Por qué existe

La Training API de Garmin (la que empuja entrenos desde el servidor a Garmin
Connect) está parada por su lado. Esta vía no depende de ella: es API pública de
Connect IQ, sin acuerdo comercial de por medio.

```
ajustes del móvil (email + código)   →  token de sesión (30 días)
   →  GET /api/athlete/wearables/garmin/today?date=YYYY-MM-DD
   →  GET fit_url                     (el SISTEMA descarga y persiste el .FIT)
   →  PersistedContent.getAppWorkouts()   →  buscar por NOMBRE
   →  workout.toIntent()  →  System.exitTo()
   →  reproductor NATIVO de Garmin
```

## Estructura

```
garmin-ciq/
├── manifest.xml              permisos, minSdkVersion, ~45 relojes objetivo
├── monkey.jungle             rutas de fuente y recursos, override de inglés
├── source/
│   ├── FahybridApp.mc        AppBase · onStart · onSettingsChanged
│   ├── Controller.mc         la máquina de estados (único sitio que decide)
│   ├── AppState.mc           los estados posibles
│   ├── Api.mc                las 3 peticiones + EL CONTRATO DEL ENDPOINT
│   ├── Delivery.mc           PersistedContent: buscar, limpiar, lanzar Intent
│   ├── Store.mc              Properties (móvil) vs Storage (solo reloj)
│   ├── Json.mc               lectura defensiva de la respuesta
│   ├── Config.mc             constantes (URLs, claves, umbrales)
│   ├── Theme.mc              color y proporciones
│   ├── DateUtil.mc           fecha local del reloj en ISO
│   ├── TextUtil.mc           partido de texto a líneas
│   ├── MainView.mc           la única pantalla
│   └── MainDelegate.mc       START / BACK / gesto de refresco
├── resources/                español (idioma por defecto) + ajustes + icono
└── resources-eng/            solo pisa los textos si el reloj está en inglés
```

## Login del atleta

Los ajustes de Garmin Connect Mobile son **XML declarativo**: no admiten botones
que llamen a una API, a diferencia de la pantalla de ajustes de Zepp, que es
JavaScript (`zepp/setting/index.js`). Así que el flujo se reparte: **el móvil
pone el teclado y el reloj hace las dos llamadas HTTP.**

1. El atleta escribe su email en Garmin Connect › Connect IQ › FAHYBRID › Ajustes.
2. En el reloj pulsa **Pedir código** → el reloj hace `POST /api/auth/email/request`.
3. Le llega el código de 6 dígitos por email (caduca en 10 min) y lo escribe en la
   misma pantalla de ajustes del móvil.
4. Al guardar, Garmin llama a `onSettingsChanged()` en el reloj → el reloj hace
   `POST /api/auth/email/verify` → guarda `session_token` y **borra el código**
   de los ajustes.

Endpoints **ya vivos**, los mismos que usan iOS y Zepp. No se ha inventado ninguno.

Dónde vive cada cosa, y por qué:

| Dato | Almacén | Motivo |
|---|---|---|
| email, código | `Application.Properties` | el atleta los teclea desde el móvil |
| `session_token`, email del token, último entreno | `Application.Storage` | **solo reloj**: no se sincroniza ni se enseña en ajustes |

Un token en Properties saldría en pantalla en la app del móvil. No se hace.

### Limitaciones honestas de este mecanismo

- Los ajustes solo bajan al reloj con el móvil emparejado y **cuando el atleta
  sale de la pantalla de ajustes** en Garmin Connect. Tarda unos segundos. Por eso
  hay un gesto manual de refresco (swipe/rueda) además de `onSettingsChanged()`.
- El campo del código es `alphaNumeric`, no `numeric`, **a propósito**: un campo
  numérico se comería el cero inicial y un código como `012345` llegaría al
  servidor como `12345`, fallando el `/^\d{6}$/` de `/verify`.
- Cambiar el email en los ajustes invalida el token guardado (se comprueba en cada
  arranque): si no, el token viejo seguiría vivo 30 días enseñando el entreno de
  otra persona.

## Contrato del endpoint (lo construye otro agente)

Definido y comentado en **`source/Api.mc`**. Resumen:

**`GET /api/athlete/wearables/garmin/today?date=YYYY-MM-DD`** · `Authorization: Bearer <session_token>`

```json
{
  "has_session": true,
  "exportable": true,
  "reason": null,
  "workout_name": "25 jul · 8×400",
  "summary": "8×400 a 3:35/km · 5,6 km",
  "fit_url": "https://fahybrid.com/api/athlete/wearables/garmin/workout?assignment_id=..."
}
```

- La `date` es la fecha **local del reloj**: el servidor no puede adivinar el huso.
- `exportable: false` = hay sesión pero no es de correr (fuerza / EMOM / AMRAP).
  Ningún formato de reloj los modela — ver
  `shared/domain/wearables/watch-workout.ts`. La app lo dice y manda a la app del móvil.
- **`workout_name` es la clave del sistema.** La app no puede leer el contenido
  del `.FIT`: de un entreno persistido solo obtiene `getName()` y `getId()`, y el
  id lo asigna el reloj al guardar. El emparejamiento es **por nombre**, así que
  debe ser único por día y **≤ 40 caracteres** (`STEP_NAME_MAX` del modelo neutro).
- `401` → la app borra el token y pide login otra vez.

**`GET {fit_url}`** · `Authorization: Bearer <token>` → el `.FIT`

> **Lo más frágil del contrato:** la respuesta DEBE llevar
> `Content-Type: application/vnd.ant.fit`. El proxy de Garmin Connect no mira el
> contenido, solo la cabecera; si no coincide con el `responseType` declarado, ni
> siquiera transmite los bytes al reloj y la descarga falla sin explicación.
> HTTPS obligatorio y URL absoluta.

## Estados que maneja la app

Uno por situación real. Ninguno acaba en pantalla en blanco ni en "error" a secas.

| Situación | Qué ve el atleta |
|---|---|
| Sin email en ajustes | dónde escribirlo |
| Falta el código | "Pedir código" → dónde escribirlo, caduca en 10 min |
| Código malo / caducado / 429 | "Pide uno nuevo" |
| Sesión caducada (401) | vuelve a entrar |
| Hoy no toca | "Hoy no toca" |
| Sesión no exportable | "Esto va en la app" |
| Entreno listo | nombre + resumen → "Pasar al reloj" |
| Ya descargado | "Ya lo tienes en el reloj" → "Empezar" |
| Sin conexión (**-104**) y ya descargado hoy | arranca igual, avisando |
| Sin conexión y nada descargado | "Acerca el móvil / conecta el WiFi" |
| Reloj lleno (**STORAGE_FULL**, -1000) | "Borra entrenos viejos desde Garmin Connect" |
| Dispositivo incompatible (200 + iterador vacío) | "Este reloj no acepta entrenos de una app" |
| Antes de salir | avisa de **los dos toques** del sistema |

Antes de cada descarga se borran los entrenos **de esta app** de días anteriores
(`Delivery.removeStaleExcept`): libera sitio — una de las causas de
`STORAGE_FULL` — y evita que el atleta arranque el de ayer. Nunca se toca el
contenido de Garmin Connect (`getAppWorkouts`, no `getWorkouts`).

## Compilar

El SDK de Connect IQ **no está instalado en esta máquina** (ver "Sin verificar").
Para compilar:

1. Instala el [SDK Manager de Connect IQ](https://developer.garmin.com/connect-iq/sdk/)
   y desde él un SDK 7.x, más los dispositivos objetivo.
2. Genera la clave de desarrollador (firma la app, **es un secreto** — `.gitignore`
   ya la excluye):
   ```
   openssl genrsa -out developer_key.pem 4096
   openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt
   ```
3. Compila para un dispositivo:
   ```
   monkeyc -f monkey.jungle -o bin/fahybrid.prg -y developer_key.der -d fr965 --typecheck 1
   ```
   `--typecheck 1` (gradual), no 3 (estricto): la firma publicada del callback de
   `makeWebRequest` no incluye `PersistedContent.Iterator` aunque es lo que
   entrega en las descargas FIT — es un fallo conocido del SDK, no del código.
4. Empaquetar para la tienda:
   ```
   monkeyc -f monkey.jungle -o bin/fahybrid.iq -y developer_key.der -e
   ```

Si `monkeyc` rechaza algún `<iq:product>`, es que ese id no existe en el SDK
instalado: quítalo. La lista válida la manda el SDK (`bin/devices.xml`), no este
repo. Los Edge están fuera **a propósito**: son ciclocomputadores y no ejecutan
entrenos de carrera.

## Probar

**En el simulador** (`connectiq` + `monkeydo bin/fahybrid.prg fr965`) se puede
comprobar: navegación y estados, login completo contra `fahybrid.com`, la llamada
de hoy, y que la descarga FIT devuelve 200.

**En el simulador NO se puede comprobar** lo que de verdad importa: Garmin no
simula las apps nativas, así que `System.exitTo()` no arranca ningún reproductor.
Hace falta un reloj físico:

```
# copia el .prg a la carpeta de apps del reloj por USB
cp bin/fahybrid.prg /Volumes/GARMIN/GARMIN/APPS/
```

Checklist en el reloj, por orden:

1. Login completo (email → código → token).
2. Un día con carrera: descargar y **ver que arranca el reproductor nativo** con
   los tramos correctos.
3. Un día de fuerza: debe decir "Esto va en la app", no descargar nada.
4. Un día de descanso: "Hoy no toca".
5. Modo avión / móvil lejos: `-104` con copy correcto; y con el entreno ya
   descargado, que arranque igual.
6. Volver a entrar al día siguiente: que el entreno de ayer se haya borrado solo.
