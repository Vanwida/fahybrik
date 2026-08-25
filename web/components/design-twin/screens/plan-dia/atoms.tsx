'use client';

// Las piezas del día: el trabajo con sus bloques plegados, la línea de bloque y
// las dos maneras de repartir sus cifras de dosis.
//
// Viven aparte de la composición porque son las que llevan el dibujo, y no suben
// al kit compartido porque son de esta pantalla: el ciclo y la semana no pintan
// bloques. Toda cifra pasa por `<Numeral>` (§10.2) y toda grafía de dosis por
// `dosisConSeries()` (§2.1): aquí no se escribe ni un `2×10` propio.

import { dosisConSeries, type BloqueReal, type ItemReal, type SesionReal } from '../../datos-reales';
import { SP } from '../../kit';
import {
  Duracion,
  ETIQUETA_ESTADO,
  Fila,
  MarcaEstado,
  Numeral,
  Origen,
  PuntoModalidad,
  entradaStyle,
} from '../../plan/atoms';
import { estadoDia, type Dia, type EstadoDia, type Trabajo } from '../../plan/modelo';

/**
 * Hasta seis cifras en un bloque, la dosis se lee en FILAS grandes y el sobrante
 * se reparte entre ellas. A partir de ahí (las 16 estaciones de la simulación)
 * son una parrilla: con dieciséis filas grandes no cabe el día.
 */
export const TOPE_FILAS = 6;

// ---------------------------------------------------------------------------
// Lecturas — lo derivado se calcula UNA vez y se lee desde los dos ficheros
// ---------------------------------------------------------------------------

/** Un bloque de trabajo; el calentamiento y la vuelta a la calma son el marco. */
export const esTrabajo = (bloque: BloqueReal) => bloque.estructural !== true;

/** El estado de UN trabajo: el canónico del día aplicado a ese trabajo solo. */
export function estadoTrabajo(dia: Dia, trabajo: Trabajo, indice: number, indiceHoy: number): EstadoDia {
  return estadoDia({ ...dia, trabajos: [trabajo] }, indice, indiceHoy);
}

/** Cuántas cifras de dosis tiene un trabajo — sólo en sus bloques de trabajo. */
export function cifrasDe(sesion: SesionReal | null): number {
  if (!sesion) return 0;
  return sesion.bloques
    .filter(esTrabajo)
    .reduce((n, b) => n + b.items.filter((i) => dosisConSeries(i) !== null).length, 0);
}

/** Bloques de trabajo en los que el coach no dejó NINGUNA cifra. */
export function bloquesMudos(sesion: SesionReal | null): number {
  if (!sesion) return 0;
  return sesion.bloques.filter((b) => esTrabajo(b) && b.items.every((i) => dosisConSeries(i) === null)).length;
}

/**
 * El pie del sujeto: el formato que escribió el coach o, cuando el trabajo es un
 * solo ejercicio, su dosis. Nunca un tiempo inventado — una Simulación HYROX es
 * `for_time` y su duración ES el resultado, así que lo que se enseña es «For
 * Time · 16 estaciones».
 */
export function pieDeTrabajo(trabajo: Trabajo): string | undefined {
  const bloques = trabajo.ref?.bloques.filter(esTrabajo) ?? [];
  const conFormato = bloques.find((b) => b.formato);
  if (conFormato?.formato) return conFormato.formato;
  if (bloques.length === 1 && bloques[0].items.length === 1) {
    return dosisConSeries(bloques[0].items[0]) ?? undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Un trabajo del día — su cabecera y sus bloques plegados a una línea
// ---------------------------------------------------------------------------

export function TrabajoDelDia({
  dia,
  trabajo,
  indice,
  indiceHoy,
  soloUno,
  esSujeto,
  onLog,
}: {
  dia: Dia;
  trabajo: Trabajo;
  indice: number;
  indiceHoy: number;
  soloUno: boolean;
  esSujeto: boolean;
  onLog: (linea: string) => void;
}) {
  const estado = estadoTrabajo(dia, trabajo, indice, indiceHoy);
  const bloques = trabajo.ref?.bloques ?? [];
  const crece = cifrasDe(trabajo.ref) > 0;

  return (
    <Fila
      acento={esSujeto && !soloUno}
      onTap={() => onLog(`${trabajo.titulo} → abriría su ficha`)}
      // El aria NO repite la duración: la decide `<Duracion>` y escribirla aquí
      // en palabras sería la misma decisión en dos sitios (§2).
      etiqueta={`${trabajo.titulo}, ${ETIQUETA_ESTADO[estado]}. Abre la ficha de la sesión.`}
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: SP.s,
        flex: crece ? '1 0 auto' : '0 0 auto',
        minHeight: 0,
      }}
    >
      {soloUno ? (
        // Con un solo trabajo el título ya es el sujeto y la duración también:
        // repetirlos aquí sería ruido. Sólo queda lo que el sujeto no dice.
        <Origen trabajo={trabajo} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, width: '100%' }}>
          {trabajo.modalidades.length > 0 ? (
            <MarcaEstado estado={estado} modalidad={trabajo.modalidades[0]} />
          ) : null}
          <span
            style={{
              font: '600 15px/1.25 var(--twin-font-sans)',
              color: 'var(--twin-fg)',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {trabajo.titulo}
          </span>
          <Origen trabajo={trabajo} />
          {trabajo.modalidades.slice(1).map((m) => (
            <PuntoModalidad key={m} modalidad={m} size={7} />
          ))}
          <Duracion trabajo={trabajo} />
        </div>
      )}

      {bloques.map((bloque, i) => (
        <LineaBloque
          key={`${bloque.titulo}-${i}`}
          bloque={bloque}
          repiteTitulo={bloque.titulo === trabajo.titulo}
          mostrarFormato={!soloUno}
          holgado={soloUno}
        />
      ))}

      {trabajo.ref === null ? (
        <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }} />
      ) : null}
    </Fila>
  );
}

/**
 * UN bloque, UNA línea: su título, cuántos ejercicios y sus cifras de dosis.
 *
 * El calentamiento y la vuelta a la calma van apagados y sin cifras: son el
 * marco, no el trabajo (§6, regla 4). Lo que de verdad haces NO va en gris
 * (§10.6), así que el bloque de trabajo se queda el color, el peso y el alto.
 */
function LineaBloque({
  bloque,
  repiteTitulo,
  mostrarFormato,
  holgado,
}: {
  bloque: BloqueReal;
  repiteTitulo: boolean;
  mostrarFormato: boolean;
  holgado: boolean;
}) {
  if (!esTrabajo(bloque)) {
    return (
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{bloque.titulo}</span>
    );
  }

  const dosis = bloque.items
    .map((item) => ({ item, texto: dosisConSeries(item) }))
    .filter((d): d is { item: ItemReal; texto: string } => d.texto !== null);
  const sinCifra = bloque.items.length - dosis.length;
  const enFilas = holgado && dosis.length > 0 && dosis.length <= TOPE_FILAS;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SP.s,
        flex: dosis.length > 0 ? '1 0 auto' : '0 0 auto',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s, flex: '0 0 auto' }}>
        {repiteTitulo ? null : (
          <span style={{ font: '600 14px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)', flex: 1, minWidth: 0 }}>
            {bloque.titulo}
          </span>
        )}
        {mostrarFormato && bloque.formato ? (
          <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {bloque.formato}
          </span>
        ) : null}
        {/* Un ejercicio solo no se cuenta: su cifra viene justo debajo. */}
        {bloque.items.length > 1 ? (
          <span style={{ marginLeft: 'auto' }}>
            <Numeral tamano="s" sufijo="ejercicios" tamanoSufijo={12}>
              {bloque.items.length}
            </Numeral>
          </span>
        ) : null}
      </div>

      {enFilas ? <DosisEnFilas dosis={dosis} /> : <DosisEnParrilla dosis={dosis} />}

      {sinCifra > 0 ? (
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', flex: '0 0 auto' }}>
          {sinCifra === bloque.items.length ? 'sin cifras en el plan' : `${sinCifra} sin cifra`}
        </span>
      ) : null}
    </div>
  );
}

interface Dosis {
  item: ItemReal;
  texto: string;
}

/**
 * Pocas cifras: cada una es una fila, y el sobrante del bloque entra EN ellas.
 *
 * **La fila lleva el NOMBRE del ejercicio, y esto no es decoración.** Sin él, el
 * bloque «Recuperación Z2» del rodaje —Rowing, SkiErg, Assault Bike y Run, diez
 * minutos cada uno— sale como cuatro «10:00 · Z2» idénticos con un punto de
 * color, y el atleta no puede saber en qué máquina se sube. El punto de
 * modalidad distingue la FAMILIA, no el aparato: remo, ski y bici comparten
 * color de soporte. El dato que da sentido a la cifra es el nombre (§6.2), y lo
 * tenemos.
 *
 * Los nombres van en inglés porque así están en `exercises.name`. No se traducen
 * aquí: el hueco es del modelo de datos y taparlo en un mockup lo escondería de
 * quien tiene que decidir arreglarlo.
 */
function DosisEnFilas({ dosis }: { dosis: Dosis[] }) {
  if (dosis.length === 0) return null;
  // Con una o dos cifras la fila puede pagar el numeral grande; con más, baja un
  // escalón para que el nombre quepa entero en 390 sin recortarse.
  const tamano = dosis.length <= 2 ? 'm' : 's';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
      {dosis.map((d, i) => (
        <div
          key={`${d.item.nombre}-${i}`}
          style={{
            flex: '1 1 0',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            gap: SP.s,
            borderTop: i > 0 ? '1px solid var(--twin-hairline)' : undefined,
          }}
        >
          <PuntoModalidad modalidad={d.item.modalidad} size={7} />
          <span
            style={{
              font: '600 14px/1.25 var(--twin-font-sans)',
              color: 'var(--twin-fg)',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {d.item.nombre}
          </span>
          <Numeral tamano={tamano}>{d.texto}</Numeral>
          {d.item.objetivo ? (
            <span
              style={{
                font: '500 13px/1.2 var(--twin-font-sans)',
                color: 'var(--twin-muted)',
                flex: '0 0 auto',
              }}
            >
              {d.item.objetivo}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Muchas cifras: van en parrilla y EN ORDEN, que es media pregunta del día. El
 * sobrante se reparte entre sus líneas (`space-evenly`), nunca en una cola.
 *
 * El objetivo entra como sufijo del numeral, que es el sitio que el átomo tiene
 * para lo que acompaña a la cifra: «10:00 Z2», «50 m 152 kg».
 */
function DosisEnParrilla({ dosis }: { dosis: Dosis[] }) {
  if (dosis.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'space-evenly',
        gap: `${SP.s}px ${SP.m}px`,
        flex: '1 1 auto',
        minHeight: 0,
      }}
    >
      {dosis.map((d, i) => (
        <span key={`${d.item.nombre}-${i}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
          <PuntoModalidad modalidad={d.item.modalidad} size={6} />
          {/* También aquí manda el nombre: en la simulación HYROX hay NUEVE
              «1,00 km» seguidos, y sin la estación al lado la lista deja de
              decir por dónde vas. */}
          <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{d.item.nombre}</span>
          <Numeral tamano="s" sufijo={d.item.objetivo} tamanoSufijo={12}>
            {d.texto}
          </Numeral>
        </span>
      ))}
    </div>
  );
}

/** La voz del coach para la semana. El sistema no escribe aquí (§ agnóstico). */
export function VozDelCoach({ texto, visible }: { texto: string; visible: boolean }) {
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', gap: SP.m, alignItems: 'stretch', ...entradaStyle(visible, 220) }}>
      <span aria-hidden style={{ width: 2, borderRadius: 1, background: 'var(--twin-accent)', flex: '0 0 auto' }} />
      <span
        style={{
          font: '500 12px/1.35 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        <span style={{ color: 'var(--twin-faint)' }}>Esta semana · </span>
        {texto}
      </span>
    </div>
  );
}
