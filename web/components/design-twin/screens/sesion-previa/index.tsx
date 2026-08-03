'use client';

// La ficha de la sesión — lo que el atleta ve ANTES de empezar.
//
// Responde tres preguntas en este orden, que es el orden en que se hacen: qué
// voy a hacer, por qué me lo manda el coach, y cómo se hace cada cosa. El
// «cómo» es el vídeo: una miniatura por ejercicio, dibujada (`siluetas.tsx`),
// que abre el detalle encima sin sacarte de la sesión.
//
// Composición (§6.1, `llena`): el contenido es dato-dependiente y va de 1 ítem
// —9 de cada 11 asignaciones del atleta 64— a los 23 de la simulación HYROX.
// Con uno, el vídeo se hace grande y ES el sujeto; con veintitrés, las filas se
// cierran, el calentamiento y la vuelta a la calma se pliegan, y aparece el
// scroll. «Empezar» no se mueve nunca: vive abajo, fuera del scroll, y sigue
// visible incluso con el detalle abierto.

import { useState } from 'react';
import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  HYROX,
  dosisConSeries,
  reloj,
  totalItems,
  type BloqueReal,
  type ItemReal,
  type SesionReal,
} from '../../datos-reales';
import { haceCuanto } from '../../kit-composicion/formato';
import { CTA, Card, Display, Label, SP } from '../../kit';
import { useTimeline } from '../../sim';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import {
  Aparece,
  AvisoSinDosis,
  CabeceraBloque,
  Carril,
  FilaItem,
  Material,
  TarjetaItem,
  TiraEstructural,
} from './atoms';
import { fichaSesionDe, materialDe, palabraMovimientos, type FichaSesion } from './data';
import { DetalleEjercicio } from './detalle';

export const meta: TwinMeta = {
  id: 'sesion-previa',
  titulo: 'La ficha de la sesión, con el vídeo',
  zona: 'Plan y hoy',
  estado: 'construida',
  actualizado: '2026-07-29',
  descripcion:
    'Lo que ves antes de empezar: qué toca, por qué te lo manda el coach y cómo se hace cada movimiento. Un vídeo por ejercicio y «Empezar» siempre abajo.',
  fuentes: [
    'ios/FAHYBRIK/Workout/PreWorkoutBriefView.swift',
    'ios/FAHYBRIK/Plan/SessionExercisesSheet.swift',
    'ios/FAHYBRIK/Plan/ExerciseDetailView.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'coach-completa',
    titulo: 'Simulación HYROX · 23 movimientos',
    descripcion: 'El caso que desborda: 16 estaciones seguidas. El calentamiento y la vuelta a la calma se pliegan.',
  },
  {
    id: 'detalle',
    titulo: 'El detalle del Back Squat',
    descripcion: 'Se abre solo a los dos segundos: el gesto, las claves de Pablo y lo que levantaste la última vez.',
  },
  {
    id: 'huecos',
    titulo: 'Circuito de pierna · cuatro sin dosis',
    descripcion: 'El plan real con cuatro movimientos que el coach dejó sin cuánto. Se pintan con el nombre solo.',
  },
];

interface Guion {
  sesion: SesionReal;
  /** Ejercicio que el guion abre solo, para ver entrar el detalle. */
  abrir?: string;
}

const GUIONES: Record<string, Guion> = {
  'coach-completa': { sesion: HYROX },
  detalle: { sesion: BACK_SQUAT, abrir: 'Back Squat' },
  huecos: { sesion: CIRCUITO_PIERNA },
};

function guionDe(id: string): Guion {
  return Object.prototype.hasOwnProperty.call(GUIONES, id) ? GUIONES[id] : GUIONES['coach-completa'];
}

/** Con más de doce movimientos lo estructural estorba y se pliega (§6, regla 4). */
const TOPE_PLEGADO = 12;
/** Hasta tres movimientos no hay lista que hacer: el vídeo se queda el sobrante. */
const TOPE_HOLGADO = 3;

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const guion = guionDe(escenario);
  const { sesion } = guion;
  const ficha = fichaSesionDe(sesion.procedencia);
  const movimientos = totalItems(sesion);
  const holgada = movimientos <= TOPE_HOLGADO;
  const plegable = movimientos > TOPE_PLEGADO;

  const material = materialDe(sesion.bloques.flatMap((bloque) => bloque.items));

  const [paso, setPaso] = useState(0);
  const [detalle, setDetalle] = useState<ItemReal | null>(null);
  const [desplegados, setDesplegados] = useState<string[]>([]);

  useTimeline([
    { at: 0, run: () => setPaso(1) },
    { at: 180, run: () => setPaso(2) },
    { at: 340, run: () => setPaso(3) },
    { at: 500, run: () => setPaso(4) },
    {
      at: 760,
      run: () => onLog(`Ficha lista · ${movimientos} movimientos en ${sesion.bloques.length} bloques`),
    },
    {
      at: 2000,
      run: () => {
        if (!guion.abrir) return;
        const item = buscar(sesion, guion.abrir);
        if (!item) return;
        setDetalle(item);
        onLog(`${item.nombre} · se abre el detalle`);
      },
    },
  ]);

  const abrir = (item: ItemReal) => {
    setDetalle(item);
    onLog(`${item.nombre} · se abre el detalle`);
  };

  const alternar = (titulo: string) => {
    const abierto = desplegados.includes(titulo);
    setDesplegados((previos) => (abierto ? previos.filter((t) => t !== titulo) : [...previos, titulo]));
    onLog(`${titulo} · ${abierto ? 'se pliega' : 'se despliega'}`);
  };

  return (
    <div className="twin-screen-safe">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
          <div
            className="twin-scroll"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              // Con un solo movimiento la ficha no llega al alto ni con el vídeo
              // grande y las claves: entonces se CENTRA en vez de dejar la cola
              // muerta debajo (§6.1). `safe` la devuelve arriba si crece.
              justifyContent: holgada ? 'safe center' : 'flex-start',
              gap: SP.xl,
              padding: `${SP.l}px ${SP.l}px ${SP.xxl}px`,
            }}
          >
            <Aparece visible={paso >= 1}>
              <Cabecera sesion={sesion} ficha={ficha} movimientos={movimientos} />
            </Aparece>

            {ficha.porque && (
              <Aparece visible={paso >= 2}>
                <Porque porque={ficha.porque} coach={ficha.coach} />
              </Aparece>
            )}

            {/* Sin material que traer, la sección entera desaparece: un envoltorio
                vacío deja dos huecos de columna y ninguna verdad. */}
            {material.length > 0 && (
              <Aparece visible={paso >= 3}>
                <Material cosas={material} />
              </Aparece>
            )}

            <Aparece
              visible={paso >= 4}
              style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}
            >
              {sesion.bloques.map((bloque, i) => (
                <Bloque
                  key={bloque.titulo}
                  bloque={bloque}
                  numero={i + 1}
                  total={sesion.bloques.length}
                  holgada={holgada}
                  plegable={plegable}
                  desplegado={desplegados.includes(bloque.titulo)}
                  coach={ficha.coach}
                  onAlternar={() => alternar(bloque.titulo)}
                  onAbrir={abrir}
                />
              ))}
            </Aparece>
          </div>

          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 26,
              pointerEvents: 'none',
              background: 'linear-gradient(to top, var(--twin-bg), transparent)',
            }}
          />

          {detalle && (
            <DetalleEjercicio
              item={detalle}
              onVolver={() => {
                onLog(`${detalle.nombre} · vuelve a la ficha`);
                setDetalle(null);
              }}
            />
          )}
        </div>

        <div style={{ flex: '0 0 auto', padding: `${SP.m}px ${SP.l}px ${SP.l}px` }}>
          <CTA title="Empezar" onClick={() => onLog('EMPEZAR · arrancaría la sesión')} />
        </div>
      </div>
    </div>
  );
}

function buscar(sesion: SesionReal, nombre: string): ItemReal | null {
  for (const bloque of sesion.bloques) {
    const encontrado = bloque.items.find((item) => item.nombre === nombre);
    if (encontrado) return encontrado;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cabecera — qué es, de quién viene y cuánto pesa
// ---------------------------------------------------------------------------

function Cabecera({
  sesion,
  ficha,
  movimientos,
}: {
  sesion: SesionReal;
  ficha: FichaSesion;
  movimientos: number;
}) {
  const origen = sesion.origen === 'coach' ? `Plan de ${ficha.coach ?? 'tu coach'}` : 'Entreno libre';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <span
        style={{
          alignSelf: 'flex-start',
          padding: '5px 10px',
          borderRadius: 9999,
          background: 'color-mix(in srgb, var(--twin-accent) 15%, transparent)',
          color: 'var(--twin-accent-text)',
          font: '600 10px/1 var(--twin-font-sans)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {origen}
      </span>

      <Display size={30}>{sesion.titulo}</Display>

      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: SP.s }}>
        {/* La duración la declara el coach al montar la plantilla: va marcada
            como aproximada, que es lo que es. Lo medido llega abajo. */}
        {ficha.duracionMin !== undefined && <Dato valor={String(ficha.duracionMin)} unidad="min aprox." />}
        {ficha.duracionMin !== undefined && <Separador />}
        {sesion.bloques.length > 1 && <Dato valor={String(sesion.bloques.length)} unidad="bloques" />}
        {sesion.bloques.length > 1 && <Separador />}
        <Dato valor={String(movimientos)} unidad={palabraMovimientos(movimientos)} />
      </div>

      {ficha.ultima && (
        <p style={{ margin: 0, font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {ficha.ultima.fcMediaPpm !== null
            ? `La última vez tardaste ${reloj(ficha.ultima.duracionS)} a ${ficha.ultima.fcMediaPpm} ppm de media, ${haceCuanto(ficha.ultima.haceDias)}.`
            : `La última vez tardaste ${reloj(ficha.ultima.duracionS)}, ${haceCuanto(ficha.ultima.haceDias)}.`}
        </p>
      )}
    </div>
  );
}

function Dato({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span
        style={{
          font: '700 16px/1 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {valor}
      </span>
      <span style={{ font: '500 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>
    </span>
  );
}

function Separador() {
  return <span style={{ color: 'var(--twin-faint)', font: '500 12px/1 var(--twin-font-sans)' }}>·</span>;
}

function Porque({ porque, coach }: { porque: string; coach?: string }) {
  return (
    <Card leftAccent padding={SP.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
        <Label size={10}>El porqué</Label>
        <p style={{ margin: 0, font: '400 15px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {porque}
        </p>
        {coach && (
          <span style={{ font: '600 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{coach}</span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// El bloque — lo principal manda, lo estructural se distingue y se pliega
// ---------------------------------------------------------------------------

interface BloqueProps {
  bloque: BloqueReal;
  numero: number;
  total: number;
  holgada: boolean;
  plegable: boolean;
  desplegado: boolean;
  coach?: string;
  onAlternar: () => void;
  onAbrir: (item: ItemReal) => void;
}

function Bloque({ bloque, numero, total, holgada, plegable, desplegado, coach, onAlternar, onAbrir }: BloqueProps) {
  if (bloque.estructural) {
    const abierto = !plegable || desplegado;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
        {plegable ? (
          <TiraEstructural bloque={bloque} abierto={desplegado} onAlternar={onAlternar} />
        ) : (
          <Label size={10}>{bloque.titulo}</Label>
        )}
        {abierto && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--twin-hairline)',
              background: 'var(--twin-surface)',
              padding: `2px ${SP.m}px`,
            }}
          >
            {bloque.items.map((item, i) => (
              <FilaItem key={`${item.nombre}-${i}`} item={item} estructural onAbrir={onAbrir} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const sinDosis = bloque.items.filter((item) => dosisConSeries(item) === null).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <CabeceraBloque bloque={bloque} numero={numero} total={total} />
      <Carril items={bloque.items} />
      {holgada
        ? bloque.items.map((item, i) => (
            <TarjetaItem key={`${item.nombre}-${i}`} item={item} onAbrir={onAbrir} />
          ))
        : bloque.items.map((item, i) => (
            <FilaItem key={`${item.nombre}-${i}`} item={item} numero={i + 1} onAbrir={onAbrir} />
          ))}
      <AvisoSinDosis cuantos={sinDosis} coach={coach} />
    </div>
  );
}
