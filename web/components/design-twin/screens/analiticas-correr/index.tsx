'use client';

// LAS ANALÍTICAS DE CARRERA — ¿estoy mejorando?
//
// La pestaña de hoy es una rejilla de tarjetas, una por métrica. El atleta la
// cierra sabiendo su cadencia media y sin saber si está mejorando, que es lo
// único que había venido a mirar. Un panel de instrumentos no es una respuesta.
//
// TRES CAMBIOS, Y NINGUNO ES COSMÉTICO.
//
// 1 · EL VEREDICTO PRIMERO. Lo que hacen bien Whoop y el Training Status de
//     Garmin: una frase antes de un solo gráfico. Aquí sale de una ESCALERA DE
//     EVIDENCIA (`modelo.ts`) y no de un índice inventado del 0 al 100 — cada
//     frase se puede rastrear hasta el número del que salió, y ese número va
//     escrito justo debajo. Y puede decir «todavía no lo sé», que es la parte
//     que casi nadie se atreve a construir.
//
// 2 · EL ORDEN ES CAUSAL. No cuatro tarjetas iguales: **lo que sale** (el
//     efecto) y luego **lo que metes** (el trabajo). Separarlos es lo que
//     convierte una rejilla en un argumento — en el escenario ③ se lee arriba
//     que el motor responde peor y debajo, en la misma pantalla, el tercio del
//     tiempo a ritmo medio que lo explica. La rejilla de hoy tiene esos dos
//     datos y no los deja cruzar.
//
// 3 · LO QUE FALTA SE PIDE UNA VEZ. Cuando varias lecturas esperan lo mismo,
//     sale UN bloque que las nombra y da la salida, en vez de tres tarjetas
//     grises pidiendo tres veces el mismo test.
//
// COMPOSICIÓN. Arquetipo **Detalle**, estrategia **llena**: el veredicto ocupa
// el primer tercio sin adornos y por debajo scrollea la evidencia. Es pantalla
// raíz del TabView, así que la barra de pestañas se pinta — el alto disponible
// se mide de verdad, no de mentira.

import { useEffect } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { distribucionZonas } from '../../zonas';
import { colorZona } from '../../kit-vivo';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS } from './datos';
import { BarrasSemanales, CurvaEsfuerzos, LineaJuicio } from './graficos';
import {
  METODO,
  coberturaDe,
  faltaComun,
  seCalla,
  tonoDe,
  veredictoDe,
  type Cobertura,
  type Falta,
  type Historia,
} from './modelo';
import { Carrera, Espera, Peticion, Pedido_, Pieza, Portada, Reparto, Tramo, colapsoDe, ejeCoste, ejeRitmo } from './piezas';

export const meta: TwinMeta = {
  id: 'analiticas-correr',
  titulo: 'Analíticas de correr — ¿estoy mejorando?',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-12',
  descripcion:
    'Un veredicto defendible antes que un solo gráfico, y debajo la evidencia ordenada por causa: lo que sale y lo que metes. Cuando no hay con qué afirmar nada, lo dice — y lo que falta se pide una vez, no en cada tarjeta.',
  fuentes: [],
  enApp:
    'La pestaña existe (AnalyticsView + lib/athlete/analytics/running.ts) y ya sirve volumen, zonas, tendencia de ritmo y mejores marcas. Lo nuevo es el veredicto, el orden causal, la curva de esfuerzos con sombra, el ritmo al mismo pulso y la adherencia agregada: los dos últimos ya se calculan por sesión y se tiran sin acumular.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'veterano',
    titulo: '① Siete meses dentro, y mejorando',
    descripcion:
      'El caso lleno. El veredicto sale del peldaño bueno —al mismo pulso corre once segundos por km más rápido— y todo lo de debajo lo respalda. Mira la curva de esfuerzos: la línea de puntos es él hace un mes.',
  },
  {
    id: 'nuevo',
    titulo: '② Tres semanas · casi nada se puede afirmar',
    descripcion:
      'El que separa un diseño honesto de uno que rellena. El veredicto es «todavía no te lo puedo decir» con el plazo puesto, la curva sale SIN sombra porque no hay contra qué, y las dos lecturas que no le aplican no aparecen. La pantalla sale corta, y esa es la respuesta correcta.',
  },
  {
    id: 'cargando',
    titulo: '③ Cargando de más · el veredicto incómodo',
    descripcion:
      'Volumen subiendo y el motor respondiendo peor. El veredicto lo dice sin suavizarlo, y la evidencia de debajo lo EXPLICA: casi un tercio del tiempo a ritmo medio y trece repeticiones de treinta y ocho pasado de rosca. Y se le recuerda que su coach ve lo mismo.',
  },
  {
    id: 'sin-zonas',
    titulo: '④ Sin test de umbral · dos lecturas caídas',
    descripcion:
      'No hizo el test, así que el ritmo al mismo pulso y el reparto se caen POR LA MISMA RAZÓN. La petición sale una vez arriba y nombra las dos; no hay dos tarjetas grises repitiendo. El veredicto baja al segundo peldaño (mejores esfuerzos) y sigue siendo defendible.',
  },
];

/** Cómo se llama cada lectura cuando hay que nombrarla en la petición. */
const NOMBRE: Record<keyof Cobertura, string> = {
  alPulso: 'el ritmo al mismo pulso',
  esfuerzos: 'tus mejores esfuerzos',
  kilometros: 'cuánto corres',
  reparto: 'cómo repartes la intensidad',
  pedido: 'lo que te piden',
  cansado: 'correr cansado',
};

/** La salida de cada falta. Las dos que se callan no tienen: no hay nada que pedir. */
const SALIDA: Record<Falta['por'], string> = {
  historia: 'Sigue corriendo',
  ancla: 'Hacer el test de zonas',
  sensor: 'Conectar una banda de pulso',
  ocasion: '',
  intencion: '',
};

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const h: Historia = ESCENAS[escenario] ?? ESCENAS.veterano!;
  const veredicto = veredictoDe(h);
  const cobertura = coberturaDe(h);

  // Las faltas que SE CUENTAN. Las que se callan («nunca te ha pasado», «nunca
  // te pusieron ritmos») no entran aquí ni en ningún sitio: la pieza no existe.
  const contables = (Object.keys(cobertura) as (keyof Cobertura)[])
    .map((k) => ({ k, f: cobertura[k] }))
    .filter((x): x is { k: keyof Cobertura; f: Falta } => x.f != null && !seCalla(x.f));

  const comun = faltaComun(contables.map((x) => x.f));
  const hoisted = comun ? contables.filter((x) => x.f.por === comun.por).map((x) => x.k) : [];

  /** Qué hace cada pieza: pintarse, esperar en su sitio, o desaparecer. */
  const modo = (k: keyof Cobertura): 'da' | 'espera' | 'nada' => {
    const f = cobertura[k];
    if (f == null) return 'da';
    if (seCalla(f) || hoisted.includes(k)) return 'nada';
    return 'espera';
  };

  useEffect(() => {
    onLog(`Veredicto: ${veredicto.clase}${veredicto.peldano ? ` · peldaño ${veredicto.peldano.en}` : ' · sin evidencia'}`);
    const calladas = (Object.keys(cobertura) as (keyof Cobertura)[]).filter((k) => modo(k) === 'nada');
    onLog(calladas.length > 0 ? `Se callan: ${calladas.map((k) => NOMBRE[k]).join(', ')}` : 'Ninguna lectura se calla');
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const zonas = distribucionZonas({ duracionS: h.segundosCorriendo, zonasS: h.zonasS });

  return (
    // El safe area lo pone la pantalla, no el marco: sin esto el rail de
    // secciones se mete debajo de la isla y las tres primeras pestañas dejan de
    // poder tocarse.
    <div className="twin-screen-safe">
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Analíticas" />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xl, padding: `${S.m}px ${S.m}px ${S.xl}px` }}>
          <Rail />
          <Portada veredicto={veredicto} />

          {/* Que el coach lo ve también. No es un adorno: evita que una máquina
              parezca estar acusándole a solas, y es verdad — el panel del coach
              tiene el mismo reparto y la misma carga delante. */}
          {(veredicto.clase === 'cargando' || veredicto.clase === 'peor') && (
            <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', marginTop: -S.m }}>
              Tu coach ve lo mismo que tú desde su panel.
            </span>
          )}

          {comun && <Peticion falta={comun} abre={hoisted.map((k) => NOMBRE[k])} accion={SALIDA[comun.por]} />}

          {/* ─────────────────────────────────────────────────────────────── */}
          <Tramo titulo="Lo que sale" pie="El efecto: en qué se ha convertido el trabajo.">
            {modo('alPulso') === 'da' && <AlPulso h={h} />}
            {modo('alPulso') === 'espera' && <Espera titulo="Tu ritmo al mismo pulso" falta={cobertura.alPulso!} />}

            {modo('esfuerzos') === 'da' && <Esfuerzos h={h} />}
            {modo('esfuerzos') === 'espera' && <Espera titulo="Tus mejores esfuerzos" falta={cobertura.esfuerzos!} />}
          </Tramo>

          {/* ─────────────────────────────────────────────────────────────── */}
          <Tramo titulo="Lo que metes" pie="El trabajo: cuánto, cómo lo repartes y si haces lo que te ponen.">
            {modo('kilometros') === 'da' && <Kilometros h={h} />}
            {modo('kilometros') === 'espera' && <Espera titulo="Cuánto corres" falta={cobertura.kilometros!} />}

            {modo('reparto') === 'da' && zonas.length > 0 && <RepartoPieza zonas={zonas} />}
            {modo('reparto') === 'espera' && <Espera titulo="Cuánto vas suave y cuánto fuerte" falta={cobertura.reparto!} />}

            {modo('pedido') === 'da' && h.pedido && <PedidoPieza h={h} />}
          </Tramo>

          {/* ─────────────────────────────────────────────────────────────── */}
          <TramoCarrera h={h} modoCansado={modo('cansado')} cobertura={cobertura} veredicto={veredicto.clase} />
        </div>
      </Pantalla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El rail de secciones — es el cromo real de la pestaña, y se pinta
// ---------------------------------------------------------------------------

const SECCIONES = ['Carrera', 'Ergo', 'Fuerza', 'HYROX', 'Recup.'];

function Rail() {
  return (
    <div className="twin-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: -S.s }}>
      {SECCIONES.map((s, i) => (
        <span
          key={s}
          style={{
            flex: '0 0 auto',
            padding: '5px 12px',
            borderRadius: R.pill,
            font: '600 12px/1.2 var(--twin-font-sans)',
            background: i === 0 ? 'var(--twin-fg)' : 'transparent',
            color: i === 0 ? 'var(--twin-bg)' : 'var(--twin-muted)',
            border: i === 0 ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las piezas, con su lectura. Ninguna enseña un número sin decir contra qué.
// ---------------------------------------------------------------------------

function AlPulso({ h }: { h: Historia }) {
  const primero = h.alPulso[0]!;
  const ultimo = h.alPulso[h.alPulso.length - 1]!;
  const gana = primero.skm - ultimo.skm;
  const tono =
    gana >= METODO.mejoraMinimaSkm ? 'var(--twin-ok)' : gana <= -METODO.mejoraMinimaSkm ? 'var(--twin-warning)' : 'var(--twin-fg)';

  return (
    <Pieza
      titulo="Tu ritmo al mismo pulso"
      tono={tono}
      lectura={`Con el pulso a ${h.ppmReferencia} vas a ${ritmoKm(Math.round(ultimo.skm))}. Hace ${h.alPulso.length} semanas, al mismo pulso, ibas a ${ritmoKm(Math.round(primero.skm))}.`}
      nota="Es la señal más limpia que hay de estar en forma: mismo esfuerzo del corazón, más velocidad. Garmin la estima con el VO₂máx; aquí se mide."
    >
      <LineaJuicio
        puntos={h.alPulso.map((p) => ({ semana: p.semana, valor: p.skm }))}
        color={colorZona(h.zonaReferencia)}
        formato={ejeRitmo}
      />
    </Pieza>
  );
}

function Esfuerzos({ h }: { h: Historia }) {
  const comunes = h.esfuerzos
    .filter((e) => h.esfuerzosAntes.some((a) => a.metros === e.metros))
    .sort((a, b) => b.metros - a.metros);
  const ref = comunes[0];
  const antes = ref ? h.esfuerzosAntes.find((a) => a.metros === ref.metros)! : null;

  const lectura =
    ref && antes
      ? (() => {
          const d = ref.metros >= 1000 ? `${ref.metros / 1000} km` : `${ref.metros} m`;
          const dif = antes.segundos - ref.segundos;
          return dif === 0
            ? `Tu mejor ${d} está en ${reloj(ref.segundos)}, igual que hace un mes.`
            : `Tu mejor ${d} está en ${reloj(ref.segundos)}, ${Math.abs(dif)} s ${dif > 0 ? 'por debajo' : 'por encima'} del de hace un mes.`;
        })()
      : 'Esto es de lo que eres capaz hoy. Dentro de un mes la curva llevará su sombra detrás y verás si se ha movido.';

  return (
    <Pieza
      titulo="Tus mejores esfuerzos"
      lectura={lectura}
      nota={
        h.esfuerzosAntes.length > 0
          ? 'La línea entera, de 400 metros a 10 km, en vez de tres récords sueltos. Un récord dice si ese día fue bueno; la curva dice de qué está hecho tu motor.'
          : undefined
      }
    >
      <CurvaEsfuerzos hoy={h.esfuerzos} antes={h.esfuerzosAntes} />
    </Pieza>
  );
}

function Kilometros({ h }: { h: Historia }) {
  const ultimo = h.semanasKm[h.semanasKm.length - 1]!;
  const hayTendencia = h.semanasKm.length >= 6;
  const base = h.semanasKm.slice(0, 4).reduce((a, s) => a + s.km, 0) / Math.min(4, h.semanasKm.length);

  return (
    <Pieza
      titulo="Cuánto corres"
      lectura={
        hayTendencia
          ? `${esDecimal(ultimo.km, 0)} km esta semana. Hace ${h.semanasKm.length} semanas hacías ${esDecimal(base, 0)}.`
          : `${esDecimal(ultimo.km, 0)} km esta semana. Con ${h.semanasKm.length} semanas todavía no hay tendencia: por ahora es lo que llevas, no hacia dónde vas.`
      }
    >
      <BarrasSemanales puntos={h.semanasKm} />
    </Pieza>
  );
}

function RepartoPieza({ zonas }: { zonas: ReturnType<typeof distribucionZonas> }) {
  const c = colapsoDe(zonas);
  const brecha = METODO.reparto.suave - c.suave;
  const desviado = brecha >= METODO.desvioDeRepartoQueImporta;

  return (
    <Pieza
      titulo="Cuánto vas suave y cuánto fuerte"
      tono={desviado ? 'var(--twin-warning)' : 'var(--twin-fg)'}
      lectura={
        desviado
          ? `Vas suave un ${c.suave}% del tiempo y tu coach te pide un ${METODO.reparto.suave}%. Lo que falta se te va a ritmo medio: un ${c.medio}%.`
          : `Un ${c.suave}% suave y un ${c.fuerte}% fuerte, muy cerca del ${METODO.reparto.suave} y ${METODO.reparto.fuerte} que te pide tu coach.`
      }
      nota={
        desviado
          ? 'El ritmo medio cansa como el fuerte y no entrena como el suave. Es lo que más se le escapa a cualquiera que corre por sensación.'
          : undefined
      }
    >
      <Reparto segmentos={zonas} />
    </Pieza>
  );
}

function PedidoPieza({ h }: { h: Historia }) {
  const p = h.pedido!;
  const pct = Math.round((p.dentro / p.evaluadas) * 100);
  const bien = pct >= METODO.enBandaBienPct;

  return (
    <Pieza
      titulo="Lo que te piden"
      tono={bien ? 'var(--twin-ok)' : 'var(--twin-fg)'}
      lectura={bien ? 'Clavas casi todo lo que te ponen.' : 'Te sales de lo que te ponen más de lo que deberías.'}
      marca="solo aquí"
      nota="Ninguna otra app puede darte esto: hace falta un entrenador poniéndote ritmos, y detrás de Garmin no hay ninguno."
    >
      <Pedido_ pedido={p} />
    </Pieza>
  );
}

// ---------------------------------------------------------------------------
// El último tramo — existe si hay carrera, o si hay algo que decir de correr
// cansado. Si no hay ninguna de las dos, no hay tramo: la app se calla.
// ---------------------------------------------------------------------------

function TramoCarrera({
  h,
  modoCansado,
  cobertura,
  veredicto,
}: {
  h: Historia;
  modoCansado: 'da' | 'espera' | 'nada';
  cobertura: Cobertura;
  veredicto: ReturnType<typeof veredictoDe>['clase'];
}) {
  const hayCansado = modoCansado !== 'nada';
  if (!h.carrera && !hayCansado) return null;

  const llega =
    veredicto === 'todavia-no'
      ? null
      : veredicto === 'mejor'
        ? { texto: 'Al ritmo de las últimas semanas, la tendencia te lleva ahí.', tono: tonoDe('mejor') }
        : veredicto === 'igual'
          ? { texto: 'Al ritmo de las últimas semanas, llegas parecido a como estás hoy.', tono: 'var(--twin-fg)' }
          : { texto: 'Al ritmo de las últimas semanas, no vas hacia ese tiempo.', tono: tonoDe(veredicto) };

  return (
    <Tramo
      titulo={h.carrera ? 'Tu carrera' : 'Correr cansado'}
      pie={h.carrera ? 'El día, el tiempo, y lo único de correr que de verdad transfiere.' : undefined}
    >
      {h.carrera && <Carrera historia={h.carrera} llega={llega} />}

      {modoCansado === 'da' && <Cansado h={h} />}
      {modoCansado === 'espera' && <Espera titulo="Lo que te cuesta correr cansado" falta={cobertura.cansado!} />}
    </Tramo>
  );
}

function Cansado({ h }: { h: Historia }) {
  const primero = h.cansado[0]!;
  const ultimo = h.cansado[h.cansado.length - 1]!;
  const mejora = primero.costeSkm - ultimo.costeSkm;
  const tono = mejora > 0 ? 'var(--twin-ok)' : mejora < 0 ? 'var(--twin-warning)' : 'var(--twin-fg)';

  return (
    <Pieza
      titulo="Lo que te cuesta correr cansado"
      tono={tono}
      lectura={
        mejora > 0
          ? `Cuando el kilómetro llega detrás de una estación pierdes ${esDecimal(ultimo.costeSkm)} s/km. Hace ${h.cansado.length} semanas perdías ${esDecimal(primero.costeSkm)}.`
          : mejora < 0
            ? `Cuando el kilómetro llega detrás de una estación pierdes ${esDecimal(ultimo.costeSkm)} s/km, ${esDecimal(-mejora)} más que hace ${h.cansado.length} semanas.`
            : `Cuando el kilómetro llega detrás de una estación pierdes ${esDecimal(ultimo.costeSkm)} s/km, lo mismo que hace ${h.cansado.length} semanas.`
      }
      marca="solo aquí"
      nota="En HYROX los ocho kilómetros llegan detrás de una estación, así que esto pesa más que tu ritmo en fresco. Ninguna app de correr lo tiene, porque ninguna sabe que antes hubo un trineo."
    >
      <LineaJuicio puntos={h.cansado.map((c) => ({ semana: c.semana, valor: c.costeSkm }))} formato={ejeCoste} />
    </Pieza>
  );
}
