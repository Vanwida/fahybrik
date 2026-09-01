'use client';

// EL HUB DE CARRERA — nivel 0 de Analíticas › Carrera.
//
// SUSTITUYE a `analiticas-correr` como raíz de la tab (mapa v2,
// docs/analiticas-running-mapa.md, 13-ago tarde). La v1 acertó el contenido
// y falló la forma: una tira con scroll infinito y un CTA que abría la
// batería de tests entera (1RM de squat incluido) nada más entrar. Esto es
// el hub corto que pide Alex: veredicto sin botones + nueve puertas, cada
// una una vista propia (NavigationStack real), nunca una sección más de la
// misma tira.
//
// EL MOTOR ES EL MISMO QUE `analiticas-correr` — literalmente, no una copia:
// se reimporta `RunningHistory`/`veredictoDe`/`coberturaDe`/`salidaDe` de
// `../analiticas-correr/modelo` (que a su vez reexporta
// `shared/domain/running/progress.ts`, lo que ejecuta el servidor). Dos
// pantallas del mismo dato no pueden tener dos motores.
//
// LA ÚNICA REGLA PROPIA DE ESTE HUB (encargo, 13-ago): §6.2bis a rajatabla.
// La tira apaga cualquier lectura sin cobertura, tenga o no acción, porque
// enseña la salida UNA vez para toda la pantalla. Aquí no hay salida
// compartida — cada puerta es su propio botón — así que una puerta se apaga
// (silueta + candado) SOLO si el atleta tiene algo que tocar; si lo único
// que falta es tiempo, no hay candado que enseñar y la puerta se calla. Es
// exactamente lo que separa al «nuevo» (Forma y Capacidad calladas, las dos
// por falta de semanas) del «veterano» (las dos con dato).

import { useEffect } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { EstadoCentrado } from '../../kit-composicion/estados';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Barras, Fondo, Plazo, Puntos } from '../analiticas-correr/graficos';
import { Cifra, Delta, Veredicto } from '../analiticas-correr/piezas';
import { METODO, coberturaDe, deltasDe, salidaDe, seCalla, tonoDe, veredictoDe, type ClaseVeredicto, type Deltas, type Falta } from '../analiticas-correr/modelo';
import { ChipsTipo, DatoMenor, FilaSesion, Puerta, PuertaApagada, Rail, horasYMin } from './piezas';
import { ESCENAS, type HubRunningData } from './datos';

export const meta: TwinMeta = {
  id: 'correr-hub',
  titulo: 'Carrera — el hogar del running',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'El nivel 0 de Carrera: veredicto sin botones y nueve puertas navegables —Este mes, Tus carreras, Forma, Capacidad, Por tipo, lo que te piden, correr cansado y tu carrera— cada una entra a su propia vista.',
  fuentes: [],
  enApp:
    'La pastilla existe como tira única (AnaliticasCorrerView.swift) con veredicto/forma/esfuerzos/volumen/pedido/cansado; lo nuevo es la estructura de puertas navegables, Este mes, Tus carreras y la retirada del CTA de tests.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: declararla enciende el conmutador «hoy/propuesta» y esta
  // propuesta no monta la vista de hoy (la tira vive en `analiticas-correr`).
  // Arquetipo lista, estrategia llena; el diagnóstico está en el mapa v2.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'veterano',
    titulo: '① Siete meses dentro · veredicto verde',
    descripcion:
      'El caso lleno: las nueve puertas con dato, Forma y Capacidad incluidas. El lienzo se tiñe de verde por el mismo veredicto que la tira.',
  },
  {
    id: 'nuevo',
    titulo: '② Tres semanas · «Aún no»',
    descripcion:
      'Forma y Capacidad se apagan por la MISMA razón que el veredicto —falta tiempo, no un test— así que las dos se callan (§6.2bis) en vez de enseñar un candado sin nada que tocar. Sin carrera objetivo: la puerta invita a elegir una.',
  },
  {
    id: 'vacio',
    titulo: '③ Recién dado de alta',
    descripcion: 'Cero carreras. El hub degrada a Vacío: centrado, sin botón de tests — la salida es empezar a correr o conectar Salud.',
  },
];

const DENTRO = S.xl;
const ENTRE = S.xxl;

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const h: HubRunningData = ESCENAS[escenario] ?? ESCENAS.veterano!;
  const vacio = escenario === 'vacio';
  const v = veredictoDe(h, METODO);
  const cob = coberturaDe(h, METODO);
  const deltas = deltasDe(h);
  const capFalta = capacidadFalta(h);

  useEffect(() => {
    onLog(vacio ? 'Hub vacío — sin historial' : `Veredicto: ${v.clase}`);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vacio) {
    return (
      <div className="twin-screen-safe">
        <Fondo tono={tonoDe('aun-no')} appearance={appearance} />
        <Pantalla
          estrategia="centra"
          cabecera={
            <div style={{ padding: `${S.m}px ${S.l}px 0` }}>
              <Rail />
            </div>
          }
          tabBar={<TabBar activa="Analíticas" />}
        >
          <EstadoCentrado
            titulo="Tu running empieza aquí"
            cuerpo="En cuanto corras una vez, o conectes Salud, esto se llena: veredicto, ritmo, forma."
            salida={{
              tipo: 'accion',
              texto: 'Empezar a correr',
              onTap: () => onLog('→ Correr en vivo'),
              secundaria: { texto: 'Conectar Salud', onTap: () => onLog('→ Conectar Salud') },
            }}
          />
        </Pantalla>
      </div>
    );
  }

  return (
    <div className="twin-screen-safe">
      <Fondo tono={tonoDe(v.clase)} appearance={appearance} />
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Analíticas" />}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: ENTRE, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
          <Rail />

          <Veredicto clase={v.clase} frase={v.frase}>
            {v.plazo ? <Plazo llevas={v.plazo.llevas} hacen={v.plazo.hacen} /> : null}
          </Veredicto>

          <div style={{ display: 'flex', flexDirection: 'column', gap: DENTRO }}>
            <PuertaEsteMes h={h} onTap={() => onLog('→ Tendencias')} />
            <PuertaTusCarreras h={h} onTap={() => onLog('→ Historial')} />

            {estadoDe(cob.forma) === 'da' && <PuertaForma h={h} deltas={deltas} onTap={() => onLog('→ Forma')} />}
            {estadoDe(cob.forma) === 'apagada' && (
              <PuertaApagada etiqueta="Forma" onTap={() => onLog(`Salida → ${salidaDe(cob.forma!)}`)} />
            )}

            {estadoDe(capFalta) === 'da' && <PuertaCapacidad h={h} onTap={() => onLog('→ Capacidad')} />}
            {estadoDe(capFalta) === 'apagada' && (
              <PuertaApagada etiqueta="Capacidad" onTap={() => onLog(`Salida → ${salidaDe(capFalta!)}`)} />
            )}

            {h.por_tipo.length > 0 && <PuertaPorTipo h={h} onTap={() => onLog('→ Por tipo')} />}

            {estadoDe(cob.pedido) === 'da' && <PuertaPedido h={h} onTap={() => onLog('→ Lo que te piden')} />}

            {estadoDe(cob.cansado) === 'da' && <PuertaCansado h={h} onTap={() => onLog('→ Correr cansado')} />}

            <PuertaMiCarrera h={h} clase={v.clase} onTap={() => onLog(h.carrera ? '→ Mi carrera' : '→ Elegir carrera')} />
          </div>
        </div>
      </Pantalla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ESTADO DE COBERTURA PARA EL HUB — §6.2bis a rajatabla (ver cabecera)
// ---------------------------------------------------------------------------

function estadoDe(f: Falta | null): 'da' | 'apagada' | 'nada' {
  if (f == null) return 'da';
  if (seCalla(f)) return 'nada';
  return salidaDe(f) != null ? 'apagada' : 'nada';
}

/**
 * Capacidad (umbral + récords) no vive en la escalera de evidencia del
 * veredicto — `progress.ts` es explícito: es densidad, no ladder. Pide su
 * propio ancla (el test de RITMO, `UmbralRitmo` — no el mismo test que
 * `zonas_medidas`, que es de PULSO) y el mismo mínimo de semanas que el
 * resto de lecturas antes de afirmar un récord «reciente».
 */
function capacidadFalta(h: HubRunningData): Falta | null {
  if (h.umbral?.ritmo_s_km == null) return { por: 'ancla' };
  if (h.semanas < METODO.min_weeks_to_judge) return { por: 'historia', llevas: h.semanas, hacen: METODO.min_weeks_to_judge };
  return null;
}

/** Nulo si no lo tiene: un guion es una casilla vacía disfrazada de dato. */
function mejor5k(h: HubRunningData): string | null {
  const cinco = h.esfuerzos.find((e) => e.metros === 5000);
  return cinco ? reloj(cinco.segundos) : null;
}

// ---------------------------------------------------------------------------
// LAS NUEVE PUERTAS, en el orden del encargo
// ---------------------------------------------------------------------------

function PuertaEsteMes({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  return (
    <Puerta etiqueta="Este mes" onTap={onTap}>
      <Cifra valor={esDecimal(h.mes.km, 0)} unidad="km" tam={44} />
      <div style={{ display: 'flex', gap: S.xl }}>
        <DatoMenor valor={String(h.mes.salidas)} unidad="salidas" />
        <DatoMenor valor={horasYMin(h.mes.segundos)} unidad="tiempo" />
        <DatoMenor valor={`${h.mes.desnivel_m} m`} unidad="desnivel" />
      </div>
      {h.semanas_km.length > 1 && <Barras puntos={h.semanas_km.slice(-4)} alto={40} />}
    </Puerta>
  );
}

function PuertaTusCarreras({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  if (h.recientes.length === 0) return null;
  return (
    <Puerta etiqueta="Tus carreras" onTap={onTap}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
        {h.recientes.map((s) => (
          <FilaSesion key={`${s.fecha}-${s.tipo}`} s={s} ritmoKm={ritmoKm} esDecimal={esDecimal} />
        ))}
      </div>
    </Puerta>
  );
}

function PuertaForma({ h, deltas, onTap }: { h: HubRunningData; deltas: Deltas; onTap: () => void }) {
  const valor = h.vo2 ? String(h.vo2.valor) : ritmoKm(Math.round(h.al_pulso[h.al_pulso.length - 1]!.valor));
  const unidad = h.vo2 ? 'VO₂máx' : 'mismo pulso';
  return (
    <Puerta etiqueta="Forma" onTap={onTap}>
      <Cifra valor={valor} unidad={unidad} tam={44}>
        <DeltaForma h={h} d={deltas} />
      </Cifra>
    </Puerta>
  );
}

function DeltaForma({ h, d }: { h: HubRunningData; d: Deltas }) {
  if (h.vo2) {
    // NULO, no cero: la serie aún no da para una base.
    if (h.vo2.delta === null) return null;
    if (h.vo2.delta === 0) return <Delta mejor={null} valor="0" ventana={`${h.vo2.ventana_semanas} sem`} />;
    return <Delta mejor={h.vo2.delta > 0} valor={String(Math.abs(h.vo2.delta))} ventana={`${h.vo2.ventana_semanas} sem`} />;
  }
  if (!d.forma) return null;
  const { gana_s_km, semanas } = d.forma;
  return <Delta mejor={gana_s_km > 0} valor={`${Math.abs(Math.round(gana_s_km))} s`} ventana={`${semanas} sem`} />;
}

function PuertaCapacidad({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  const mejor = mejor5k(h);
  return (
    <Puerta etiqueta="Capacidad" onTap={onTap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.xl, flexWrap: 'wrap' }}>
        <Cifra valor={ritmoKm(h.umbral!.ritmo_s_km!)} unidad="umbral" tam={44} />
        {mejor && <Cifra valor={mejor} unidad="5 km" tam={22} />}
      </div>
    </Puerta>
  );
}

function PuertaPorTipo({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  const total = h.por_tipo.reduce((a, t) => a + t.sesiones, 0);
  return (
    <Puerta etiqueta="Por tipo" onTap={onTap}>
      <Cifra valor={String(total)} unidad="sesiones" tam={44} />
      <ChipsTipo items={h.por_tipo} />
    </Puerta>
  );
}

function PuertaPedido({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  const p = h.pedido!;
  const pct = p.pct_en_banda;
  if (pct == null) return null;
  const tono = !p.juzgable ? 'var(--twin-fg)' : pct >= METODO.good_in_band_pct ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <Puerta etiqueta="Lo que te piden" onTap={onTap}>
      <Cifra valor={String(pct)} unidad="% en banda" tam={44} tono={tono} />
      <Puntos dentro={p.dentro} lento={p.fuera_lento} rapido={p.fuera_rapido} />
    </Puerta>
  );
}

function PuertaCansado({ h, onTap }: { h: HubRunningData; onTap: () => void }) {
  const primero = h.cansado[0]!;
  const ultimo = h.cansado[h.cansado.length - 1]!;
  const mejora = primero.coste_s_km - ultimo.coste_s_km;
  return (
    <Puerta etiqueta="Correr cansado" onTap={onTap}>
      <Cifra valor={esDecimal(ultimo.coste_s_km)} unidad="s/km de más" tam={44} tono={mejora > 0 ? 'var(--twin-ok)' : 'var(--twin-warning)'}>
        <Delta mejor={mejora > 0} valor={esDecimal(Math.abs(mejora))} ventana={`${h.cansado.length - 1} sem`} />
      </Cifra>
    </Puerta>
  );
}

function PuertaMiCarrera({ h, clase, onTap }: { h: HubRunningData; clase: ClaseVeredicto; onTap: () => void }) {
  if (!h.carrera) {
    return (
      <Puerta etiqueta="Mi carrera" onTap={onTap}>
        <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Aún sin carrera con dorsal</span>
        <span style={{ font: '400 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>Elige una y te marcamos el camino</span>
      </Puerta>
    );
  }
  return (
    <Puerta etiqueta="Mi carrera" onTap={onTap}>
      <span style={{ font: '700 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{h.carrera.nombre}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.xl, flexWrap: 'wrap' }}>
        <Cifra valor={String(h.carrera.dias)} unidad="días" tam={36} />
        {h.carrera.predicho_s != null && <Cifra valor={reloj(h.carrera.predicho_s)} unidad="previsto" tam={22} tono={tonoDe(clase)} />}
      </div>
    </Puerta>
  );
}
