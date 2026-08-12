'use client';

// LA LECTURA DE UNA CARRERA — qué ve el atleta al terminar de correr.
//
// DE DÓNDE SALE. `resumen-carrera` (29-jul) acertó lo difícil: el sujeto lo
// decide la FORMA de lo que corriste, no el formato de la pantalla. Le faltaba
// lo que no existía entonces — el ARCHIVO. Desde la tanda T0 la carrera se
// guarda muestra a muestra y el servidor sirve `execution.trace`, así que
// aparece un sujeto que antes no podía existir:
//
//   **Si hubo prescripción con objetivo medible, el sujeto es si la clavó.**
//
// Para un 6×800 a 3:30 la pregunta del atleta no es «¿cuál fue mi ritmo medio?»
// es «¿las hice?». Garmin no puede contestarla porque no sabe qué le pidieron;
// Runna no puede porque no hay coach detrás. Nosotros tenemos las dos mitades.
//
// LA BIFURCACIÓN QUE DECIDE ALEX. Los escenarios ① y ② son la MISMA carrera con
// el mismo dato: solo cambia quién gana el número grande. En A manda el
// veredicto («5 de 6») y en B manda el hecho («3:32/km», con el veredicto
// debajo). Es una decisión de tono, no de datos: si la app le pone nota al
// atleta cada vez que termina, o se la enseña sin juzgar.
//
// COMPOSICIÓN. Arquetipo **Detalle**, estrategia **llena** (§6.1): el cromo, el
// contexto y el sujeto reproducen EXACTAMENTE la banda de `kit-vivo` —el sujeto
// cae en el mismo punto óptico que en las diez vistas en vivo, §10.3—, y por
// debajo la pantalla scrollea con lo que da sentido al número. La acción va
// anclada y no compite (§10.5). El sobrante no existe: aquí sobra contenido, no
// espacio.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ambiente, Apoyo, BANDA, FilaApoyos, FranjaAccion, zonaDe } from '../../kit-vivo';
import { distancia, reloj } from '../../kit-composicion/formato';
import { S } from '../../kit-composicion/tokens';
import { distribucionZonas } from '../../zonas';
import { BarraZonas, ContenidoComoHaIdo, DIFICULTAD_LABEL, FilaPlegada, PastillasRPE, estadoComoHaIdoInicial } from '../post-entreno/piezas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Curva } from './curva';
import { ESCENAS } from './datos';
import { lecturaDeCorrer, type Carrera, type Lectura } from './modelo';
import { Mapa, Seccion, SinArchivo, TablaKilometros, TablaRepeticiones, derivadasDe } from './piezas';
import { Sujeto, type VozDelSujeto } from './sujeto';

/** Cuándo empezó a archivarse la carrera. Se escribe en el hueco declarado. */
const ARCHIVO_DESDE = '11 de agosto';

export const meta: TwinMeta = {
  id: 'lectura-carrera',
  titulo: 'Al terminar de correr — ¿las hiciste?',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-12',
  descripcion:
    'Con la carrera archivada aparece un sujeto que no podía existir: si clavó lo que le pidieron. La curva enseña la banda del coach y los tramos encima, y el troceado es por serie o por kilómetro, nunca los dos.',
  fuentes: [],
  enApp:
    'El Swift de hoy (PostWorkoutSummaryView) ya tiene el mapa del recorrido, el reparto de zonas, el RPE y «Cómo ha ido». Lo nuevo es todo lo que nace del archivo: el sujeto por veredicto, la curva con la banda, el troceado y lo derivado.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'series-veredicto',
    titulo: '① 6×800 · A · manda el veredicto',
    descripcion:
      'El número grande es «5 de 6 dentro» y debajo va hacia dónde falló la que se salió. Recuperación TROTANDO con su propio objetivo, que es lo que se hace de verdad: mira el tercer y el cuarto trote, que se fueron a 5:48 pidiéndole 6:00-6:20, y mira lo que le pasa a la quinta serie.',
  },
  {
    id: 'series-hecho',
    titulo: '① 6×800 · B · DESCARTADA',
    descripcion:
      'La alternativa que NO se eligió (Alex, 12-ago). El número grande era el ritmo medio y el veredicto bajaba a apoyo: enseñar sin juzgar. Se descartó porque el ritmo medio de unas series ya lo da cualquier reloj, y el veredicto es lo único que nadie más puede dar. Se conserva para que la decisión no haya que volver a tomarla a ciegas.',
  },
  {
    id: 'fartlek',
    titulo: '② Fartlek por sensaciones',
    descripcion:
      'Sin objetivo de ritmo no hay veredicto que dar: manda el contraste, fuerte contra suave. La curva no lleva franja porque no se pidió ninguna.',
  },
  {
    id: 'rodaje-zona',
    titulo: '③ Rodaje 60′ en Z2',
    descripcion:
      'El objetivo era una zona: el sujeto es el tiempo dentro de ella, y la franja se dibuja sobre el PULSO, que es la señal que lo mide. Troceado por kilómetro.',
  },
  {
    id: 'rodaje-banda',
    titulo: '④ Rodaje 12 km a ritmo',
    descripcion:
      'Una sola cosa con banda de ritmo: «1 de 1 dentro» no es una lectura, así que manda la media y el veredicto la acompaña. El km 7 perdió señal y se dice, no se interpola.',
  },
  {
    id: 'cuesta',
    titulo: '⑤ 8×200 en cuesta al 8%',
    descripcion:
      'En pendiente el ritmo bruto no significa nada: el troceado cambia de eje y se lee en TIEMPO, con la caída de la primera a la última. El veredicto de ritmo se retira.',
  },
  {
    id: 'libre',
    titulo: '⑥ Salida libre, sin prescripción',
    descripcion:
      'No hay intención que contrastar: quedan los dos apretones que se marcó él. Van con su sello de dato inferido, porque no los cerró ningún entreno.',
  },
  {
    id: 'sin-archivo',
    titulo: '⑦ Sesión antigua, sin archivo',
    descripcion:
      'El estado de TODAS las sesiones anteriores a esta semana. Sin curva, sin kilómetros, sin mapa y sin nada derivado: una frase que lo explica y los totales que sí existen.',
  },
  {
    id: 'series-cinta',
    titulo: '⑧ El mismo 6×800, en cinta',
    descripcion:
      'Mismo guion que el ①: lo único que cambia es dónde corrió. La distancia la sella la correa, el mapa no existe y no se declara (en cinta no hay nada que hacer para tenerlo), y la curva sale con mesetas limpias porque una cinta sostiene el ritmo.',
  },
  {
    id: 'series-parado',
    titulo: '⑨ La misma serie, parado',
    descripcion:
      'El caso raro, que existe y hay que poder leer: repeticiones cortas y máximas donde sí se para. Sin ritmo en la recuperación no hay nada que juzgar ni franja que dibujar, y la curva se parte en seis islas. Va de menor porque no es lo que se hace el 90% de las veces.',
  },
];

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const carrera: Carrera = ESCENAS[escenario] ?? ESCENAS['series-veredicto']!;
  const lectura = lecturaDeCorrer(carrera);
  // A y B son la misma lectura contada con otra voz. La bifurcación vive AQUÍ,
  // en la presentación, y no en el modelo: es tono, no dato.
  const voz: VozDelSujeto = escenario === 'series-hecho' ? 'hecho' : 'veredicto';
  const zona = zonaDe(carrera.fcMediaPpm);
  const revision = carrera.momento === 'revision';
  const derivadas = derivadasDe(carrera);
  const zonas = distribucionZonas({ duracionS: carrera.duracionS, zonasS: carrera.zonasS });

  useEffect(() => {
    onLog(`Sujeto: ${lectura.sujeto.clase}${voz === 'hecho' ? ' (voz B)' : ''} · troceado ${lectura.troceado}`);
    onLog(carrera.procedencia);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="twin-screen-safe">
      <Ambiente zona={zona} appearance={appearance} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'grid',
          gridTemplateRows: `minmax(0, 1fr) ${BANDA.accion}px`,
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: BANDA.hueco,
          padding: BANDA.hueco,
          boxSizing: 'border-box',
          // De aquí cuelga la escala del numeral (`cqh`): sin contenedor de
          // consulta el sujeto se queda clavado en el suelo del clamp.
          containerType: 'size',
        }}
      >
        <div className="twin-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Portada carrera={carrera} lectura={lectura} voz={voz} />

          {carrera.traza ? (
            <Curva
              ritmo={carrera.traza.ritmo}
              pulso={carrera.traza.pulso}
              repeticiones={carrera.repeticiones}
              lectura={lectura}
              kilometros={lectura.troceado === 'kilometros' ? carrera.kilometros.filter((k) => !k.parcial).map((k) => k.cruceS) : []}
              descripcion={`Ritmo y pulso de ${carrera.titulo} a lo largo de la sesión`}
            />
          ) : (
            <SinArchivo desde={ARCHIVO_DESDE} revision={revision} />
          )}

          {/* El reparto de zonas solo cuando el sujeto ES la zona: en cualquier
              otra lectura sería una barra más que nadie vino a buscar. */}
          {lectura.sujeto.clase === 'tiempo-en-zona' && zonas.length > 0 && (
            <Seccion titulo="Dónde estuvo tu pulso">
              <BarraZonas segmentos={zonas} />
            </Seccion>
          )}

          {lectura.troceado === 'repeticiones' && (
            <Seccion titulo="Tramo a tramo">
              <TablaRepeticiones
                repeticiones={carrera.repeticiones}
                veredictos={lectura.veredictos}
                veredictosRecuperacion={lectura.veredictosRecuperacion}
                eje={lectura.eje}
                certeza={carrera.certezaTramos}
              />
            </Seccion>
          )}

          {lectura.troceado === 'kilometros' && carrera.kilometros.length > 0 && (
            <Seccion titulo="Kilómetro a kilómetro">
              <TablaKilometros kilometros={carrera.kilometros} />
            </Seccion>
          )}

          {carrera.ruta.length > 0 && (
            <Seccion titulo="El recorrido">
              <Mapa ruta={carrera.ruta} />
            </Seccion>
          )}

          {derivadas.length > 0 && (
            <Seccion titulo="Además">
              <FilaApoyos>
                {derivadas.map((d) => (
                  <Apoyo key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} pie={d.pie} />
                ))}
              </FilaApoyos>
            </Seccion>
          )}

          {revision ? <LoQueDijiste carrera={carrera} /> : <Registro prescrita={carrera.prescrito != null} onLog={onLog} />}
        </div>

        <FranjaAccion
          titulo={revision ? 'Cerrar' : 'Guardar el entreno'}
          unicaSalida={!revision}
          nota={revision ? undefined : (carrera.prescrito ?? undefined)}
          onClick={() => onLog(revision ? 'Cerrado' : 'Entreno guardado')}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La portada — cromo, contexto y sujeto, en la banda de siempre (§10.3)
// ---------------------------------------------------------------------------

function Portada({ carrera, lectura, voz }: { carrera: Carrera; lectura: Lectura; voz: VozDelSujeto }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateRows: `${BANDA.cromo}px ${BANDA.contexto}px auto`,
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: BANDA.hueco,
      }}
    >
      <Cromo carrera={carrera} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Contexto carrera={carrera} lectura={lectura} />
      </div>
      <BandaAnclada>
        <Sujeto carrera={carrera} lectura={lectura} voz={voz} />
      </BandaAnclada>
    </div>
  );
}

/**
 * EL SUJETO CAE DONDE SIEMPRE — y la banda es un ANCLA, no una caja (§10.3).
 *
 * Reservar los 340 pt enteros de `BANDA.sujeto` clava el centro óptico en su
 * sitio, sí, pero deja ~110 pt de nada entre el número y la curva: la misma
 * «cola» que el §6.1 prohíbe, colocada en medio en vez de al final. Aquí abajo
 * hay contenido de sobra, así que lo correcto es anclar el CENTRO y dejar que lo
 * de debajo empiece justo donde acaba el bloque.
 *
 * Se mide en vivo porque el sujeto no mide lo mismo en las seis lecturas: «5 de
 * 6» con dos líneas de apoyo y «44:15» con una no ocupan igual, y un número
 * escrito a mano se quedaría obsoleto a la primera línea de copy que cambie.
 */
function BandaAnclada({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAlto(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Media banda por encima, menos lo que el propio bloque sube: el centro cae
  // en los mismos 345 pt del lienzo que en las diez vistas en vivo.
  const encima = Math.max(0, BANDA.sujeto / 2 - alto / 2);

  return (
    <div style={{ paddingTop: encima, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

/** El cromo se reparte a los lados y NUNCA por el centro: ahí vive la isla. */
function Cromo({ carrera }: { carrera: Carrera }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span
        className="t-readout-label"
        style={{ color: 'var(--twin-fg)', letterSpacing: '0.12em', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {carrera.titulo}
      </span>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
        {carrera.cuando}
      </span>
    </div>
  );
}

/** Los totales, degradados a contexto: lo que el reloj llamaba «el resumen». */
function Contexto({ carrera, lectura }: { carrera: Carrera; lectura: Lectura }) {
  const piezas = [
    // Cuando el sujeto ES la distancia, no se repite aquí.
    lectura.sujeto.clase === 'kilometros' ? null : distancia(carrera.distanciaM),
    reloj(carrera.duracionS),
    // Con el `+` delante se lee como lo que es —subida acumulada— y no como una
    // segunda distancia al lado de los kilómetros.
    carrera.desnivelM != null && carrera.desnivelM > 0 ? `+${carrera.desnivelM} m` : null,
  ].filter((p): p is string => p != null);

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 10 }}>
      {piezas.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          {i > 0 && <span style={{ color: 'var(--twin-faint)', font: '500 15px/1 var(--twin-font-sans)' }}>·</span>}
          <span className="t-readout-s" style={{ color: 'var(--twin-muted)', fontSize: 19 }}>
            {p}
          </span>
        </span>
      ))}
      {carrera.superficie === 'cinta' && <SelloCinta />}
    </div>
  );
}

/**
 * DE DÓNDE SALE LA DISTANCIA, y no es un detalle: un 5K en cinta no bate al de
 * calle. La correa mide su propio recorrido, así que la cifra de arriba no la ha
 * puesto el GPS y eso tiene que verse pegado a ella.
 *
 * En sans y no en la mono del readout, a propósito: «en cinta» no es una cifra, y
 * monoespacearlo lo disfrazaría de medida (§4 del CONTRATO-UI). En calle NO hay
 * sello: lo de siempre no se anuncia.
 */
function SelloCinta() {
  return (
    <span
      style={{
        alignSelf: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        border: '1px solid var(--twin-hairline-strong)',
        font: '600 10px/1 var(--twin-font-sans)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      En cinta
    </span>
  );
}


// ---------------------------------------------------------------------------
// Lo de siempre — el registro, tal y como ya funciona en la app
// ---------------------------------------------------------------------------

type Abierta = 'esfuerzo' | 'como-ha-ido' | 'notas' | null;

function Registro({ prescrita, onLog }: { prescrita: boolean; onLog: (l: string) => void }) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [comoHaIdo, setComoHaIdo] = useState(estadoComoHaIdoInicial());
  const [notas, setNotas] = useState('');
  const [abierta, setAbierta] = useState<Abierta>(null);
  const toggle = (id: Abierta) => setAbierta((a) => (a === id ? null : id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: S.s }}>
      <FilaPlegada
        etiqueta="Esfuerzo"
        valor={rpe != null ? String(rpe) : 'Sin decir'}
        abierta={abierta === 'esfuerzo'}
        onToggle={() => toggle('esfuerzo')}
      >
        <PastillasRPE
          valor={rpe}
          onChange={(n) => {
            setRpe(n);
            if (n != null) onLog(`Esfuerzo ${n}`);
          }}
        />
      </FilaPlegada>
      {/* Sin prescripción no hay contra qué decir «fácil» o «duro»: la fila no
          existe, no se deshabilita. Es la misma regla que ya sigue el Swift. */}
      {prescrita && (
        <FilaPlegada
          etiqueta="Cómo ha ido"
          valor={comoHaIdo.dificultad ? DIFICULTAD_LABEL[comoHaIdo.dificultad] : 'Sin decir'}
          abierta={abierta === 'como-ha-ido'}
          onToggle={() => toggle('como-ha-ido')}
        >
          <ContenidoComoHaIdo estado={comoHaIdo} onCambia={setComoHaIdo} />
        </FilaPlegada>
      )}
      <FilaPlegada
        etiqueta="Notas"
        valor={notas.trim() ? notas : 'Sin decir'}
        abierta={abierta === 'notas'}
        onToggle={() => toggle('notas')}
      >
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Opcional"
          rows={2}
          aria-label="Notas del entreno"
          style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)', padding: 0 }}
        />
      </FilaPlegada>
    </div>
  );
}

/**
 * En una sesión que se abre del historial no hay nada que guardar: enseñar el
 * formulario en blanco invitaría a rellenar algo que ya se contestó hace tres
 * semanas. Se lee lo que se dijo, y si no se dijo nada la sección no existe.
 */
function LoQueDijiste({ carrera }: { carrera: Carrera }) {
  const dicho = carrera.dicho;
  const piezas = [
    dicho?.rpe != null ? `Esfuerzo ${dicho.rpe}` : null,
    dicho?.dificultad ? DIFICULTAD_LABEL[dicho.dificultad] : null,
  ].filter((p): p is string => p != null);
  if (piezas.length === 0) return null;
  return (
    <Seccion titulo="Lo que dijiste">
      <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{piezas.join(' · ')}</span>
    </Seccion>
  );
}
