# Clonar la app iOS para una segunda marca

Este código se vende como FLEXR a otros entrenadores, así que antes o después hay
una **segunda app iOS** con otro nombre, otro bundle y otro dominio. Este
documento es el inventario de las costuras: qué se cambia, qué **no se toca** y
qué necesita que un humano cree cuentas o identificadores.

No es una propuesta de renombrar nada de FAHYBRID. Lo que ya está instalado en el
teléfono de un atleta se queda como está.

---

## 1. Lo que hoy se cambia en un solo sitio

En `ios/project.yml`, bloque `settings.base`:

| Ajuste | Valor actual | Quién lo consume |
|---|---|---|
| `BRAND_DISPLAY_NAME` | `FAHYBRID` | `CFBundleDisplayName` de app, reloj y widgets + las **10 descripciones de permisos** + `Marca.nombre` en Swift (una veintena de pantallas) |
| `BRAND_BUNDLE_ID` | `com.fahybrid.app` | bundle id de los **5 targets** (app, reloj, widgets, tests, UITests), `CFBundleURLName` y `WKCompanionAppBundleIdentifier` |
| `BRAND_WEB_DOMAIN` | `fahybrid.com` | `applinks:` de los dos entitlements, clave `BrandWebDomain` del Info.plist de app y reloj, y de ahí `Marca` en Swift (legales, cuenta, origen del reproductor, base del backend por defecto) |
| `BRAND_URL_SCHEME` | `fahybrid` | `CFBundleURLSchemes` (enlace profundo de invitación de pareja) |
| `DEVELOPMENT_TEAM` | `TBD` | firma de los tres targets firmables |

Tras tocar cualquiera: `cd ios && xcodegen generate` y commit del `.pbxproj`.

En Swift no hay que tocar nada: `ios/FAHYBRIKCore/Marca.swift` lee nombre y
dominio **del bundle**, así que el nombre que el sistema pone en la hoja de
permisos y el que la app pone en sus alertas no pueden discrepar. Compila en el
teléfono y en el reloj.

`BRAND_WEB_DOMAIN` es el dominio **público** de la marca. El backend es otra
costura, ya existente y a propósito: `FAHYBRIK_API_BASE` por configuración de
build (Debug y Release apuntan hoy los dos a `https://app.fahybrid.com`), para
poder mover de entorno sin cambiar de marca.

---

## 2. Lo que un clon tiene que cambiar y NO está en esos cinco ajustes

Ordenado por lo que bloquea antes.

### 2.1 Requiere que un humano cree algo (no hay parametrización posible)

1. **Registro de App ID + ficha de App Store Connect.** Un bundle id nuevo hay
   que darlo de alta en developer.apple.com con sus capacidades (Sign in with
   Apple, HealthKit, Push, Associated Domains) y crear la app en App Store
   Connect. Checklist: `docs/app-store/testflight-checklist.md`.
2. **Team ID y certificados de firma.** `DEVELOPMENT_TEAM: TBD` es deliberado y
   tiene que seguir compilando en simulador. El team id es dato del operador y no
   viaja en el repo (`docs/DECISIONS.md`, 2026-08-16). Se pone en la línea de
   `settings.base` o por línea de comandos:
   `xcodebuild … DEVELOPMENT_TEAM=AB12CD34EF`.
3. **Clave APNs.** El tópico del push es el bundle id, así que un clon necesita su
   propia clave / certificado en su cuenta y darla de alta en el backend.
4. **App ID de Garmin Connect IQ.** `garmin-ciq/manifest.xml` lleva un UUID
   (`iq:application id=…`) que **identifica la app publicada** en la tienda de
   Connect IQ. Dos apps no pueden compartirlo: un clon necesita uno nuevo,
   generado por el SDK al crear el proyecto. No se inventa a mano.
5. **`appId` de Zepp.** `zepp/app.json` lleva un `appId` numérico asignado por la
   consola de desarrollador de Zepp. Mismo caso.
6. **Dominio y `apple-app-site-association`.** Los `applinks:` solo funcionan si
   el dominio sirve el fichero de asociación firmado con el App ID del clon.

### 2.2 Nombres internos de proyecto (renombrado, no parametrización)

El proyecto, los targets, los esquemas y las carpetas se llaman `FAHYBRIK` —
nombre heredado del repo, nunca visible al atleta. Un clon **puede dejarlos tal
cual** (el nombre visible sale de `BRAND_DISPLAY_NAME`); solo estorban si se
quiere que el `.xcodeproj` se llame como la marca, y entonces es un renombrado de
carpetas y de `project.yml`, no un ajuste.

Consecuencia práctica: `PRODUCT_NAME: FAHYBRIK` es el nombre del **binario**
dentro del bundle, y `FAHYBRIKTests` lo usa en su `TEST_HOST`. Cambiar uno sin el
otro rompe la carga del bundle de tests.

### 2.3 Literales de marca fuera del grafo de Xcode

No los alcanza la expansión `$(BRAND_…)` porque no los procesa Xcode. Un clon los
edita a mano; están aquí para que se encuentren todos:

| Fichero | Qué lleva |
|---|---|
| `ios/fastlane/Appfile` | `app_identifier("com.fahybrid.app")` |
| `ios/fastlane/Fastfile` | `APP_BUNDLE_ID`, `APP_NAME`, `output_name` |
| `docs/app-store/*.md` | bundle id, nombre, copy de la ficha, plan de capturas |
| `garmin-ciq/resources/strings/strings.xml` y `resources-eng/…` | `AppName` + el nombre dentro de 6 frases de copy |
| `zepp/app.json` | `appName` (×3, con las dos localizaciones) |
| `zepp/setting/index.js`, `zepp/app-side/index.js`, `garmin-ciq/source/Config.mc` | `API_BASE` = `https://fahybrid.com` |
| `zepp/page/index.js` | copy que nombra la marca en el reloj |

**Acoplamiento que no se ve:** la pantalla de emparejar Garmin
(`ios/FAHYBRIK/Wearables/GarminSetupView.swift`) le dice al atleta que busque la
app **por su nombre** en la tienda de Connect IQ y en el menú del reloj. Ese
nombre sale del `strings.xml` de Garmin, no del bundle de iOS. Ahora usa
`Marca.nombre`, así que si un clon renombra solo uno de los dos, las
instrucciones mandan al atleta a buscar algo que no existe. Los dos nombres
tienen que moverse juntos.

**Nota sobre los dos hosts:** iOS habla con `app.fahybrid.com` y las tres
superficies de muñeca de terceros con `fahybrid.com`. Los dos sirven la API hoy
(comprobado: `GET /api/auth/email/request` responde 405 en ambos, o sea, la ruta
existe y solo acepta POST). Un clon tiene que mover **los dos**.

### 2.4 El idioma, que es el hueco más grande y no se ve

La app es **solo español, por diseño y a fondo**: `developmentLanguage: es`,
`CFBundleDevelopmentRegion: es`, `CFBundleLocalizations: [es]` (para que las hojas
del sistema salgan en español pase lo que pase) y **todo el copy escrito como
literal en Swift** — no hay catálogo de strings ni una sola clave traducida.

Para un clon con atletas que no hablan español eso no es «cambiar un ajuste»: es
introducir localización en cientos de pantallas. Ninguna de las costuras de este
documento lo alivia y no se ha tocado nada de esto. Es el trabajo grande, y hay
que contarlo como tal antes de prometer una segunda marca en otro idioma.

Las tres superficies de reloj de terceros sí están preparadas a medias: Garmin
tiene `resources/` (spa) + `resources-eng/` (eng) con las cadenas separadas del
código, y Zepp tiene `i18n` en `app.json` con `en-US` y `es-ES`.

### 2.5 Recursos de marca

| Sitio | Sets |
|---|---|
| `ios/FAHYBRIK/Assets.xcassets` | `AppIcon`, `BrandLogo` (el wordmark), `BrandAccent`, `BrandBackground`, `BrandForeground`, `BrandMuted`, `BrandSurface` |
| `ios/FAHYBRIKWatch/Assets.xcassets` | `AppIcon` (solo watchOS) |
| `garmin-ciq/resources/drawables/launcher_icon.png`, `zepp/assets/*/icon.png` | iconos de cada reloj |

Los **nombres** de los sets son neutros a propósito (`AppIcon`, `BrandAccent`), así
que un clon sustituye contenido sin tocar código. Los tokens de color viven en
`shared/tokens.json` + `web/app/globals.css` + `ios/FAHYBRIK/Theme/Theme.swift` y
se mueven en el mismo commit (ley de `AGENTS.md`); la paleta del reloj está en
`ios/FAHYBRIKCore/Watch/Lienzo/WatchPaleta.swift`.

---

## 3. Lo que NO se toca, y por qué

Todo esto **lleva la marca dentro y se queda como está**. No es descuido: es dato
ya escrito en el dispositivo de gente que usa la app.

### 3.1 Las 32 claves de almacenamiento con prefijo `fahybrik.`

`UserDefaults` y Keychain de app y reloj. Renombrarlas no migra nada: al abrir la
siguiente versión, el atleta encuentra la app **como recién instalada** — sin
sesión (`fahybrik.bearer` en Keychain), sin estado de onboarding, sin caché de
plan, sin consentimientos.

Además el prefijo es **mecanismo, no marca**: `AccountService.wipeLocalState()`
borra al eliminar la cuenta *exactamente las claves con ese prefijo*, para no
tocar preferencias del sistema. Una clave que no lo lleve sobrevive al borrado de
cuenta — que es justo lo que no debe pasar.

Y para un clon **no hace falta cambiarlas**: cada app tiene su propio sandbox de
`UserDefaults`, así que dos marcas instaladas en el mismo teléfono no se pisan.

### 3.2 `HealthKitWorkoutWriter.writtenHereKey = "FAHYBRIDWrittenByApp"`

Es el sello con el que están marcados los samples que ya viven en Apple Salud de
cada atleta. HealthKit no reescribe metadata: al renombrar la clave, todo lo
escrito hasta hoy deja de reconocerse como nuestro y vuelve a contarse como
medido por un dispositivo. Anotado en el propio fichero.

### 3.3 La firma de los entrenos programados en el reloj

`FahybrikWorkoutPlanID` (`ios/FAHYBRIK/Wearables/AppleWatchWorkoutScheduler.swift`)
marca los entrenos que ponemos en la app Entrenamiento del Apple Watch con cuatro
bytes fijos (`0xFA 0x48 0x1B 0x1D`) y un separador de dominio
(`fahybrik.workoutkit.plan.v1:`). Cambiarlos huerfana todo lo ya programado en la
muñeca de los atletas: no se reconocería para actualizarlo ni para retirarlo.

**Hueco pendiente de decisión, y es el menos obvio de la lista:** la firma
identifica «entradas nuestras» dentro de una cola que la app comparte con las
demás. Dos marcas nacidas de este código con la **misma** firma podrían verse —y
retirarse— los entrenos la una a la otra en un reloj con las dos instaladas. La
firma tendría que ser distinta por marca, pero no puede derivarse sin más de
`BRAND_*` porque cambiarla en FAHYBRID rompe lo ya programado. Hay que decidir el
mecanismo (p. ej. firma actual congelada para FAHYBRID + firma propia para cada
marca nueva).

### 3.4 Los nombres de las claves heredadas del Info.plist

`FahybrikApiBase` y `FahybrikDemoEntry` conservan el nombre interno viejo. No se
renombran porque un clon no gana nada: se queda con el nombre que haya, y
cambiarlo obliga a mover los dos lectores de Swift sin ninguna ventaja. `TBD` en
`DEVELOPMENT_TEAM` es igual de deliberado.

---

## 4. Reproducibilidad del `.pbxproj`

`ios/FAHYBRIK.xcodeproj/project.pbxproj` está commiteado pero **se genera**, y los
`Generated-Info.plist` de los tres targets están gitignorados. En un checkout
limpio la build falla hasta correr `xcodegen generate` — no es un fallo del
código.

`project.yml` lleva `generateEmptyDirectories: true`, así que el `.pbxproj`
contiene grupos de carpetas vacías. Git no versiona carpetas vacías: regenerar
desde un checkout limpio **quita** esos grupos y produce un diff que no
corresponde a ningún cambio de nadie. Es ruido conocido, no una regresión.

---

## 5. Comando de verificación

```bash
cd ios && xcodegen generate && cd ..
xcodebuild -project ios/FAHYBRIK.xcodeproj -scheme FAHYBRIK \
  -destination 'generic/platform=iOS Simulator' build
```

Siempre con `-destination`, nunca con `-sdk iphonesimulator` (el porqué está en
`project.yml`, bloque `schemes`).

Que los valores de marca se resuelven de verdad se comprueba en el bundle
construido, no en el fuente:

```bash
A=<derivedData>/Build/Products/Debug-iphonesimulator
plutil -p "$A/FAHYBRIK.app/Info.plist"                          # nombre, bundle id, dominio, permisos
plutil -p "$A/FAHYBRIK.app/Watch/FAHYBRIKWatch.app/Info.plist"  # WKCompanionAppBundleIdentifier
plutil -p <derivedData>/Build/Intermediates.noindex/FAHYBRIK.build/Debug-iphonesimulator/FAHYBRIK.build/FAHYBRIK.app-Simulated.xcent
```

El `.xcent` **sin** `-Simulated` sale vacío en simulador (no hay perfil de
aprovisionamiento): los `applinks:` expandidos se leen en el `-Simulated`.
