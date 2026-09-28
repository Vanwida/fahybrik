'use client';

// LA FRANJA DE ACCIÓN (I5.8) — lo que se toca, en la zona del pulgar.
//
//   UNA acción primaria por estado, grande (64 pt) y naranja, con un
//   VOCABULARIO CERRADO (la auditoría del 28-09 encontró siete textos de
//   botón con colores sin regla). Pausa a su lado. Terminar = mantener
//   pulsado 1 s (Apple Fitness, Strava) con hoja de confirmación que dice
//   lo hecho. Nunca un botón que diga «Terminar» y cierre otra cosa.
//
//   AvisoDeshacer   5 s para deshacer un cierre a mano, sobre la franja,
//                   nunca sobre el sujeto.
//   HojaTerminar    «¿Terminar?» con lo hecho: Terminar y guardar · Seguir.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Paso } from '../kit-reloj/paso';
import { contextoDe, fmtDistancia, fmtReloj } from '../kit-reloj/reglas';
import type { EstadoSecuencia } from '../kit-reloj/secuencia';
import { Boton, BotonRedondo, Cuerpo, Etiqueta, Icono, useLienzo } from './piezas';
import { ALTO, CI, DESHACER_MS, DURACION, MARGEN, RADIO, TI } from './tokens';

// ---------------------------------------------------------------------------
// El vocabulario de la acción primaria (cerrado)
// ---------------------------------------------------------------------------

/**
 * Lo que puede decir el botón primario, y nada más. Cada etiqueta lleva su
 * peso: `primaria` (naranja: la acción del momento que el atleta espera) o
 * `secundaria` (superficie: cerrar antes de tiempo un paso que se cierra solo).
 */
export const VOCABULARIO_PRIMARIA = {
  'empezar ya': { texto: 'Empezar ya', peso: 'primaria' },
  empezar: { texto: 'Empezar', peso: 'primaria' },
  'serie hecha': { texto: 'Serie hecha', peso: 'primaria' },
  'estación hecha': { texto: 'Estación hecha', peso: 'primaria' },
  'siguiente estación': { texto: 'Siguiente estación', peso: 'primaria' },
  hecho: { texto: 'Hecho', peso: 'primaria' },
  'ronda hecha': { texto: '+1 ronda', peso: 'primaria' },
  confirmar: { texto: 'Confirmar', peso: 'primaria' },
  guardar: { texto: 'Guardar', peso: 'primaria' },
  empiezo: { texto: 'Empiezo', peso: 'primaria' },
  'salgo a correr': { texto: 'Salgo a correr', peso: 'primaria' },
  vuelta: { texto: 'Vuelta', peso: 'secundaria' },
  'siguiente paso': { texto: 'Siguiente paso', peso: 'secundaria' },
  'cerrar el tramo': { texto: 'Cerrar el tramo', peso: 'secundaria' },
  reanudar: { texto: 'Reanudar', peso: 'primaria' },
} as const;

export type ClavePrimaria = keyof typeof VOCABULARIO_PRIMARIA;

export interface PrimariaVista {
  clave: ClavePrimaria;
  hacer: () => void;
  /** Se puede ver pero no pulsar todavía, y por qué («sin GPS»). */
  desactivada?: string | null;
}

/** La etiqueta y el peso de una clave del vocabulario. Una clave fuera del vocabulario no compila. */
export function primariaDe(clave: ClavePrimaria): { texto: string; peso: 'primaria' | 'secundaria' } {
  return VOCABULARIO_PRIMARIA[clave];
}

/**
 * De la etiqueta en minúscula del kit de la muñeca («empezar ya», «Sled Push
 * hecho») a una clave del vocabulario. Lo que no es del vocabulario cae a
 * «siguiente paso»: en el móvil el botón no lleva el nombre de la estación
 * (lo lleva la cabecera).
 */
export function claveDesdeEtiqueta(etiqueta: string): ClavePrimaria {
  const k = etiqueta.toLowerCase();
  if (k in VOCABULARIO_PRIMARIA) return k as ClavePrimaria;
  if (k.endsWith(' hecha') || k.endsWith(' hecho')) return 'hecho';
  return 'siguiente paso';
}

// ---------------------------------------------------------------------------
// La franja
// ---------------------------------------------------------------------------

export interface FranjaAccionProps {
  primaria: PrimariaVista | null;
  pausado: boolean;
  onPausa: (pausar: boolean) => void;
  /** Se llama cuando el atleta MANTUVO Terminar 1 s: abre la hoja. */
  onTerminar: () => void;
  /** Para la cronología: «Terminar · soltado antes de 1 s». */
  onLog?: (linea: string) => void;
}

/**
 * [Pausa ●] [ Primaria ████████ ] [● Terminar]. La primaria pesa menos que el
 * sujeto (§10.5) pero se alcanza con el pulgar sudando: 64 pt de alto, de
 * borde a borde entre los dos redondos.
 */
export function FranjaAccion({ primaria, pausado, onPausa, onTerminar, onLog }: FranjaAccionProps) {
  const [manteniendo, setManteniendo] = useState(false);
  const [pista, setPista] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const soltar = (completado: boolean) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    if (!manteniendo) return;
    setManteniendo(false);
    if (!completado) {
      setPista(true);
      onLog?.('Terminar · soltado antes de 1 s — no cierra nada');
      setTimeout(() => setPista(false), 1400);
    }
  };
  const empezarHold = () => {
    setManteniendo(true);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      setManteniendo(false);
      onTerminar();
    }, DURACION.terminarMs);
  };
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const vista = primaria ? primariaDe(primaria.clave) : null;
  return (
    <div style={{ position: 'relative', flex: '0 0 auto', padding: `0 ${MARGEN}px ${ALTO.pieAccion}px`, boxSizing: 'border-box' }}>
      {pista ? (
        <span style={{ position: 'absolute', right: MARGEN, top: -22, fontSize: TI.etiqueta.cuerpo, fontWeight: 600, color: CI.tinta2, animation: 'iphone-aparece 120ms ease-out' }}>
          mantén 1 s para terminar
        </span>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: ALTO.accion }}>
        <BotonRedondo
          nombre={pausado ? 'Reanudar' : 'Pausa'}
          icono={<Icono nombre={pausado ? 'reanudar' : 'pausa'} talla={26} />}
          variante={pausado ? 'primaria' : 'superficie'}
          onPulsa={() => onPausa(!pausado)}
        />
        {vista && primaria ? (
          <Boton
            etiqueta={primaria.desactivada ? `${vista.texto} · ${primaria.desactivada}` : vista.texto}
            variante={vista.peso === 'primaria' ? 'primaria' : 'superficie'}
            desactivado={!!primaria.desactivada || pausado}
            onPulsa={primaria.hacer}
            estilo={{ flex: '1 1 auto', width: 'auto' }}
          />
        ) : (
          <span style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: ALTO.accion }}>
            <Etiqueta>{pausado ? 'en pausa' : 'manda el reloj'}</Etiqueta>
          </span>
        )}
        <BotonRedondo
          nombre="Terminar (mantener pulsado 1 s)"
          icono={<Icono nombre="terminar" talla={24} />}
          onPointerDown={empezarHold}
          onPointerUp={() => soltar(false)}
          onPointerLeave={() => soltar(false)}
        >
          {manteniendo ? <AnilloHold /> : null}
        </BotonRedondo>
      </div>
    </div>
  );
}

/** El anillo que se llena mientras se mantiene Terminar: 1 s, en tinta (no es acción hasta que se completa). */
function AnilloHold() {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={CI.tinta} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c} style={{ animation: `iphone-hold ${DURACION.terminarMs}ms linear forwards` }} />
      <style>{`@keyframes iphone-hold { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Deshacer
// ---------------------------------------------------------------------------

/** 5 s para deshacer un cierre a mano: una píldora sobre la franja, con su barra que se vacía. */
export function AvisoDeshacer({ aviso, onDeshacer }: { aviso: string; onDeshacer: () => void }) {
  return (
    <div style={{ position: 'absolute', left: MARGEN, right: MARGEN, bottom: `calc(var(--twin-safe-bottom) + ${ALTO.accion + ALTO.pieAccion + 10}px)`, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDeshacer();
        }}
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          overflow: 'hidden',
          height: TI.botonMenor.alto + 4,
          padding: '0 18px',
          border: 0,
          borderRadius: RADIO.boton,
          background: CI.superficie2,
          color: CI.tinta,
          fontFamily: 'inherit',
          fontSize: TI.botonMenor.cuerpo,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          animation: 'iphone-entra 200ms ease-out',
        }}
      >
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: CI.tinta2, transformOrigin: 'left', animation: `iphone-drena ${DESHACER_MS}ms linear forwards` }} />
        <span style={{ whiteSpace: 'nowrap' }}>{aviso}</span>
        <span style={{ color: CI.accion, fontWeight: 700, whiteSpace: 'nowrap' }}>Deshacer</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La hoja de terminar
// ---------------------------------------------------------------------------

export interface ResumenTerminar {
  titulo: string;
  lineas: string[];
}

/**
 * Lo hecho hasta aquí, para la hoja: la posición («Serie 3 de 6»), los km
 * corridos y de máquina, y el tiempo. Puro: del estado del motor.
 */
export function resumenParaTerminar(paso: Paso, e: EstadoSecuencia): ResumenTerminar {
  const pos = contextoDe(paso).slice(0, 2).join(' · ');
  const lineas: string[] = [];
  if (e.sesionM > 0) {
    const d = fmtDistancia(e.sesionM);
    lineas.push(`${d.valor} ${d.unidad} corridos`);
  }
  if (e.sesionErgoM > 0) {
    const d = fmtDistancia(e.sesionErgoM);
    lineas.push(`${d.valor} ${d.unidad} de máquina`);
  }
  lineas.push(`${fmtReloj(e.sesionT)} de sesión`);
  return { titulo: pos, lineas };
}

/** «¿Terminar?» — lo hecho, y dos salidas: Terminar y guardar (naranja) o Seguir. Nunca un tercer botón. */
export function HojaTerminar({ resumen, onTerminar, onSeguir }: { resumen: ResumenTerminar; onTerminar: () => void; onSeguir: () => void }) {
  const { horizontal } = useLienzo();
  return (
    <div style={{ position: 'absolute', inset: 0, background: CI.velo, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'iphone-aparece 160ms ease-out', zIndex: 5 }}>
      <div
        role="dialog"
        aria-label="Terminar el entreno"
        style={{
          width: horizontal ? 'min(520px, 100%)' : '100%',
          background: CI.superficie,
          borderRadius: `${RADIO.hoja}px ${RADIO.hoja}px ${horizontal ? RADIO.hoja : 0}px ${horizontal ? RADIO.hoja : 0}px`,
          padding: `18px ${MARGEN}px calc(var(--twin-safe-bottom) + 12px)`,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'iphone-sube 220ms cubic-bezier(.2,.8,.2,1)',
          marginBottom: horizontal ? 12 : 0,
        }}
      >
        <span aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: CI.carril, marginBottom: 4 }} />
        <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: TI.posicion.peso, color: CI.tinta, lineHeight: 1.15 }}>¿Terminar aquí?</span>
        <Cuerpo tono={CI.tinta2}>
          Llevas <span style={{ color: CI.tinta }}>{resumen.titulo}</span>
          {resumen.lineas.map((l) => (
            <span key={l}>
              {' · '}
              <span style={{ color: CI.tinta }}>{l}</span>
            </span>
          ))}
          . Lo hecho se guarda; lo que falta queda sin hacer.
        </Cuerpo>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <Boton etiqueta="Terminar y guardar" variante="primaria" onPulsa={onTerminar} />
          <Boton etiqueta="Seguir" variante="superficie" onPulsa={onSeguir} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pausa y terminado
// ---------------------------------------------------------------------------

/** El velo de la pausa: el vivo se atenúa (se sigue viendo dónde estabas) y «EN PAUSA» sobre el sujeto. */
export function VeloPausa() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span
        style={{
          marginTop: -80,
          fontSize: TI.posicion.cuerpo,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: CI.tinta,
          background: CI.velo,
          padding: '10px 18px',
          borderRadius: RADIO.chip,
          animation: 'iphone-aparece 160ms ease-out',
        }}
      >
        EN PAUSA
      </span>
    </div>
  );
}

/** La sesión acabó (sola o a mano): un instante antes de pasar al resumen. */
export function Terminado({ titulo, detalle, children }: { titulo: string; detalle: string; children?: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: CI.fondo, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: MARGEN, animation: 'iphone-aparece 200ms ease-out', zIndex: 6 }}>
      <span style={{ width: 64, height: 64, borderRadius: 32, background: CI.superficie2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icono nombre="check" talla={32} tono={CI.tinta} />
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: CI.tinta, textAlign: 'center', lineHeight: 1.1 }}>{titulo}</span>
      <Etiqueta>{detalle}</Etiqueta>
      {children}
    </div>
  );
}
