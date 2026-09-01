'use client';

// POR TIPO DE ENTRENO — ¿mejoras en lo que entrenas?
//
// Del mapa (docs/analiticas-running-mapa.md, v2, NIVEL 1 · PRIORIDAD 4): «Series
// → todos tus 6×800 en el tiempo → ¿voy más rápido en series?». Se entra por
// push desde el hub de Analíticas (nivel 0 → nivel 1). El filtro POR TIPO ES LA
// NAVEGACIÓN: seis chips arriba, y cambiar de chip cambia todo lo de abajo —
// no hay una tira que enseñe los seis tipos a la vez.
//
// ARQUETIPO DETALLE, ESTRATEGIA LLENA (CONTRATO-UI §6.2): el sujeto es «la
// progresión del ritmo en el tipo elegido», y el hueco se gana con lo que le da
// sentido — su adherencia, su mejor sesión, sus salidas — no con aire.
//
// LA VOZ ES LA DE `analiticas-correr`, estudiada mirándola: cero cajas, cero
// rayas divisorias, aire entre grupos (24 dentro, 48 entre bloques), cifras
// mono tabulares, etiquetas en versalita, el naranja reservado a lo
// interactivo activo (el chip encendido, nunca un color de dato). El cromo es
// el de una vista empujada — `NavBar` con `atras`, nunca la `TabBar` (mismo
// patrón que `correr-historial` y `tests-calibracion`).
//
// LA REGLA DE HONESTIDAD PROPIA DE ESTA PANTALLA (Alex, 13-ago): un tipo con
// menos de tres sesiones no dibuja progresión — la línea con dos puntos es una
// conclusión inventada. Se listan las sesiones sueltas y una frase, nunca una
// línea. Ver `MIN_SESIONES_PROGRESION` en `./modelo`.

import { useEffect, useState } from 'react';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { NavBar, Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { ritmoKm } from '../../kit-composicion/formato';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS } from './datos';
import {
  BUENA_ADHERENCIA_PCT,
  METRICA_DE,
  PREGUNTA_DE,
  TIPO_LABEL,
  deltaDe,
  mejorSesionDe,
  progresionDe,
  type EstadoTipo,
  type TipoPorEntreno,
} from './modelo';
import { LineaProgreso, Puntos } from './graficos';
import { Bloque, Cifra, Delta, Etiqueta, FilaSesion, Marca, ProgresionEscasa, RielTipos, SinTipo } from './piezas';

export const meta: TwinMeta = {
  id: 'correr-por-tipo',
  titulo: 'Por tipo — ¿mejoras en lo que entrenas?',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'Seis chips —Series, Rodajes, Largos, Fartlek, Cuestas, Tempo— y el filtro ES la navegación: cada uno abre su propia progresión, su adherencia si la lleva, su mejor sesión y sus salidas. Con menos de tres sesiones de un tipo, la pantalla se calla la línea y lista lo que hay.',
  fuentes: [],
  enApp:
    'Hoy solo hay DOS baldas, no seis: `DetalleDeCarrera` (iOS) pinta `MediasPorTipo` con `por_tipo` del servidor (`mediasPorTipo()`, shared/domain/running/progress.ts) — pero el propio `scheme` de la sesión solo distingue `intervals` (Series) y `steady` (Rodaje); Tempo colapsa dentro de Rodaje y Largo/Fartlek/Cuesta no existen como valor todavía. Y es solo una MEDIA agregada en una tira dentro de la pantalla de veredicto: sin progresión por sesión, sin adherencia por tipo, sin mejor sesión, sin lista propia, y sin poder entrar por push.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: propuesta pura sin vista «hoy» que alternar (POR TIPO es
  // ❌ ENTERA en el mapa). Arquetipo detalle, estrategia llena.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'series-mejorando',
    titulo: '① Series, cuatro meses',
    descripcion:
      'Doce 6×800 (y variantes) entre abril y agosto: la línea baja con claridad y la adherencia sale con sesgo rápido — el atleta ya corre más rápido que la banda que le pusieron hace cuatro meses.',
  },
  {
    id: 'rodajes',
    titulo: '② Rodajes · sin banda',
    descripcion:
      'El chip abre en Rodajes: un tipo que nunca llevó ritmo pactado. La línea es RITMO AL MISMO PULSO —la única comparación honesta en esfuerzo libre— y no hay bloque de adherencia, porque nunca hubo nada que cumplir.',
  },
  {
    id: 'tipo-escaso',
    titulo: '③ Cuestas · dos sesiones',
    descripcion:
      'El chip abre en Cuestas: solo dos salidas. Sin línea —ni siquiera la adherencia se puede juzgar, con 7 repeticiones bajo el mínimo—, pero las dos sesiones se listan igual.',
  },
  {
    id: 'vacio',
    titulo: '④ Sin tipos detectados',
    descripcion: 'Un atleta que aún no tiene una sola carrera clasificada: vacío centrado, honesto, sin chips que no llevarían a ningún sitio.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const config = ESCENAS[escenario] ?? ESCENAS['series-mejorando']!;
  const hayAlgo = Object.values(config.porTipo).some((e) => e.sesiones.length > 0);
  const [tipo, setTipo] = useState<TipoPorEntreno>(config.tipoInicial ?? 'series');

  useEffect(() => {
    onLog(hayAlgo ? `Abre en «${TIPO_LABEL[tipo]}»` : 'Sin tipos detectados todavía');
    // Solo al montar: cada interacción ya se registra en su propio manejador,
    // y el remount por `key` al cambiar de escenario reinicia esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hayAlgo) {
    return (
      <div className="twin-screen-safe">
        <Pantalla estrategia="centra" cabecera={<NavBar titulo="Por tipo" atras />}>
          <EstadoCentrado
            titulo="Aún no hay tipos que enseñar"
            cuerpo="En cuanto corras tus primeras salidas se agrupan solas por lo que entrenaste ese día — series, rodaje, largo…"
            salida={{
              tipo: 'depende',
              quien: 'Tus próximas carreras',
              cuando: 'se clasifican solas en cuanto corras un par.',
            }}
          />
        </Pantalla>
      </div>
    );
  }

  const estado = config.porTipo[tipo];

  return (
    <div className="twin-screen-safe">
      <Pantalla estrategia="llena" cabecera={<NavBar titulo="Por tipo" atras />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
          <RielTipos
            activo={tipo}
            recuentoDe={(t) => config.porTipo[t].sesiones.length}
            onSeleccionar={(t) => {
              setTipo(t);
              onLog(`Chip → ${TIPO_LABEL[t]}`);
            }}
          />

          {estado.sesiones.length === 0 ? <SinTipo tipo={tipo} /> : <ContenidoTipo estado={estado} onLog={onLog} />}
        </div>
      </Pantalla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL CONTENIDO DE UN TIPO — sujeto, adherencia si la lleva, mejor sesión, lista
// ---------------------------------------------------------------------------

function ContenidoTipo({ estado, onLog }: { estado: EstadoTipo; onLog: (linea: string) => void }) {
  const metrica = METRICA_DE[estado.tipo];
  const puntos = progresionDe(estado);
  const delta = deltaDe(estado);
  const mejor = mejorSesionDe(estado)!;
  // Más reciente arriba, como el resto de listas de esta familia.
  const recientesPrimero = [...estado.sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl }}>
      {/* ── EL SUJETO — ¿voy más rápido en esto? ──────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Etiqueta>{TIPO_LABEL[estado.tipo]}</Etiqueta>
          <h1 className="t-headline-m" style={{ margin: 0, color: 'var(--twin-fg)' }}>
            {PREGUNTA_DE[estado.tipo]}
          </h1>
        </div>

        {puntos && delta ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
            <Cifra valor={ritmoKm(delta.medio_ultimas_s_km)} unidad={metrica === 'ritmo_al_pulso' ? 'al mismo pulso' : 'ritmo medio'}>
              <Delta
                mejor={delta.gana_s_km === 0 ? null : delta.gana_s_km > 0}
                valor={`${Math.abs(delta.gana_s_km)} s`}
                ventana={`últimas ${delta.ventana}`}
              />
            </Cifra>
            <LineaProgreso puntos={puntos} formato={ritmoKm} />
            {metrica === 'ritmo_al_pulso' && <Marca>Ritmo a tu FC de referencia — no el ritmo bruto, que aquí no compara nada</Marca>}
          </div>
        ) : (
          <ProgresionEscasa />
        )}
      </div>

      {/* ── ADHERENCIA — solo si este tipo llevó alguna vez una banda ──────── */}
      {estado.adherencia && (
        <Bloque etiqueta="Adherencia en este tipo">
          <Cifra
            valor={String(estado.adherencia.pct_en_banda)}
            unidad="% en banda"
            tono={
              !estado.adherencia.juzgable
                ? 'var(--twin-fg)'
                : estado.adherencia.pct_en_banda >= BUENA_ADHERENCIA_PCT
                  ? 'var(--twin-ok)'
                  : 'var(--twin-warning)'
            }
          />
          <Puntos dentro={estado.adherencia.dentro} lento={estado.adherencia.fuera_lento} rapido={estado.adherencia.fuera_rapido} />
          {!estado.adherencia.juzgable && (
            <Marca>{`Solo ${estado.adherencia.evaluadas} repeticiones — pocas para juzgar el sesgo todavía`}</Marca>
          )}
        </Bloque>
      )}

      {/* ── TU MEJOR SESIÓN ─────────────────────────────────────────────── */}
      <Bloque etiqueta="Tu mejor sesión">
        <FilaSesion
          sesion={mejor}
          metrica={metrica}
          colaExtra="banda"
          destacada
          onTap={() => onLog(`→ ficha: ${mejor.dosis} del ${mejor.fecha}`)}
        />
      </Bloque>

      {/* ── SUS SESIONES ────────────────────────────────────────────────── */}
      <Bloque etiqueta="Sus sesiones">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {recientesPrimero.map((s, i) => (
            <FilaSesion
              key={`${s.fecha}-${i}`}
              sesion={s}
              metrica={metrica}
              colaExtra="fc"
              onTap={() => onLog(`→ ficha: ${s.dosis} del ${s.fecha}`)}
            />
          ))}
        </div>
      </Bloque>
    </div>
  );
}
