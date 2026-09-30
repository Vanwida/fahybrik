# App de actividad Connect IQ (reloj Garmin)

Un `watch-app` con **motor propio**: guía la sesión de correr paso a paso contra su objetivo, graba el FIT, deja el RPE y envía el resultado al servidor. Sustituye a la antigua «mensajera» (que descargaba un FIT y cedía el reloj al reproductor de Garmin). Especificación: `docs/garmin-reloj/modelo.md` y `docs/garmin-reloj/plan-compacto.md`.

**Alcance de esta fase: solo correr.** Una sesión con fuerza, circuito, WOD, ergo o Roxzone dice «Esta sesión va en la app». El decodificador lee TODOS los campos del formato; lo que falta son las caras y reglas de esas familias.

## Copiar al reloj por USB (FR965 / FR970)

1. Conecta el reloj al Mac por USB: aparece el volumen `GARMIN`.
2. Copia el fichero de tu reloj: `cp garmin-ciq/bin/fahybrid-fr965.prg /Volumes/GARMIN/GARMIN/APPS/` (o `fahybrid-fr970.prg`). Si `bin/` está vacío: `DEVELOPER_KEY=<ruta>/developer_key.der ./build.sh fr965`.
3. Expulsa el volumen y desconecta: el reloj procesa el fichero al desconectarse (unos segundos).
4. La clave de desarrollador NO se instala en el reloj: el `.prg` ya va firmado con ella. Guarda `developer_key.der` (está en `.gitignore`, nunca al repo): con OTRA clave el reloj lo trata como otra app.
5. Ábrela desde la lista de apps o actividades del reloj (sin verificar en reloj real). Necesita el móvil emparejado para bajar el plan y enviar el resultado; grabar, no.
6. **Riesgo abierto:** el login pide el email y el código en los *ajustes de la app en Garmin Connect*, y una app copiada por USB puede NO mostrar esos ajustes. Si no aparecen, hace falta el flujo de código de dispositivo (modelo.md §8, A5) o instalar por beta de la Store.

## Estructura

```
manifest.xml        36 relojes de nivel A, generados por tools/generar-manifest.py desde el SDK
monkey.jungle       source/ + tests/ (tests/ solo entra con monkeyc -t)
source/
  ActividadApp.mc   entrada; onStop guarda la sesión en curso
  Controller.mc     el estado único: login → plan → brief; delega la sesión en Vivo
  Vivo.mc           cuenta 3-2-1, botones §5, Controles, RPE, resumen, checkpoint
  Mandos.mc         teclas (START, BACK/LAP, UP, DOWN, UP largo); táctil apagado en la sesión
  Vista.mc          estados de texto (login, plan, errores)
  Store, Api, Json, DateUtil, Config, Theme   login y utilidades (de la mensajera)
  plan/             Codigos (GENERADO), Lector, Modelo, Decodificador, DecodificadorPaso, PlanStore, Clases
  motor/            Motor (la sesión), Juez (veredicto, aviso), Lamina (lo que se pinta), Ritmo,
                    Avisos (§6), Grabacion (FIT), Resultado + Cola (envío), Formato, Estructura, Paginas
  vista/            Lienzo (geometría del círculo), Fuentes, VistaVivo (las caras)
tests/              Vectores (GENERADO), Firma, ComprobarPlan, PlanStoreTest, MotorTest, ResultadoTest, VistaTest
tools/              generar-manifest.py, generar-codigos.py, generar-vectores.py, formato.py
```

Todo lo que es **método del coach** (zonas, holguras, preaviso, cadencia, vuelta automática, palabras del RPE, nombres de clase) llega en el plan; el reloj no trae ningún valor por defecto. El nombre de la app vive en un solo recurso (`resources/strings/strings.xml`, `AppName`).

## Compilar

```
export DEVELOPER_KEY=/ruta/a/developer_key.der     # o déjala en garmin-ciq/
./build.sh fr965          # un reloj  → bin/fahybrid-fr965.prg
./build.sh todos          # los 36 del manifest
python3 tools/generar-manifest.py    # regenera la lista de relojes desde el SDK instalado
python3 tools/generar-codigos.py     # regenera source/plan/Codigos.mc desde formato.ts
python3 tools/generar-vectores.py    # regenera tests/Vectores.mc desde los fixtures de web/
```

Typecheck 1 (gradual); con `TYPECHECK=3` el código heredado sin tipar no compila. Java: `JAVA_HOME=/opt/homebrew/opt/openjdk`.

## Tests (simulador)

`./test.sh fr965` compila con `-t`, abre el simulador y corre todos los `(:test)`. Si el simulador se queda colgado tras interrumpir una ejecución, ciérralo y ábrelo de nuevo antes de la siguiente. Cubren: los 47 vectores de oro del plan compacto (firma de todo lo leído contra el códec de referencia), Storage del plan, ritmo suavizado, veredicto, aviso, cierre/deshacer, seguir una sesión interrumpida, cuerpo del resultado y cola, y que ninguna cara del vivo lance una excepción. **No** prueban cómo se ve ni nada que dependa del firmware.

## Prueba en reloj real (modelo.md §12, en este orden)

Con un FR965/970 y un FR255. Nada de esto se puede simular.

- **T1** 30′ de carrera grabada como RUNNING y otra como TRAINING/HIIT: ¿Training Effect, carga, Training Status, VO2max y recuperación, en el reloj y en Garmin Connect? Decide el copy y el mapa deporte→FIT.
- **T2** Pantalla AMOLED grabando: ¿se apaga?, ¿despierta al girar la muñeca?
- **T3** Las cinco teclas llegan durante la grabación (BACK, START, UP, DOWN, UP largo): ¿se pierde alguna?
- **T4** Vibración en Forerunner (¿respeta on/off?) y tonos, con y sin auriculares; con la app inactiva.
- **T5** Envío del resultado (2, 8 y 30 KB) por móvil BLE, sin móvil y por WiFi.
- **T6** Plan de 7 días en Storage; memoria libre en FR255 (512 KB).
- **T7** Salir con la sesión abierta; batería agotada: qué queda en Garmin Connect.
- **T8** Campos propios (paso, objetivo, huella) en Garmin Connect (necesita beta de la Store y declararlos en resources/fitcontributions).
- **T9** `addLap` por paso: cómo salen los tramos en Garmin Connect.
- **T10** Acelerómetro (fase 2, no aplica ahora).
- **T11** GPS: tiempo al fix, multibanda, pista.
- **T12** Batería: 90′ con GPS + pulso.
- **T13** Volver a la esfera con la sesión grabando.
- **T14** Correa de pulso ANT+/BLE.

Y además, propio de esta fase: ritmo actual contra un reloj de referencia en una recta conocida; BACK como vuelta 20 veces seguidas; «Seguir» tras matar la app; login desde una app copiada por USB (punto 6 de arriba).
