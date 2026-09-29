'use client';

// EL CARRIL — los siete días de la semana, de un vistazo (`CarrilSemana` + `ChipDia`).
//
// Es la MISMA semana que cuenta la card, vista de lejos: la inicial, el número,
// el sello de cómo fue y, debajo, las modalidades que mandan. Dos dimensiones
// distintas y por eso dos marcas distintas:
//   · HOY  → la inicial en naranja y un aro (nunca desaparece, aunque mires otro día)
//   · MIRADO (el día que enseña la card) → relleno del MISMO tono que la card de
//     debajo; la muesca de la card apunta a él.
//
// El sello dice CÓMO fue (forma y color de estado): disco con visto = hecha ·
// media luna ámbar = a medias · aro tachado gris = sin hacer (no en rojo: en siete
// días una alarma por cada día pasado grita, y el dato es «no quedó registrado») ·
// aro hueco = por hacer · raya = descanso. Los puntos dicen QUÉ tipo de trabajo.
//
// Gestos: tocar SELECCIONA el día (no abre nada); mantener pulsado saca sus
// acciones; deslizar cambia de semana. El menú también cuelga del «···» de la
// acción anclada, así que no hace falta la pulsación larga para llegar a él.

import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { SelloEstado } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, velo } from '../../kit-dia/tokens';
import type { DiaDelPlan } from '../../kit-plan/contrato';
import {
  inicialDeDia,
  modalidadesDelDia,
  nombreDeDia,
  numeroDelMes,
  resumenDeDia,
  type TonoPlan,
} from '../../kit-plan/modelo';
import { PuntoModalidad, TONOS_PLAN } from './shell';

/** Cuánto hay que mantener pulsado, en ms, para que salga el menú del día. */
const PULSACION_LARGA_MS = 480;
/** Cuánto hay que arrastrar en horizontal, en px, para que cuente como deslizar. */
const DESLIZAR_PX = 44;
/** Cuánto se puede mover el dedo sin que deje de ser una pulsación. */
const HOLGURA_PX = 10;

/** El alto real del chip (medido): el esqueleto lo repite para que nada salte al llegar los datos. */
const ALTO_CHIP = 99;

function SelloDia({ estado, mono }: { estado: DiaDelPlan['estado']; mono: boolean }) {
  if (estado === 'descanso') {
    return (
      <span style={{ height: 22, display: 'inline-flex', alignItems: 'center' }}>
        <span aria-hidden style={{ width: 14, height: 3, borderRadius: 2, background: mono ? 'currentColor' : 'var(--twin-hairline-strong)' }} />
      </span>
    );
  }
  return <SelloEstado estado={estado} tam={22} mono={mono} />;
}

function ChipDia({
  dia,
  hoyIso,
  mostrado,
  tono,
  onPulsar,
}: {
  dia: DiaDelPlan;
  hoyIso: string;
  mostrado: boolean;
  tono: TonoPlan;
  onPulsar: () => void;
}) {
  const t = TONOS_PLAN[tono];
  // Sobre el naranja sólido el estado va en la tinta: un verde o un gris no se leerían.
  const sobreNaranja = mostrado && tono === 'accion';
  // Hoy lleva la inicial en naranja SOLO cuando no es el día mirado: el relleno de un día
  // mirado ya es del tono de su card, y un naranja sobre ese tinte no llega a 4,5:1.
  const tintaLetra = sobreNaranja ? t.tinta : mostrado ? 'var(--twin-fg)' : dia.esHoy ? 'var(--twin-accent-text)' : 'var(--twin-muted)';
  const tintaNumero = sobreNaranja ? t.tinta : 'var(--twin-fg)';
  return (
    <button
      type="button"
      className="pl-chip"
      aria-pressed={mostrado}
      aria-current={dia.esHoy ? 'date' : undefined}
      aria-label={`${nombreDeDia(dia.diaSemana)} ${numeroDelMes(dia.iso)}${dia.esHoy ? ', hoy' : ''}, ${resumenDeDia(dia, hoyIso)}`}
      data-dia={dia.iso}
      onClick={onPulsar}
      style={{
        minHeight: ALTO_CHIP,
        padding: '10px 0 8px',
        gap: 3,
        boxSizing: 'border-box',
        borderRadius: RADIO.fila,
        background: mostrado ? t.fondo : 'transparent',
        boxShadow: mostrado
          ? `inset 0 0 0 1.5px ${tono === 'accion' ? 'transparent' : t.borde}`
          : dia.esHoy
            ? `inset 0 0 0 1.5px ${velo('var(--twin-accent-text)', 55)}`
            : 'none',
        color: tintaLetra,
      }}
    >
      <span style={{ ...fuente(700, TAM.suelo, 1.2), color: tintaLetra }}>{inicialDeDia(dia.diaSemana)}</span>
      <span style={{ ...fuente(dia.esHoy || mostrado ? 800 : 600, 20, 1.2), ...TABULAR, color: tintaNumero }}>{numeroDelMes(dia.iso)}</span>
      <span style={{ color: sobreNaranja ? t.tinta : undefined, display: 'inline-flex' }}>
        <SelloDia estado={dia.estado} mono={sobreNaranja} />
      </span>
      <span aria-hidden style={{ display: 'flex', gap: 4, height: 8, alignItems: 'center', color: sobreNaranja ? t.tinta : undefined }}>
        {modalidadesDelDia(dia).map((m) => (
          <PuntoModalidad key={m} modalidad={m} tam={7} mono={sobreNaranja} />
        ))}
      </span>
    </button>
  );
}

export function Carril({
  dias,
  hoyIso,
  mostradoIso,
  tono,
  onDia,
  onLargo,
  onDeslizar,
}: {
  dias: DiaDelPlan[];
  hoyIso: string;
  mostradoIso: string | null;
  tono: TonoPlan;
  onDia: (d: DiaDelPlan) => void;
  /** Pulsación larga (o botón secundario) sobre un día: sus acciones. */
  onLargo: (d: DiaDelPlan) => void;
  /** -1 = hacia atrás, 1 = hacia delante. */
  onDeslizar: (dir: -1 | 1) => void;
}) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lo que acaba de pasar con el dedo: si fue un gesto, el clic que sigue NO es una selección. */
  const gesto = useRef<'largo' | 'deslizo' | null>(null);

  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  const alBajar = (e: ReactPointerEvent<HTMLDivElement>) => {
    inicio.current = { x: e.clientX, y: e.clientY };
    gesto.current = null;
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-dia]');
    const iso = chip?.dataset.dia;
    const dia = dias.find((d) => d.iso === iso);
    limpiar();
    if (dia && dia.sesiones.length > 0) {
      temporizador.current = setTimeout(() => {
        gesto.current = 'largo';
        onLargo(dia);
      }, PULSACION_LARGA_MS);
    }
  };

  const alMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!inicio.current) return;
    if (Math.hypot(e.clientX - inicio.current.x, e.clientY - inicio.current.y) > HOLGURA_PX) limpiar();
  };

  const alSoltar = (e: ReactPointerEvent<HTMLDivElement>) => {
    limpiar();
    const p = inicio.current;
    inicio.current = null;
    if (!p || gesto.current === 'largo') return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > DESLIZAR_PX && Math.abs(dx) > Math.abs(dy)) {
      gesto.current = 'deslizo';
      onDeslizar(dx < 0 ? 1 : -1);
    }
  };

  const alCancelar = () => {
    limpiar();
    inicio.current = null;
  };

  // Un gesto no es una selección: se traga el clic que lo sigue.
  const alHacerClicCaptura = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (gesto.current) {
      e.stopPropagation();
      e.preventDefault();
      gesto.current = null;
    }
  };

  const alMenuContextual = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (gesto.current === 'largo') return;
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-dia]');
    const dia = dias.find((d) => d.iso === chip?.dataset.dia);
    if (dia && dia.sesiones.length > 0) {
      gesto.current = 'largo';
      onLargo(dia);
    }
  };

  return (
    <div
      role="group"
      aria-label="Los siete días de la semana"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alCancelar}
      onPointerLeave={alCancelar}
      onClickCapture={alHacerClicCaptura}
      onContextMenu={alMenuContextual}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {dias.map((dia) => (
        <ChipDia
          key={dia.iso}
          dia={dia}
          hoyIso={hoyIso}
          mostrado={dia.iso === mostradoIso}
          tono={tono}
          onPulsar={() => onDia(dia)}
        />
      ))}
    </div>
  );
}

/** La misma silueta con la que llegará el carril: nada salta al llegar los datos. */
export function CarrilEsqueleto() {
  return (
    <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
      {Array.from({ length: 7 }, (_, i) => (
        <Esqueleto key={i} alto={ALTO_CHIP} radio={RADIO.fila} />
      ))}
    </div>
  );
}
