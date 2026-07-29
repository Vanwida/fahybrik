'use client';

// La composición del día. El contrato del módulo (meta, escenarios) vive en
// `index.tsx` y las piezas que llevan el dibujo en `atoms.tsx`; aquí queda el
// layout y las lecturas que lo alimentan, que es lo que hay que poder juzgar de
// un vistazo.

import { useState, type ReactNode } from 'react';
import { SP } from '../../kit';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { useTimeline } from '../../sim';
import { Accion, Cromo, Cuerpo, Duracion, Lienzo, Sujeto, entradaStyle } from '../../plan/atoms';
import { escenarioPlan } from '../../plan/datos';
import {
  cuentaSesiones,
  minutosMedidos,
  plural,
  proximoDiaConTrabajo,
  ultimoDiaConTrabajo,
  type Dia,
  type Semana,
  type Trabajo,
} from '../../plan/modelo';
import { TrabajoDelDia, VozDelCoach, bloquesMudos, cifrasDe, pieDeTrabajo } from './atoms';

/**
 * Qué escenario del plan se abre y por qué día.
 *
 * `descanso` mira la MISMA semana real del atleta 67 por su sábado 18, que en
 * producción no tiene ni una asignación. No es un dato nuevo: es el día vacío de
 * un plan publicado, que es un estado distinto de «este atleta no tiene plan» y
 * que si no se abre por algún sitio no se puede juzgar (§5).
 */
interface Guion {
  base: string;
  dia?: number;
}

const GUIONES: Record<string, Guion> = {
  'alta-nueva': { base: 'alta-nueva' },
  descanso: { base: 'coach', dia: 5 },
  coach: { base: 'coach' },
  'sin-dosis': { base: 'sin-dosis' },
  'dia-lleno': { base: 'dia-lleno' },
  libre: { base: 'libre' },
};

export function Pantalla({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  const guion = Object.prototype.hasOwnProperty.call(GUIONES, escenario) ? GUIONES[escenario] : GUIONES['alta-nueva'];
  const { ciclo, semana, diaAbierto } = escenarioPlan(guion.base);
  const indice = guion.dia ?? diaAbierto;
  const dia = semana.dias[indice];

  const esHoy = indice === semana.indiceHoy;
  const esPasado = semana.indiceHoy >= 0 && indice < semana.indiceHoy;
  // Los contadores del día salen del canónico de la semana aplicado a un día
  // solo: dos maneras de contar lo mismo es como nacen dos verdades (§2).
  const { hechas, total } = cuentaSesiones({ ...semana, dias: [dia] });
  const medidoMin = minutosMedidos({ ...semana, dias: [dia] });
  const pendiente = dia.trabajos.find((t) => t.medidoMin === null) ?? null;

  const hayPlan = ciclo.tramos.length > 0;
  const semanaVacia = semana.dias.every((d) => d.trabajos.length === 0);
  const vacio: 'sin-plan' | 'descanso' | null = total > 0 ? null : semanaVacia ? 'sin-plan' : 'descanso';

  // Sólo puede crecer lo que tiene cifras que repartir. Un bloque mudo no se
  // estira sobre nada: eso es el aire que el §6.2 prohíbe en un Detalle.
  const puedeCrecer = dia.trabajos.some((t) => cifrasDe(t.ref) > 0);

  const [paso, setPaso] = useState(0);

  useTimeline([
    { at: 220, run: () => setPaso(1) },
    { at: 420, run: () => setPaso(2) },
    { at: 640, run: () => setPaso(3) },
    {
      at: 900,
      run: () => {
        setPaso(4);
        onLog(
          `${dia.nombre} ${dia.numero} · ${
            vacio ? 'nada en el plan' : `${plural(total, 'trabajo', 'trabajos')}, ${palabraDelDia(hechas, total, esPasado)}`
          }`,
        );
      },
    },
    {
      at: 1500,
      run: () => {
        if (vacio) return;
        onLog(
          pendiente
            ? `Queda por hacer: ${pendiente.titulo}`
            : `Día cerrado${medidoMin !== null ? ` · ${medidoMin} min medidos` : ''}`,
        );
      },
    },
    {
      at: 2100,
      run: () => {
        if (vacio) return;
        const mudos = dia.trabajos.reduce((n, t) => n + bloquesMudos(t.ref), 0);
        onLog(
          mudos > 0
            ? `${plural(mudos, 'bloque', 'bloques')} sin cifras en el plan — se dice, no se rellena`
            : `${plural(
                dia.trabajos.reduce((n, t) => n + cifrasDe(t.ref), 0),
                'cifra de dosis',
                'cifras de dosis',
              )} en el día`,
        );
      },
    },
  ]);

  const sujeto = sujetoDelDia({ dia, pendiente, total, medidoMin, esHoy });

  return (
    <Lienzo
      accion={
        vacio ? undefined : pendiente ? (
          <Accion
            titulo="Empezar"
            principal
            visible={paso >= 4}
            onTap={() => onLog(`Empezar → abriría la ficha de ${pendiente.titulo}`)}
          />
        ) : (
          <Accion
            titulo="Ver cómo fue"
            visible={paso >= 4}
            onTap={() => onLog('Ver cómo fue → abriría el resumen del día')}
          />
        )
      }
    >
      <Cromo
        izquierda={cromoDelDia(dia, semana)}
        derecha={vacio === 'sin-plan' ? undefined : palabraDelDia(hechas, total, esPasado)}
        visible={paso >= 1}
      />

      {vacio ? (
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...entradaStyle(paso >= 2, 90),
          }}
        >
          {vacio === 'sin-plan' ? (
            <SinPlan hayPlan={hayPlan} onLog={onLog} />
          ) : (
            <Descanso semana={semana} dia={dia} indice={indice} onLog={onLog} />
          )}
        </div>
      ) : (
        <>
          <Sujeto {...sujeto} visible={paso >= 2} />
          <Cuerpo style={entradaStyle(paso >= 3, 150)}>
            <div
              className="twin-scroll"
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: SP.s,
                // `llena` degrada a `centra` cuando no hay ninguna cifra que
                // absorba el sobrante (§6.1): mejor centrado que con cola.
                justifyContent: puedeCrecer ? undefined : 'center',
              }}
            >
              {dia.trabajos.map((trabajo, i) => (
                <TrabajoDelDia
                  key={`${trabajo.titulo}-${i}`}
                  dia={dia}
                  trabajo={trabajo}
                  indice={indice}
                  indiceHoy={semana.indiceHoy}
                  soloUno={total === 1}
                  esSujeto={trabajo === pendiente}
                  onLog={onLog}
                />
              ))}
            </div>
            {semana.intencion ? <VozDelCoach texto={semana.intencion} visible={paso >= 4} /> : null}
          </Cuerpo>
        </>
      )}
    </Lienzo>
  );
}

// ---------------------------------------------------------------------------
// El día, en palabras — el estado de UN día no es el de UNA sesión
// ---------------------------------------------------------------------------

/**
 * `ETIQUETA_ESTADO` describe UNA sesión («hecha», «saltada»), y por eso no vale
 * aquí: en el martes 28 hay cinco trabajos con cuatro hechos, y decir «hecha»
 * sería mentir. El día tiene su propia palabra, y va en masculino porque su
 * sujeto es «el día».
 */
function palabraDelDia(hechas: number, total: number, esPasado: boolean): string {
  if (total === 0) return 'descanso';
  if (hechas === total) return 'todo hecho';
  if (hechas > 0) return 'a medias';
  return esPasado ? 'sin hacer' : 'por hacer';
}

/** Dónde estás: el día y, si la semana cae dentro de un tramo, cuál (§ agnóstico). */
/** Los títulos de un día cerrado, sin convertirse en una lista: caben dos. */
function titulosDelDia(trabajos: Trabajo[]): string {
  if (trabajos.length <= 2) return trabajos.map((t) => t.titulo).join(' y ');
  return `${trabajos[0].titulo} y ${plural(trabajos.length - 1, 'trabajo más', 'trabajos más')}`;
}

/**
 * El sujeto se adapta a lo que el día ES (§6, regla 1):
 *
 *   · Queda trabajo por hacer → ese trabajo, con su duración y su formato.
 *   · El día está cerrado     → lo que HICISTE: el título si fue uno, y el total
 *                               medido si fueron varios.
 */
function sujetoDelDia({
  dia,
  pendiente,
  total,
  medidoMin,
  esHoy,
}: {
  dia: Dia;
  pendiente: Trabajo | null;
  total: number;
  medidoMin: number | null;
  esHoy: boolean;
}): { eyebrow?: string; titulo: string; cifra?: ReactNode; pie?: string } {
  const posicion = pendiente ? dia.trabajos.indexOf(pendiente) + 1 : 0;
  const cuenta = total > 1 && pendiente ? `${posicion} de ${total}` : undefined;
  const eyebrow = esHoy ? (cuenta ? `Hoy · ${cuenta}` : 'Hoy') : cuenta;

  if (pendiente) {
    return { eyebrow, titulo: pendiente.titulo, cifra: <Duracion trabajo={pendiente} />, pie: pieDeTrabajo(pendiente) };
  }
  if (total === 1) {
    const unico = dia.trabajos[0];
    return { eyebrow, titulo: unico.titulo, cifra: <Duracion trabajo={unico} />, pie: pieDeTrabajo(unico) };
  }
  return {
    eyebrow,
    titulo: 'Día hecho',
    // El total del día es una MEDIDA sumada, nunca una previsión: por eso entra
    // en el mismo átomo con `previstoMin` en nulo.
    cifra: <Duracion trabajo={{ medidoMin, previstoMin: null }} />,
    pie: titulosDelDia(dia.trabajos),
  };
}

// ---------------------------------------------------------------------------
// Los dos vacíos — y los dos llevan salida (§5)
// ---------------------------------------------------------------------------

/** Sin plan publicado. Lo que SÍ está en su mano es montarse un entreno. */
function SinPlan({ hayPlan, onLog }: { hayPlan: boolean; onLog: (linea: string) => void }) {
  return (
    <EstadoCentrado
      titulo={hayPlan ? 'No hay nada publicado' : 'Aún no tienes plan'}
      cuerpo={
        hayPlan
          ? 'Tu plan anterior se cerró y el siguiente todavía no está. Mientras llega, puedes montarte un entreno tú.'
          : 'Tu coach aún no ha publicado ninguna semana. Mientras llega, puedes montarte un entreno tú.'
      }
      salida={{
        tipo: 'accion',
        texto: 'Montar un entreno',
        onTap: () => onLog('Montar un entreno → abriría el entreno libre'),
        nota: 'El plan lo publica tu coach.',
      }}
    />
  );
}

/**
 * Día vacío dentro de un plan publicado. No se fabrica ninguna sesión: se dice
 * qué hay antes y qué hay después, que es lo que da sentido al hueco.
 */
function Descanso({
  semana,
  dia,
  indice,
  onLog,
}: {
  semana: Semana;
  dia: Dia;
  indice: number;
  onLog: (linea: string) => void;
}) {
  const antes = ultimoDiaConTrabajo(semana, indice);
  const despues = proximoDiaConTrabajo(semana, indice + 1);
  // Sin tiempo verbal a propósito: en esta semana el domingo ya está ejecutado,
  // así que decir «toca» sería falso. Se nombra el día y lo que hay, y ya.
  const vecinos = [
    antes ? `El ${antes.dia.nombre}, ${antes.dia.trabajos[0].titulo}.` : null,
    despues ? `El ${despues.dia.nombre}, ${despues.dia.trabajos[0].titulo}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <EstadoCentrado
      titulo="Descansas"
      cuerpo={`Nada en el plan para el ${dia.nombre}. ${vecinos}`.trim()}
      salida={{
        tipo: 'accion',
        texto: 'Ver la semana',
        onTap: () => onLog('Ver la semana → volvería a la semana entera'),
      }}
    />
  );
}

function cromoDelDia(dia: Dia, semana: Semana): string {
  const donde = semana.enTramo ? ` · ${semana.enTramo.nombre} semana ${semana.enTramo.semana}` : '';
  return `${dia.nombre} ${dia.numero}${donde}`;
}

/** El estado de UN trabajo: el canónico del día aplicado a ese trabajo solo. */
