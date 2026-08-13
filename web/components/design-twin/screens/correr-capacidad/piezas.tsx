'use client';

// Las piezas propias de Capacidad — la franja de zona, la tarjeta de récord y
// la fila del predictor. El resto de la voz (Bloque, Cifra, Delta, Marca,
// Apagado, Plazo, CurvaEsfuerzos) se importa de `analiticas-correr`, que ya la
// fijó mirando `lectura-carrera` (mismo `zona: 'Marcas y tests'`, cero cajas,
// etiqueta versalita, mono tabular): reescribirla aquí sería la misma
// duplicación que el §2 del CONTRATO-UI prohíbe para un formateador.

import type { ReactNode } from 'react';
import { Hairline } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { distancia, haceCuanto, reloj, ritmoKm } from '../../kit-composicion/formato';
import { BENCHMARK_UNIT_SECONDS } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { esRecord, type DistanciaPredicha, type RegistroMarca, type ResultadoMarca } from './datos';
import { Delta } from '../analiticas-correr/piezas';
import type { ZonaRitmo } from '@fahybrid/shared/domain/running/progress';

// ---------------------------------------------------------------------------
// LAS ZONAS DE RITMO — el color es dato: `zona.color` es la fila del catálogo
// del coach (`shared/domain/methodology/zones.ts`), nunca un `--twin-z*`. Ese
// token es del reparto por PULSO (`BarraReparto`/`Ambiente`, 5 bandas); esto
// es un modelo de RITMO de 6 bandas por offset — dos sistemas de color
// distintos porque miden dos cosas distintas, y confundirlos apagaría una
// lectura por el test que no era.
// ---------------------------------------------------------------------------

export function FilaZona({ zona, onTap }: { zona: ZonaRitmo; onTap?: () => void }) {
  // Defensivo: el tipo compartido admite `fast_s: null`, aunque el resolutor
  // real (`resolveZonesForAthlete`) nunca lo deja así — solo la banda LENTA
  // (Z1) puede quedar abierta.
  if (zona.fast_s == null) return null;
  const rango =
    zona.slow_s == null
      ? `${ritmoKm(Math.round(zona.fast_s))} o más lento`
      : `${ritmoKm(Math.round(zona.fast_s))}–${ritmoKm(Math.round(zona.slow_s))}`;

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        width: '100%',
        minHeight: 42,
        padding: `${S.s}px 0`,
      }}
    >
      <span aria-hidden style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: zona.color, flex: '0 0 auto' }} />
      <span style={{ flex: 1, minWidth: 0, font: '650 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {zona.code} · {zona.label}
      </span>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 700,
          fontSize: 12.5,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {rango}
      </span>
    </button>
  );
}

export function ListaZonas({ zonas, onTapZona }: { zonas: ZonaRitmo[]; onTapZona: (numero: number) => void }) {
  if (zonas.length === 0) return null;
  const ordenadas = [...zonas].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {ordenadas.map((z, i) => (
        <div key={z.code}>
          {i > 0 && <Hairline />}
          <FilaZona zona={z} onTap={() => onTapZona(Number(z.code.replace(/\D/g, '')) || i + 1)} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOS RÉCORDS — catálogo cerrado (`./datos.ts::CATALOGO_RUNNING`). Calle y
// cinta se enseñan SIEMPRE los dos cuando la marca los soporta (1 km, Cooper,
// 5 km): el hueco se dice con palabras («Sin marca»), nunca con un guion —
// exactamente el patrón ya construido en `screens/marks/detail.tsx::
// ContextTile`, que esta pantalla no reescribe distinto porque es la misma
// regla (§6.2 bis del CONTRATO-UI) aplicada al mismo dato.
// ---------------------------------------------------------------------------

function valorMarca(unidad: string, r: ResultadoMarca): string {
  return unidad === BENCHMARK_UNIT_SECONDS ? reloj(r.valor) : distancia(r.valor);
}

function Estrella() {
  return (
    <span role="img" aria-label="récord del último mes" style={{ color: 'var(--twin-accent-text)', fontSize: 13, lineHeight: 1 }}>
      ★
    </span>
  );
}

function MiniMarca({ titulo, resultado, unidad }: { titulo: string; resultado: ResultadoMarca | null; unidad: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
        {titulo}
      </span>
      {resultado ? (
        <>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--twin-font-mono)',
              fontWeight: 800,
              fontSize: 18,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-fg)',
            }}
          >
            {valorMarca(unidad, resultado)}
            {esRecord(resultado.haceDias) && <Estrella />}
          </span>
          <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{haceCuanto(resultado.haceDias)}</span>
        </>
      ) : (
        <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>Sin marca</span>
      )}
    </div>
  );
}

export function TarjetaRecord({ registro }: { registro: RegistroMarca }) {
  const { spec, aire, cinta } = registro;
  if (!aire && !cinta) return null; // el catálogo entero, pero solo se pinta lo que hay
  const soportaContexto = spec.measured_by === 'run';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
      <span style={{ font: '650 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{spec.label}</span>
      {soportaContexto ? (
        <div style={{ display: 'flex', gap: S.l }}>
          <MiniMarca titulo="Aire libre" resultado={aire} unidad={spec.unit} />
          <MiniMarca titulo="En cinta" resultado={cinta} unidad={spec.unit} />
        </div>
      ) : (
        aire && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--twin-font-mono)',
                fontWeight: 800,
                fontSize: 20,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--twin-fg)',
              }}
            >
              {valorMarca(spec.unit, aire)}
            </span>
            {esRecord(aire.haceDias) && <Estrella />}
            <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{haceCuanto(aire.haceDias)}</span>
          </span>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL PREDICTOR — «lo que te da hoy», con la tendencia contra hace 4 semanas
// pegada al número. El mismo `Delta` que ya pinta variaciones en Capacidad y
// en `analiticas-correr`, con la MISMA convención de esa familia: la
// diferencia se cuenta en segundos, se mida lo que se mida (`DeltaEsfuerzos`).
// ---------------------------------------------------------------------------

export function FilaPredictor({ prediccion }: { prediccion: DistanciaPredicha }) {
  const { etiqueta, segundos, segundosHace4Semanas } = prediccion;
  const mejor = segundosHace4Semanas != null ? segundos < segundosHace4Semanas : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.m, padding: `${S.s}px 0`, minHeight: 40 }}>
      <span style={{ flex: 1, font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{etiqueta}</span>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          fontSize: 18,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {reloj(segundos)}
      </span>
      {segundosHace4Semanas != null && (
        <Delta mejor={mejor} valor={`${Math.abs(segundos - segundosHace4Semanas)} s`} ventana="4 sem" />
      )}
    </div>
  );
}

/** Fila muda cuando el bloque no tiene nada que enseñar — una frase, sin caja. */
export function Nota({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, font: '500 13px/1.5 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{children}</p>;
}
