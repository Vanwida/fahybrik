'use client';

// LA CAMPANA DEL AMRAP (P12) — la puntuación se dice con la corona, y SOLO
// aquí (Alex, 25-09): durante el AMRAP el doble toque es «ronda hecha» y las
// reps de la ronda a medias esperan a la campana. La misma cara en un AMRAP
// suelto (reloj-wod) y en uno dentro de un chipper (reloj-circuito, 506).
//
//   rondas + reps   «7 + 18»: las rondas (contadas en vivo) en tinta; el «+»
//                   y las reps en tinta2 hasta que se dicen. Sin declarar es
//                   «—», nunca 0.
//   un movimiento   las reps totales, con el nombre del movimiento encima.
//   en un chipper   el reloj no para: «Luego · Run en 0:18».
//
// La corona la enfoca la pantalla (`VistaVivo.corona`) con `girarDial`.

import { Centro } from './apoyos';
import type { LineaVista } from './lamina';
import { lineaPulso } from './lamina';
import type { Lecturas, Paso, ZonasCoach } from './paso';
import { Columna } from './pasos';
import { ContextoLinea, Heroe, Linea, Nota, PistaAccion, useCabe, useFilaAccion } from './piezas';
import { faltaDe, fmtReloj, textoPasoCorto } from './reglas';
import { desgloseReps, type Dial } from './tarea';
import { ANCHO_HEROE, ANCHO_PIE, C, FILA, T, altoHeroe, tallaHeroe } from './tokens';

type NombreFila = keyof typeof FILA;

/**
 * «7 + 18»: las rondas (contadas en vivo) en tinta; el «+» y las reps en
 * tinta2 hasta que se dicen. El tamaño, el del héroe del kit (`tallaHeroe`).
 */
function HeroePuntuacion({ rondas, reps, altoMax }: { rondas: number; reps: number | null; altoMax: number }) {
  const texto = `${rondas} + ${reps ?? '—'}`;
  // Tres piezas y dos huecos: 20 pt de aire para que no toque el bisel.
  const talla = tallaHeroe(texto, undefined, ANCHO_HEROE - 20, altoMax - FILA.etiquetaHeroe);
  const cifra = { fontSize: talla.cuerpo, fontWeight: T.heroe.peso, lineHeight: T.heroe.caja, fontVariantNumeric: 'tabular-nums' as const };
  // El cinturón del kit: si el navegador no tiene SF y se pasa de ancho, escala.
  const ref = useCabe<HTMLSpanElement>();
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2, lineHeight: `${FILA.etiquetaHeroe}px` }}>rondas + reps</span>
      <span ref={ref} style={{ whiteSpace: 'nowrap', display: 'inline-block', transformOrigin: 'center' }}>
        <span style={{ ...cifra, color: C.tinta }}>{rondas}</span>
        <span style={{ ...cifra, color: C.tinta2 }}>{' + '}</span>
        <span style={{ ...cifra, color: reps == null ? C.tinta2 : C.tinta }}>{reps ?? '—'}</span>
      </span>
    </div>
  );
}

/** LA PUNTUACIÓN, en la campana: se dice con la corona y se guarda con la acción del momento. */
export function CaraPuntuacion({ paso, lecturas, zonas, dial }: { paso: Paso; lecturas: Lecturas; zonas: ZonasCoach | null; dial: Dial }) {
  const fila = useFilaAccion();
  const w = paso.wod;
  if (w?.formato !== 'puntuacion') return null;
  // La campana es «deja de trabajar»: monocroma, como Recupera (P6).
  const pulso: LineaVista = { ...lineaPulso(paso, lecturas, zonas), zona: undefined };
  const multi = w.tareas.length > 1;
  const reps = dial.reps == null ? '—' : String(dial.reps);
  // En un chipper el reloj sigue: lo que viene, y cuándo.
  const falta = faltaDe(paso, lecturas);
  const tras = paso.siguiente?.rol === 'trabajo' ? paso.siguiente : null;
  const luego = falta != null && tras ? textoPasoCorto(tras) : null;

  const lineas: string[] = [];
  if (multi) lineas.push(dial.reps == null || dial.reps === 0 ? `reps de la ronda ${dial.rondas + 1}` : desgloseReps(w.tareas, dial.reps));
  lineas.push(dial.reps == null ? 'gira la corona' : 'sin guardar');

  const filas: NombreFila[] = ['contexto', ...lineas.map(() => 'nota' as const)];
  if (luego) filas.push('nota');
  filas.push(fila, 'tercero');
  // Lo que falta por decir va en tinta2: «7 + —» no puede leerse como un número.
  const pendiente = dial.reps == null;
  return (
    <Columna>
      <ContextoLinea partes={['Puntuación', `AMRAP ${w.duracionS / 60}′`]} />
      <Centro>
        {multi ? (
          <HeroePuntuacion rondas={dial.rondas} reps={dial.reps} altoMax={altoHeroe(filas)} />
        ) : (
          <Heroe
            heroe={{ clase: 'crono', texto: reps, unidad: 'reps', etiqueta: w.tareas[0]!.nombre }}
            altoMax={altoHeroe(filas)}
            tono={pendiente ? C.tinta2 : C.tinta}
          />
        )}
      </Centro>
      {lineas.map((x, k) => (
        <Nota key={k} tono={k === 0 && multi && dial.reps ? C.tinta : C.tinta2}>
          {x}
        </Nota>
      ))}
      {luego && falta != null ? (
        <Nota tono={C.tinta} prefijo="Luego ·">
          {`${luego.split(' · ')[0]} en ${fmtReloj(Math.ceil(falta))}`}
        </Nota>
      ) : null}
      <PistaAccion accion="guardar" />
      <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}
