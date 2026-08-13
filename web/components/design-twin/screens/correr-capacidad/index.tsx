'use client';

// CAPACIDAD — el umbral y sus zonas, la velocidad crítica, los récords y lo
// que te da hoy. Nivel 1 del mapa v2 de Analíticas de correr
// (docs/analiticas-running-mapa.md, sección CAPACIDAD): vista empujada desde
// el hub, arquetipo Detalle, estrategia llena.
//
// EL SUJETO ES EL UMBRAL — «el número del que sale todo lo demás» (progress.ts,
// cabecera de `UmbralRitmo`): las zonas de ritmo cuelgan de él, la velocidad
// crítica lo confirma por otro camino (puerta 8 de `ajustarVelocidadCritica`,
// la cordura contra el umbral) y el predictor sale del mismo VDOT. Por eso va
// primero y más grande, y por eso el ÚNICO CTA de la pantalla —«Hacer el test
// de zonas»— vive pegado a él: es lo único que, al faltar, apaga el resto en
// cascada (§6.2 bis del CONTRATO-UI).
//
// LA VOZ ES LA DE `analiticas-correr` — MISMA zona ('Marcas y tests'), mismo
// acabado estudiado contra `lectura-carrera`: cero cajas, cero rayas
// divisorias, etiqueta versalita diminuta como único separador, cifras mono
// tabulares, el naranja reservado a la acción. `Bloque`, `Cifra`, `Delta`,
// `Marca`, `Apagado`, `Plazo` y `CurvaEsfuerzos` se IMPORTAN de ahí — no se
// reescriben — porque §0 del CONTRATO-UI manda usar el sitio compartido antes
// de crear un segundo. Las piezas nuevas de verdad (la franja de zona de
// ritmo, la tarjeta de récord, la fila del predictor) viven en `./piezas.tsx`.
//
// COLOR: la zona de ritmo pinta con `zona.color` (dato del catálogo del coach,
// `shared/domain/methodology/zones.ts`) — un sistema de 6 bandas por offset,
// DISTINTO del `--twin-z1..z5` de pulso que usan `Ambiente`/`BarraReparto` en
// el resto de la app. No se tocan ni se mezclan: miden cosas distintas.

import { useEffect } from 'react';
import { Hairline, NavBar, Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { haceCuanto, ritmoKm } from '../../kit-composicion/formato';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Apagado, CurvaEsfuerzos, Marca, Plazo } from '../analiticas-correr/graficos';
import { Bloque, Boton, Cifra } from '../analiticas-correr/piezas';
import { CTA_TEST_ZONAS, ESCENAS, type CapacidadAtleta } from './datos';
import { FilaPredictor, ListaZonas, Nota, TarjetaRecord } from './piezas';

export const meta: TwinMeta = {
  id: 'correr-capacidad',
  titulo: 'Capacidad — umbral, récords y lo que te da',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'El umbral de ritmo y sus zonas, la velocidad crítica con su depósito, los seis récords del catálogo cerrado (calle y cinta por separado) y el predictor 5 k/10 k/21 k/42 k con tendencia. El test de zonas aterriza aquí, solo cuando falta.',
  fuentes: [],
  enApp:
    'Umbral+zonas y velocidad crítica+D\' ya se CALCULAN en el servidor (running-progress.ts::loadPaceThreshold, shared/domain/analytics/capacidad.ts) pero ninguna pantalla los pinta hoy: analiticas-correr los declara y los deja vacíos a propósito («vuelven de la pestaña anterior»). Los récords solo llegan a 1/3/5 km (running/best-efforts.ts); el catálogo cerrado de 6 marcas (1 km · Cooper 12 min · 5 km · 10 km · media · maratón) ya vive en «Tus marcas» pero no se ve agregado aquí. El predictor 5k/10k/21k/42k no existe en ningún sitio — esta pantalla lo deriva del mismo VDOT que ya usa la proyección de HYROX. El CTA de tests hoy abre la batería entera desde el arranque de Analíticas; aquí se recoloca y aterriza en su test.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: propuesta pura sin vista «hoy» que alternar (el umbral
  // no tiene pantalla propia hoy). Arquetipo detalle, estrategia llena.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'completo',
    titulo: '① Completo · umbral de test',
    descripcion:
      'Umbral de un 5 km real (19:12, hace 9 días), seis zonas por offset, velocidad crítica ajustada sobre cuatro esfuerzos máximos, seis récords calle y tres cinta, predictor con tendencia y la curva con la mancha de mejora.',
  },
  {
    id: 'sin-ancla',
    titulo: '② Sin ancla · el único naranja',
    descripcion:
      'El umbral es el que puso el alta, sin confirmar — «Estimado — sin test», con sus zonas igual de estimadas. Sin una sola marca registrada: ni velocidad crítica (le faltan los tres esfuerzos, y se ve el plazo) ni predictor («con un test de umbral te lo digo»). El botón «Hacer el test de zonas» es el único color de marca en toda la pantalla.',
  },
  {
    id: 'recien-batido',
    titulo: '③ Recién batido · récord de esta semana',
    descripcion:
      'El mismo atleta de ①, cuatro semanas después: un 5 km de hace 3 días (18:47, con ★) aprieta el umbral, y el predictor entero mejora contra la línea de base de hace un mes — sin tocar un número a mano, el mismo VDOT que sostiene ① es ahora «hace 4 semanas».',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const c: CapacidadAtleta = ESCENAS[escenario] ?? ESCENAS.completo!;
  const sinTestReal = c.umbral == null || c.umbral.sin_revisar;

  useEffect(() => {
    onLog(
      c.umbral?.ritmo_s_km != null
        ? `Umbral ${ritmoKm(c.umbral.ritmo_s_km)}${c.umbral.sin_revisar ? ' · estimado' : ''}`
        : 'Sin umbral',
    );
    onLog(c.cs.ok ? `CS ${ritmoKm(Math.round(1000 / c.cs.cs_m_s))} · D' ${Math.round(c.cs.d_prima_m)} m` : `CS sin ajuste · ${c.cs.razon.por}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escenario]);

  return (
    <div className="twin-screen-safe">
      <Pantalla
        estrategia="llena"
        cabecera={<NavBar titulo="Capacidad" atras />}
        accion={sinTestReal ? <Boton onClick={() => onLog('→ test de zonas de correr')}>{CTA_TEST_ZONAS}</Boton> : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
          <BloqueUmbral c={c} onTapZona={(n) => onLog(`→ zona ${n}`)} />
          <BloqueVelocidadCritica c={c} />
          <BloqueRecords c={c} />
          <BloquePredictor c={c} />
          <BloqueCurva c={c} />
        </div>
      </Pantalla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UMBRAL — el sujeto. Cifra grande, procedencia en línea fina, zonas debajo.
// ---------------------------------------------------------------------------

function BloqueUmbral({ c, onTapZona }: { c: CapacidadAtleta; onTapZona: (numero: number) => void }) {
  if (c.umbral?.ritmo_s_km == null) {
    return (
      <Bloque etiqueta="Umbral">
        <Apagado alto={96} />
      </Bloque>
    );
  }
  const procedencia = c.umbral.sin_revisar
    ? 'Estimado — sin test'
    : `Del test · ${c.procedenciaHaceDias != null ? haceCuanto(c.procedenciaHaceDias) : 'fecha no registrada'}`;

  return (
    <Bloque etiqueta="Umbral">
      <Cifra valor={ritmoKm(c.umbral.ritmo_s_km)} tam={54} />
      <Marca tono={c.umbral.sin_revisar ? 'var(--twin-warning)' : 'var(--twin-faint)'}>{procedencia}</Marca>
      {c.zonas.length > 0 ? (
        <div style={{ marginTop: S.s }}>
          <ListaZonas zonas={c.zonas} onTapZona={onTapZona} />
        </div>
      ) : null}
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// VELOCIDAD CRÍTICA + D' — la confirma por otro camino; sin ajuste, se cuenta
// honesto (§7): si lo que falta es HISTORIA se ve el plazo, si es OCASIÓN
// (esfuerzos que no fueron máximos) se calla, como hace `seCalla` en el motor.
// ---------------------------------------------------------------------------

function BloqueVelocidadCritica({ c }: { c: CapacidadAtleta }) {
  if (!c.cs.ok) {
    return (
      <Bloque etiqueta="Velocidad crítica">
        {c.cs.razon.por === 'pocos_esfuerzos' ? (
          <>
            <Nota>{`Llevas ${c.cs.razon.llevas} de ${c.cs.razon.hacen} esfuerzos a tope que puedan compararse.`}</Nota>
            <Plazo llevas={c.cs.razon.llevas} hacen={c.cs.razon.hacen} />
          </>
        ) : (
          <Apagado alto={72} />
        )}
      </Bloque>
    );
  }

  const ritmoCS = Math.round(1000 / c.cs.cs_m_s);
  return (
    <Bloque etiqueta="Velocidad crítica">
      <Cifra valor={ritmoKm(ritmoCS)} tam={44} />
      <Marca>El ritmo que aguantas sin gastar el depósito</Marca>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: S.xs }}>
        <span
          style={{
            fontFamily: 'var(--twin-font-mono)',
            fontWeight: 700,
            fontSize: 20,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-fg)',
          }}
        >
          {Math.round(c.cs.d_prima_m)} m
        </span>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>reserva para arreones</span>
      </div>
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// RÉCORDS — catálogo cerrado a seis, calle y cinta separados, solo lo que hay.
// ---------------------------------------------------------------------------

function BloqueRecords({ c }: { c: CapacidadAtleta }) {
  const visibles = c.registros.filter((r) => r.aire || r.cinta);
  return (
    <Bloque etiqueta="Récords">
      {visibles.length === 0 ? (
        <Nota>Aún ninguna marca registrada.</Nota>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
          {visibles.map((r) => (
            <TarjetaRecord key={r.spec.slug} registro={r} />
          ))}
        </div>
      )}
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// PREDICTOR — «lo que te da hoy», honesto cuando no hay VDOT del que partir.
// ---------------------------------------------------------------------------

function BloquePredictor({ c }: { c: CapacidadAtleta }) {
  if (!c.prediccion) {
    return (
      <Bloque etiqueta="Lo que te da hoy">
        <Nota>Con un test de umbral te lo digo.</Nota>
      </Bloque>
    );
  }
  return (
    <Bloque etiqueta="Lo que te da hoy">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {c.prediccion.map((p, i) => (
          <div key={p.metros}>
            {i > 0 && <Hairline />}
            <FilaPredictor prediccion={p} />
          </div>
        ))}
      </div>
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// CURVA DE MEJORES ESFUERZOS — el patrón de `analiticas-correr`, importado.
// ---------------------------------------------------------------------------

function BloqueCurva({ c }: { c: CapacidadAtleta }) {
  if (c.curvaHoy.length + c.curvaAntes.length < 2) return null;
  return (
    <Bloque etiqueta="Mejores esfuerzos por periodo">
      <CurvaEsfuerzos hoy={c.curvaHoy} antes={c.curvaAntes} />
    </Bloque>
  );
}
