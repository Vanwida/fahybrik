-- 0156_workout_traces.sql
--
-- EL EJE DEL TIEMPO. LA PIEZA QUE FALTA PARA QUE UN ENTRENO DEJE RASTRO.
--
-- El problema que cierra. El motor mide la FC latido a latido y el ritmo del GPS varias
-- veces por minuto, los reduce a una media y cinco numeros de zona, y BORRA el resto
-- (`closeCurrentSegmentLap` -> `resetSegmentAccumulators`). Sin la serie no hay curva, ni
-- deriva cardiaca, ni recuperacion, ni ritmo instantaneo, ni splits por kilometro, ni
-- grafica que enseñar. El propio codigo ya lo tenia escrito, en
-- `ios/FAHYBRIK/Workout/PostWorkout/CarreraDeLaSesion.swift`:
--
--     «muestras -- NO. La app no guarda ninguna serie de ritmo, y el polilinea de la
--      ruta lleva coordenadas y ni un solo tiempo, asi que no se puede derivar sin
--      inventarla.»
--
-- Y en `PostWorkoutSummaryView.swift`, sobre por que el resumen enseña menos de lo que se
-- diseño: «Decoupling / recovery / power require sensor streams we don't capture yet, so
-- we don't fabricate them.» No es un hueco que descubramos ahora: es uno conocido,
-- documentado y nunca cerrado.
--
-- POR QUE UNA TABLA NUEVA Y NO `biometric_streams`. Esa tabla es una fila por lectura y
-- esta pensada para metricas del DIA -- pulso en reposo, VFC, peso, sueño, pasos. Meter
-- ahi las trazas de entreno seria, a escala de lanzamiento, decenas de millones de filas
-- al año que la volverian inservible para su proposito. Ademas su enum `biometric_metric`
-- esta cerrado a 16 valores y no incluye ritmo, altitud ni potencia.
--
-- POR QUE ESTE FORMATO, Y NO ES UN INVENTO. `workout_routes` (migracion 0127) ya
-- establecio el patron en este repo: UNA fila por ejecucion con la serie comprimida en un
-- campo, no fila por punto. Esto es lo mismo generalizado a cualquier señal. Es tambien
-- como lo hacen los formatos estandar del sector (FIT, TCX, GPX): un registro con sus
-- canales, no una fila por muestra.
--
-- DOS ARRAYS PARALELOS, Y EL EJE VA EXPLICITO. `offsets_s` guarda el segundo de cada
-- muestra desde `started_at`; `values` el valor. No se asume cadencia fija porque MEDIDO
-- contra los datos que ya tenemos, no la hay: las muestras que llegan de HealthKit van a
-- 4,9 s de media con huecos de hasta 81 s. Con un intervalo fijo habria que rellenar esos
-- huecos, y rellenarlos es fabricar dato indistinguible del medido. Con el eje explicito
-- el hueco se VE, y quien lee decide si ese tramo tiene cobertura para responder --
-- exactamente la misma doctrina que `loadIntensityCoverage()` aplica al TSS.
--
-- ORDEN DE MAGNITUD. Una sesion de 90 min a esa cadencia son ~1.100 muestras por señal,
-- unos 5 KB. Cuatro señales por sesion, un atleta entrenando cinco dias por semana: ~5 MB
-- al año por atleta. Es el orden correcto para un archivo que tiene que durar toda la
-- vida deportiva del atleta.
--
-- LA CLAVE INCLUYE LA FUENTE, Y ESO ES DELIBERADO. Un mismo entreno puede tener la FC de
-- la correa y la del reloj: son dos medidas distintas del mismo fenomeno y ninguna es
-- «la mala». Conviven en filas separadas sin pisarse, y quien lee elige por fidelidad
-- (`shared/domain/execution-merge/precedence.ts` ya tiene ese ranking escrito). Guardar
-- una sola, promediando o dejando ganar a la ultima que llega, es justo el fallo que
-- tenemos hoy en el pulso medio del tramo.
--
-- QUE NO ES ESTA TABLA. No es donde vive la RUTA: el trazado sigue en `workout_routes`
-- como polilinea codificada, que para coordenadas es ~5x mas compacto. La altitud y el
-- reloj de la carrera entran aqui como dos señales mas (`altitude`, `distance`), alineadas
-- con el resto por el mismo eje.

begin;

create table if not exists workout_traces (
  id            bigint generated always as identity primary key,
  execution_id  bigint not null references workout_executions(id) on delete cascade,

  -- Que se midio. Texto y no enum: las señales se amplian con cada aparato nuevo, y un
  -- enum obliga a migracion para algo que no cambia ninguna semantica. El CHECK deja la
  -- lista visible y ampliable de un vistazo.
  signal        text not null,

  -- QUIEN lo midio. Reusa el enum que ya distingue proveedores en todo el esquema.
  source        biometric_source not null,

  -- El instante de la muestra 0. Los offsets cuelgan de aqui, asi que la traza se puede
  -- cruzar con los `started_at`/`ended_at` de cada tramo para atribuir por ventana.
  started_at    timestamptz not null,

  -- Segundos desde `started_at`. Estrictamente creciente (lo garantiza el escritor, no
  -- un constraint: comprobarlo en SQL sobre un array de miles de elementos en cada
  -- insert no compensa).
  offsets_s     int[] not null,

  -- El valor en la unidad natural de la señal: bpm, s/km, W, m, spm, m sobre el nivel
  -- del mar. `real` y no `numeric`: son medidas de sensor con dos cifras significativas
  -- utiles, y pesa la mitad.
  values        real[] not null,

  created_at    timestamptz not null default now(),

  -- Una traza por (ejecucion, señal, fuente). Un re-sync actualiza, nunca duplica --
  -- misma garantia que `workout_routes` da para la ruta.
  constraint workout_traces_unique unique (execution_id, signal, source),

  constraint workout_traces_signal_chk check (signal in (
    'hr',        -- pulso, bpm
    'pace',      -- ritmo, s/km
    'speed',     -- velocidad, m/s (cinta y bici: su unidad nativa)
    'power',     -- potencia, W
    'cadence',   -- cadencia, pasos o paladas por minuto
    'altitude',  -- altitud, m
    'distance'   -- distancia acumulada, m
  )),

  -- Los dos arrays describen los mismos puntos: si no miden lo mismo, la traza esta
  -- corrupta y es mejor rechazarla en el insert que leerla desalineada para siempre.
  constraint workout_traces_aligned_chk check (
    cardinality(offsets_s) = cardinality(values)
    and cardinality(offsets_s) > 0
  )
);

-- La consulta del reporte: «todas las señales de esta ejecucion».
create index if not exists workout_traces_execution_idx
  on workout_traces (execution_id);

commit;
