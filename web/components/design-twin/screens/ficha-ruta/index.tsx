'use client';

// LA FICHA DE LA SESIÓN · B · LA RUTA — primero el mapa, luego lo que te toca.
//
// POR QUÉ OTRA FICHA. Una sesión de verdad tiene PARTES (calentar, un bloque de
// fuerza, un metcon, soltar) y la primera pregunta de quien la abre no es «qué
// ejercicios hay» sino «¿de qué va, y en qué orden?». La de hoy responde con una
// pila de tarjetas donde todo pesa igual. Esta propuesta responde en dos pasos:
//
//   1. LA RUTA: un nodo por bloque, en orden, con lo que se sabe de cada uno
//      («5 estaciones», «12 min», «3 ejercicios»). Es el mapa y es el control: se
//      queda fija arriba al hacer scroll y un toque cambia de bloque.
//   2. EL BLOQUE: debajo solo se lee UNO, con la forma de su formato y el aire que
//      da no tener los demás delante: la tarjeta de fuerza con su miniatura, las
//      series una a una y los kilos que resuelve tu 1RM; el EMOM como una pista de
//      minutos que alternan; la simulación como un recorrido con la carrera entre
//      estación y estación; las series de pista como su forma.
//
// Arriba, igual que en la otra propuesta y por lo mismo: título y una línea, y la
// nota del coach entera. Abajo, «Empezar», anclado. Se abre en el primer bloque de
// TRABAJO (el calentamiento está a un toque, a la izquierda): lo que toca hoy.
//
// ESTÁNDAR DE MERCADO: el paso a paso de Garmin Connect y de Runna (la sesión como
// secuencia de partes), el «Circuit 1 / Circuit 2» de Nike Training Club (un grupo
// cada vez) y la ficha de salida de HYROX (el recorrido de estaciones). Cuesta un
// toque más que la hoja a cambio de que nunca haya más de un bloque en pantalla.
//
// Con UN solo bloque no hay ruta (no hay orden que enseñar): la ficha se lee directa.

import { useState } from 'react';
import { Pantalla } from '../../kit-composicion/chrome';
import { Estilos } from '../../kit-dia/estilos';
import { Pastilla } from '../../kit-dia/piezas';
import { CASOS, casoDeFicha } from '../../kit-ficha/casos';
import type { Bloque, Movimiento } from '../../kit-ficha/contrato';
import { esDeUnaPieza, etiquetaFormato } from '../../kit-ficha/modelo';
import {
  CabeceraFicha,
  CromoFicha,
  Dock,
  EstilosFicha,
  HojaTecnica,
  LATERAL,
  NotaDelCoach,
  SinDetalle,
  YaLoHice,
} from '../../kit-ficha/piezas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Panel } from './panel';
import { Ruta } from './ruta';

export const meta: TwinMeta = {
  id: 'ficha-ruta',
  titulo: 'La ficha de la sesión · B · La ruta',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-10-02',
  descripcion:
    'Antes de empezar, primero el mapa: un nodo por bloque, en orden y fijo arriba, y debajo solo UN bloque cada vez con la forma de su formato (la tarjeta de fuerza con las series una a una, el EMOM como pista de minutos, la simulación como recorrido de estaciones, las series de pista como su forma). Misma cabecera y misma nota del coach que la hoja. Dieciséis sesiones para romperla, cinco reales.',
  fuentes: [],
  enApp:
    'La ficha de hoy es PreWorkoutBriefView.swift (+ SesionPrevia/*): un sujeto de 244 pt y una tarjeta por ejercicio. Esta propuesta usa la misma LecturaSesionPrevia con los mismos tres campos nuevos que la hoja (material por ejercicio, minutos de un bloque solo si se saben, el reparto de Dobles) y añade el bloque elegido como estado de la pantalla.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

/** El bloque con el que se abre: el primero de TRABAJO; si no hay ninguno, el primero. */
function bloqueInicial(bloques: Bloque[]): string {
  return (bloques.find((b) => b.rol === 'principal') ?? bloques[0]).id;
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const caso = casoDeFicha(escenario);
  const l = caso.lectura;
  const [activo, setActivo] = useState<string>(l.bloques.length > 0 ? bloqueInicial(l.bloques) : '');
  const bloque = l.bloques.find((b) => b.id === activo) ?? l.bloques[0];
  const conRuta = !esDeUnaPieza(l);
  const [tecnica, setTecnica] = useState<Movimiento | null>(null);

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
          {bloque === undefined ? (
            <SinDetalle />
          ) : (
            <>
              {conRuta ? (
                <Ruta
                  bloques={l.bloques}
                  activo={bloque.id}
                  onElegir={(id) => {
                    setActivo(id);
                    onLog(`Ruta · ${l.bloques.find((b) => b.id === id)?.titulo ?? id}`);
                  }}
                />
              ) : null}
              <div key={bloque.id} className="fi-cambia" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <CabeceraDelBloque b={bloque} />
                <Panel
                  b={bloque}
                  unaPieza={!conRuta}
                  onAbrir={(m) => {
                    setTecnica(m);
                    onLog(`${m.nombre} · se abre la técnica`);
                  }}
                />
              </div>
            </>
          )}
          <YaLoHice onLog={onLog} prueba={l.prueba} />
        </div>
      </Pantalla>
      {tecnica ? <HojaTecnica m={tecnica} onCerrar={() => setTecnica(null)} /> : null}
    </div>
  );
}

/**
 * Lo único que el bloque dice de sí mismo encima de su contenido, y solo cuando el panel no lo dice ya: un reloj, una
 * pista de minutos o una pareja llevan su formato DENTRO, y repetirlo en una chapa es decir lo mismo dos veces. La
 * simulación sí la necesita («For Time · 8 estaciones»): lo que la define no está en ninguna de sus filas.
 */
function CabeceraDelBloque({ b }: { b: Bloque }) {
  if (b.formato.tipo !== 'estaciones') return null;
  const formato = etiquetaFormato(b);
  if (formato === null) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Pastilla fondo="var(--twin-surface-elevated)" tinta="var(--twin-fg)" borde="var(--twin-hairline-strong)">
        {formato}
      </Pastilla>
    </div>
  );
}
