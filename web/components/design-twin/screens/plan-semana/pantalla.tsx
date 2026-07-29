'use client';

// La composición de la semana.
//
// ---------------------------------------------------------------------------
// LA PREGUNTA Y LA JERARQUÍA QUE SALE DE ELLA
// ---------------------------------------------------------------------------
//
// «¿Qué me toca hoy y qué llevo?». En ese orden se lee, pero NO en ese orden se
// pinta: lo primero que entra por los ojos es el estado del conjunto (es una
// Lista, §6.2, y su sujeto es el conjunto y su estado), y lo de hoy es la fila
// que más pesa dentro de la lista de siete. Así una sola mirada contesta las
// dos mitades sin tener que elegir entre ellas.
//
//   Cromo    → dónde cae la semana dentro del plan (etiqueta del coach).
//   Sujeto   → la voz del coach para la semana + EL CONTADOR + lo ya medido.
//   Reparto  → «¿esta semana es de correr o de hierro?», en sesiones.
//   Cuerpo   → los SIETE días, con hoy acentuado. Aquí vive «qué me toca hoy».
//   Acción   → abrir el día; principal solo si hoy queda algo por hacer (§10.5).
//
// ---------------------------------------------------------------------------
// POR QUÉ LA CABECERA NO LIDERA CON UN TOTAL DE HORAS PREVISTAS
// ---------------------------------------------------------------------------
//
// Porque sería fabricado. De las ocho sesiones de la semana real del atleta 67
// solo TRES traen dosis suficiente para estimar cuánto duran (`plan/datos.ts`);
// las otras cinco o no llevan medida o son `for_time`, donde la duración ES el
// resultado. Un «3,5 h previstas» arriba sería la suma de tres octavos vendida
// como el total de la semana.
//
// Así que el sujeto lidera con lo que sí son hechos: el CONTADOR de sesiones
// —que se pinta aunque valga cero (§6.2 bis)— y los minutos ya MEDIDOS, que
// solo aparecen cuando existen. Las estimaciones bajan a las filas, una a una y
// siempre marcadas con «unos», que es donde el atleta puede leerlas sin
// confundirlas con lo que hizo.
//
// ---------------------------------------------------------------------------
// ALTURA (§6.1): `llena` + scroll, y degrada a `centra`
// ---------------------------------------------------------------------------
//
// Los siete días se reparten TODO el sobrante: cada fila crece, ninguna cola
// debajo. Un día con cinco trabajos (pasa: el martes 28 del atleta 64) crece con
// ellos y, si la semana entera desborda, scrollea desde arriba en vez de
// encogerse. Cuando la semana no tiene ni un trabajo, la Lista **es** un Vacío y
// se pinta como tal: centrado y con salida obligatoria.

import { useState } from 'react';
import { Label, SP } from '../../kit';
import { EstadoCentrado, type SalidaVacio } from '../../kit-composicion/estados';
import {
  Accion,
  Cromo,
  Cuerpo,
  Duracion,
  ETIQUETA_ESTADO,
  Fila,
  Lienzo,
  MarcaEstado,
  NOMBRE_MODALIDAD,
  Numeral,
  Origen,
  PuntoModalidad,
  Reparto,
  Sujeto,
  entradaStyle,
} from '../../plan/atoms';
import { escenarioPlan } from '../../plan/datos';
import type { Ciclo, Dia, EstadoDia, Semana, Trabajo } from '../../plan/modelo';
import {
  cuentaSesiones,
  estadoDia,
  horas,
  minutosMedidos,
  plural,
  proximoDiaConTrabajo,
  repartoSemana,
  ultimoDiaConTrabajo,
} from '../../plan/modelo';
import { useTimeline } from '../../sim';

// ---------------------------------------------------------------------------
// Medidas de la lista — el reparto del sobrante entre las siete filas (§6.1)
// ---------------------------------------------------------------------------
//
// `flex-shrink: 0` a propósito en las tres: si la semana desborda, las filas
// mantienen su alto y el cuerpo scrollea. Encogerlas para que quepan sería
// aplastar el contenido justo en la semana que más tiene.
const FILA = {
  /** Un día con trabajo. */
  normal: { peso: 1, alto: 52 },
  /** Hoy pesa casi el doble: es la mitad de la pregunta que trae al atleta. */
  hoy: { peso: 1.7, alto: 56 },
  /** El descanso es un hueco DECLARADO, no una fila que falta — pero pesa menos. */
  descanso: { peso: 0.5, alto: 40 },
} as const;

/** Ancho de la columna del día. Fijo para que los siete numerales alineen. */
const ANCHO_DIA = 58;

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const [entrada, setEntrada] = useState(false);
  const { ciclo, semana } = escenarioPlan(escenario);

  const cuenta = cuentaSesiones(semana);
  const medidos = minutosMedidos(semana);
  const reparto = repartoSemana(semana);
  const estados = semana.dias.map((d, i) => estadoDia(d, i, semana.indiceHoy));
  const hoy = semana.indiceHoy >= 0 ? semana.dias[semana.indiceHoy] : null;

  // La Lista sin elementos ES un Vacío (§6.2): se decide aquí arriba, no
  // pintando una lista de siete filas huecas con el encabezado colgando.
  const vacia = cuenta.total === 0;

  useTimeline([
    { at: 240, run: () => setEntrada(true) },
    { at: 820, run: () => onLog(`0:00 · ${dondeCae(semana, ciclo)}`) },
    {
      at: 1280,
      run: () =>
        onLog(
          vacia
            ? '0:01 · Ni una sesión esta semana. La Lista se pinta como Vacío'
            : `0:01 · ${cuenta.hechas} de ${plural(cuenta.total, 'sesión hecha', 'sesiones hechas')}` +
              `${medidos !== null ? `, ${loMedido(medidos)}` : ''}`,
        ),
    },
    {
      at: 1760,
      run: () => {
        if (reparto.length === 0) return;
        onLog(`0:01 · Reparto: ${reparto.map((r) => `${NOMBRE_MODALIDAD[r.modalidad]} ${r.sesiones}`).join(' · ')}`);
      },
    },
    {
      at: 2280,
      run: () => {
        if (!hoy) return;
        const estado = estados[semana.indiceHoy];
        onLog(
          estado === 'descanso'
            ? `0:02 · Hoy ${hoy.nombre} ${hoy.numero}: descanso`
            : `0:02 · Hoy ${hoy.nombre} ${hoy.numero}: ${hoy.trabajos.map((t) => t.titulo).join(' + ')}, ${ETIQUETA_ESTADO[estado]}`,
        );
      },
    },
  ]);

  if (vacia) return <SemanaVacia ciclo={ciclo} semana={semana} visible={entrada} onLog={onLog} />;

  const accion = accionDeLaSemana(semana, estados);

  return (
    <Lienzo
      accion={
        <Accion
          titulo={accion.titulo}
          principal={accion.principal}
          visible={entrada}
          onTap={() => onLog(`${accion.titulo} → abriría ${accion.destino}`)}
        />
      }
    >
      <Cromo izquierda={dondeCae(semana, ciclo)} visible={entrada} />

      <Sujeto
        // La voz del coach cuando la hay (`program_week_templates.focus`), y si
        // no la hay NO se rellena: el sistema no escribe por el coach (§7). En
        // su lugar va un titular que solo describe el estado del contador.
        titulo={semana.intencion ?? tituloDelEstado(cuenta.hechas, cuenta.total)}
        // El contador manda, y se pinta aunque valga cero (§6.2 bis).
        cifra={
          <Numeral tamano="m" sufijo={`de ${cuenta.total}`}>
            {cuenta.hechas}
          </Numeral>
        }
        // Lo MEDIDO, y solo si existe: una medida del pasado existe o no existe,
        // nunca vale cero (`minutosMedidos` devuelve null, no 0).
        pie={medidos !== null ? `${loMedido(medidos)} esta semana` : undefined}
        visible={entrada}
      />

      <div style={{ flex: '0 0 auto', ...entradaStyle(entrada, 150) }}>
        <Reparto reparto={reparto} total={cuenta.total} />
      </div>

      <Cuerpo
        style={{
          // `llena` + scroll: si los siete días desbordan, se scrollea desde
          // arriba. `scrollbarWidth` para que en el mockup no aparezca una barra
          // que en el teléfono no existe.
          overflowY: 'auto',
          scrollbarWidth: 'none',
          ...entradaStyle(entrada, 210),
        }}
      >
        {semana.dias.map((dia, i) => (
          <FilaDia
            key={i}
            dia={dia}
            estado={estados[i]}
            esHoy={i === semana.indiceHoy}
            onTap={() => onLog(etiquetaDia(dia, estados[i], i === semana.indiceHoy))}
          />
        ))}
      </Cuerpo>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// La fila de un día
// ---------------------------------------------------------------------------

function FilaDia({
  dia,
  estado,
  esHoy,
  onTap,
}: {
  dia: Dia;
  estado: EstadoDia;
  esHoy: boolean;
  onTap: () => void;
}) {
  const medida = estado === 'descanso' ? FILA.descanso : esHoy ? FILA.hoy : FILA.normal;
  // La marca del día toma el color de la modalidad que abre el día; no se
  // inventa una modalidad para el conjunto (el mismo criterio del carril de
  // `plan-bloque`). En un descanso el color no se usa.
  const modalidad = dia.trabajos[0]?.modalidades[0] ?? 'run';

  return (
    <Fila
      acento={esHoy}
      onTap={onTap}
      etiqueta={etiquetaDia(dia, estado, esHoy)}
      style={{ flex: `${medida.peso} 0 auto`, minHeight: medida.alto, alignItems: 'center' }}
    >
      <span
        style={{
          width: ANCHO_DIA,
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 5,
        }}
      >
        {/* Hoy dice «HOY», no su inicial: es la respuesta a media pregunta y no
            se puede tardar en encontrarla. */}
        <Label size={10} color={esHoy ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}>
          {esHoy ? 'Hoy' : dia.inicial}
        </Label>
        <Numeral
          tamano="s"
          color={
            esHoy ? 'var(--twin-accent-text)' : estado === 'descanso' ? 'var(--twin-faint)' : 'var(--twin-fg)'
          }
        >
          {dia.numero}
        </Numeral>
      </span>

      <MarcaEstado estado={estado} modalidad={modalidad} />

      {estado === 'descanso' ? (
        <span style={{ flex: 1, minWidth: 0 }}>
          <Label size={10} color="var(--twin-faint)">
            {ETIQUETA_ESTADO.descanso}
          </Label>
        </span>
      ) : (
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {dia.trabajos.map((t, i) => (
            <LineaTrabajo key={i} trabajo={t} saltada={estado === 'saltada'} grande={esHoy} />
          ))}
        </span>
      )}
    </Fila>
  );
}

/**
 * Una unidad de trabajo dentro de su día.
 *
 * El entreno libre NO es un anexo: en producción 9 de las 11 asignaciones del
 * atleta 64 son suyas. Va con el mismo peso que lo del coach y lo distingue
 * `Origen`, que además marca los tests.
 */
function LineaTrabajo({ trabajo, saltada, grande }: { trabajo: Trabajo; saltada: boolean; grande: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: SP.s, minWidth: 0 }}>
      <span
        style={{
          // Hoy sube un escalón: dentro de la lista, su fila es la que se lee
          // primero. El resto de días comparten voz para que la lista no baile.
          font: `600 ${grande ? 16 : 14}px/1.25 var(--twin-font-sans)`,
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
      {/* La marca de saltada va en palabras además de en el aro tachado: es el
          único estado que se lee igual que «pendiente» si solo miras el aro. */}
      {saltada ? (
        <Label size={9} color="var(--twin-muted)">
          {ETIQUETA_ESTADO.saltada}
        </Label>
      ) : null}
      <span style={{ display: 'inline-flex', gap: 3, flex: '0 0 auto' }}>
        {trabajo.modalidades.map((m, i) => (
          <PuntoModalidad key={i} modalidad={m} size={6} />
        ))}
      </span>
      <Origen trabajo={trabajo} />
      {/* Medido / previsto / nada lo decide el átomo, en un solo sitio. */}
      <Duracion trabajo={trabajo} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// El Vacío — dos semanas igual de vacías con salidas distintas
// ---------------------------------------------------------------------------

/**
 * La semana sin nada.
 *
 * Los dos escenarios vacíos se distinguen POR EL DATO, no por el id: lo que
 * cambia es si el atleta tiene de dónde venir. `ciclo.tramos` vacío = nunca
 * hubo plan (atleta recién dado de alta). `ciclo.tramos` con contenido y
 * `indiceActual = -1` = lo hubo y se acabó, y entonces el vacío **puede decir
 * qué acabó** y ofrecer volver a ello. Que esos dos vacíos no se lean igual es
 * la prueba de que el vacío está hecho.
 */
function SemanaVacia({
  ciclo,
  semana,
  visible,
  onLog,
}: {
  ciclo: Ciclo;
  semana: Semana;
  visible: boolean;
  onLog: (linea: string) => void;
}) {
  const terminado = ciclo.tramos.length > 0 && ciclo.indiceActual < 0 ? ciclo.tramos[ciclo.tramos.length - 1] : null;

  // La salida es obligatoria (§5) y aquí es doble en los dos casos: hay algo que
  // el atleta puede hacer AHORA (montarse el entreno) y algo que no está en su
  // mano, que se declara en vez de callarse.
  const salida: SalidaVacio = {
    tipo: 'accion',
    texto: 'Montar un entreno',
    onTap: () => onLog('Montar un entreno → abriría el entreno libre'),
    // Solo cuando hay historia: sin plan anterior no hay nada detrás que abrir.
    secundaria: terminado
      ? {
          texto: `Ver ${terminado.nombre}`,
          onTap: () => onLog(`Ver ${terminado.nombre} → abriría el microciclo que acabó`),
        }
      : undefined,
    nota: terminado ? 'La siguiente la publica tu coach.' : 'Tu primera semana la publica tu coach.',
  };

  return (
    <Lienzo>
      <Cromo izquierda={dondeCae(semana, ciclo)} visible={visible} />
      {/* `centra` (§6.1): el aire es simétrico arriba y abajo, no una cola. */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...entradaStyle(visible, 90),
        }}
      >
        <EstadoCentrado
          titulo={terminado ? `Terminaste ${terminado.nombre}` : 'Aún no hay plan'}
          cuerpo={
            terminado
              ? 'Fue tu última semana con plan y todavía no hay otra publicada.'
              : 'Tu coach todavía no ha publicado ninguna semana.'
          }
          salida={salida}
        />
      </div>
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// Lecturas de la pantalla
// ---------------------------------------------------------------------------

/**
 * La línea de arriba: dónde cae esta semana.
 *
 * AGNÓSTICO (§ del modelo): el nombre sale de `semana.enTramo.nombre`, que es
 * `program_month_templates.name` tal cual lo escribió el coach. Aquí no hay
 * catálogo de fases, ni «ATR», ni ningún nombre cableado — la migración 0064
 * borró la entidad «fase» y con ella cualquier excusa para inventar una.
 */
function dondeCae(semana: Semana, ciclo: Ciclo): string {
  if (semana.enTramo) return `${semana.enTramo.nombre} · semana ${semana.enTramo.semana} de ${semana.enTramo.de}`;
  const ultimo = ciclo.tramos.length > 0 && ciclo.indiceActual < 0 ? ciclo.tramos[ciclo.tramos.length - 1] : null;
  return ultimo ? `${ultimo.nombre} · terminado` : 'Sin plan publicado';
}

/**
 * El titular cuando el coach no escribió nada. Describe el CONTADOR y nada más:
 * suplantar su voz con una frase de entrenador inventada es justo lo que el §7
 * prohíbe, y `intencion: null` significa exactamente «no escribió».
 */
function tituloDelEstado(hechas: number, total: number): string {
  if (hechas === 0) return 'Semana por delante';
  if (hechas >= total) return 'Semana cerrada';
  return 'Semana en marcha';
}

/**
 * Los minutos ya medidos, en la voz en la que se dicen.
 *
 * `horas()` es el canónico de la semana y se usa en cuanto hay una hora. Por
 * debajo se dice en minutos, que es la misma grafía que ya pinta `Duracion`
 * («48 min»): un «0,8 h» de la semana del atleta 64 —cuyas seis sesiones libres
 * suman 48 minutos— no lo lee nadie del box a la primera (§3).
 */
function loMedido(minutos: number): string {
  return minutos >= 60 ? `${horas(minutos)} h hechas` : `${minutos} min hechos`;
}

/**
 * La acción de abajo.
 *
 * Solo es principal cuando hoy queda algo por hacer: entonces la acción del
 * atleta ES ir a entrenar, y el §10.5 la deja competir. En cualquier otro caso
 * es navegación y va de contorno, sin pelearse con el sujeto.
 *
 * Y cuando hoy no hay nada, no se queda muda: lleva al día que sí lo tiene —el
 * siguiente si queda alguno, y si no el último que hubo—, que es lo que hacen
 * `proximoDiaConTrabajo` y `ultimoDiaConTrabajo` del modelo.
 */
function accionDeLaSemana(
  semana: Semana,
  estados: EstadoDia[],
): { titulo: string; principal: boolean; destino: string } {
  const i = semana.indiceHoy;
  const hoy = i >= 0 ? semana.dias[i] : null;

  if (hoy && hoy.trabajos.length > 0) {
    const pendiente = estados[i] === 'pendiente';
    return {
      titulo: pendiente ? 'Ver lo de hoy' : 'Ver el día',
      principal: pendiente,
      destino: hoy.trabajos.map((t) => t.titulo).join(' + '),
    };
  }

  const siguiente = proximoDiaConTrabajo(semana, i + 1);
  const anterior = siguiente ?? ultimoDiaConTrabajo(semana, Math.max(0, i));
  if (anterior) {
    return {
      titulo: `Ver el ${anterior.dia.nombre}`,
      principal: false,
      destino: anterior.dia.trabajos.map((t) => t.titulo).join(' + '),
    };
  }
  return { titulo: 'Ver el plan', principal: false, destino: 'el ciclo entero' };
}

/** Lo que un lector de pantalla lee de una fila. El mismo texto va al registro. */
function etiquetaDia(dia: Dia, estado: EstadoDia, esHoy: boolean): string {
  const cuando = `${esHoy ? 'hoy, ' : ''}${dia.nombre} ${dia.numero}`;
  if (estado === 'descanso') return `${cuando}: descanso, nada en el plan`;
  const partes = dia.trabajos.map((t) => {
    const marca = t.esTest ? ' (test)' : t.origen === 'libre' ? ' (tuyo)' : '';
    const tiempo =
      t.medidoMin !== null
        ? `, ${t.medidoMin} min`
        : t.previstoMin !== null
          ? `, unos ${t.previstoMin} min`
          : '';
    return `${t.titulo}${marca}${tiempo}`;
  });
  return `${cuando}, ${ETIQUETA_ESTADO[estado]}: ${partes.join('; ')}`;
}
