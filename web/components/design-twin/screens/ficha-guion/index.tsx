'use client';

// LA FICHA DE LA SESIÓN · A · LA HOJA — lo que se lee antes de empezar, como la
// pizarra del box: una página, de arriba abajo, una línea por movimiento.
//
// POR QUÉ OTRA FICHA. La de hoy apila una TARJETA por ejercicio (≈140 pt cada una,
// con su tabla y su botón de técnica) debajo de un sujeto de 244 pt: con cuatro
// movimientos ya no ves la sesión, ves tres. No hay jerarquía —todo pesa igual— y
// lo que importa (qué toca, qué dijo el coach, cuánto y con qué) no se distingue de
// lo que no. Esta propuesta parte de la pregunta contraria: ¿qué necesita saber
// quien sostiene el móvil con la barra delante?
//
//   1. QUÉ ES y cuánto lleva (título + una línea: minutos o por qué no hay, bloques,
//      movimientos). Sin póster: es un detalle, no una portada.
//   2. QUÉ QUIERE EL COACH: su nota, entera y con su firma, ANTES de la lista.
//   3. QUÉ PREPARA (el material) en una línea.
//   4. LA HOJA: los bloques en orden. Cada movimiento ocupa UNA línea de 64 pt con
//      la dosis y contra qué alineadas a la derecha; el formato (EMOM, AMRAP,
//      superserie…) se dice en la cabecera y organiza el bloque; el calentamiento y
//      la vuelta a la calma se pliegan en una línea. Lo que solo hace falta a veces
//      —las series una a una, las claves, el vídeo— está detrás de un toque.
//   5. «Empezar», anclado abajo, sin nada que lo tape.
//
// ESTÁNDAR DE MERCADO que sigue: la hoja de entrenamiento de Strong / Hevy /
// TrainingPeaks (nombre a la izquierda, dosis alineada a la derecha, series en el
// detalle) y la ficha de Nike Training Club (el formato dicho en la cabecera del
// grupo). Lo que NO copia: tarjetas de vídeo por fila; el vídeo es detalle.

import { Pantalla } from '../../kit-composicion/chrome';
import { Estilos } from '../../kit-dia/estilos';
import { CASOS, casoDeFicha } from '../../kit-ficha/casos';
import { materialDeFicha } from '../../kit-ficha/modelo';
import {
  CabeceraFicha,
  CromoFicha,
  Dock,
  EstilosFicha,
  LATERAL,
  Material,
  NotaDelCoach,
  SinDetalle,
  YaLoHice,
} from '../../kit-ficha/piezas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Hoja } from './bloques';

export const meta: TwinMeta = {
  id: 'ficha-guion',
  titulo: 'La ficha de la sesión · A · La hoja',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-10-02',
  descripcion:
    'Antes de empezar, como la pizarra del box: título y una línea, la nota del coach entera, el material y la hoja de bloques con UNA línea por movimiento (dosis y kilos alineados a la derecha). El formato se dice en la cabecera del bloque; calentamiento y vuelta a la calma se pliegan; las series una a una, las claves y el vídeo se abren con un toque. Dieciséis sesiones para romperla, cinco reales.',
  fuentes: [],
  enApp:
    'La ficha de hoy es PreWorkoutBriefView.swift (+ SesionPrevia/*): un sujeto de 244 pt y una tarjeta por ejercicio. Esta propuesta cambia la ORGANIZACIÓN y deja el dato como está: es la misma LecturaSesionPrevia con tres campos más (material por ejercicio, minutos de un bloque solo si se saben, el reparto de Dobles).',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const caso = casoDeFicha(escenario);
  const l = caso.lectura;
  const material = materialDeFicha(l);
  return (
    <div className="twin-screen-safe">
      <Estilos />
      <EstilosFicha />
      <Pantalla
        estrategia="llena"
        cabecera={<CromoFicha onLog={onLog} compartible={l.bloques.length > 0} />}
        accion={<Dock onLog={onLog} />}
      >
        <div style={{ padding: `4px ${LATERAL}px 32px`, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <CabeceraFicha l={l} />
          {l.nota ? <NotaDelCoach texto={l.nota} coach={l.coach} lineas={3} /> : null}
          {l.bloques.length === 0 ? <SinDetalle /> : <Hoja l={l} onLog={onLog} />}
          <Material cosas={material} />
          <YaLoHice onLog={onLog} prueba={l.prueba} />
        </div>
      </Pantalla>
    </div>
  );
}
