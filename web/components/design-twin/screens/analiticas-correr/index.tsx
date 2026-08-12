'use client';

// LAS ANALÍTICAS DE CARRERA — ¿estoy mejorando?
//
// LA REGLA: **el dato es el dibujo.** El texto es pie, y casi siempre sobra.
//
// EL ACABADO SE MIDE CONTRA `lectura-carrera`, que Alex aprobó. Se estudió esa
// pantalla —mirándola, no de memoria— y de ahí salen las decisiones de este
// pase (12-ago), después de que la versión anterior se rechazara por fea:
//
//   · FONDO TINTADO. Allí el lienzo lo tiñe la zona de pulso de la sesión, y es
//     lo que más hace que una pantalla parezca esta app. Aquí no hay una zona
//     que valga para toda la pantalla, así que tiñe EL VEREDICTO, que es su
//     sujeto. Sin veredicto el tono es el apagado y el lienzo queda neutro.
//   · SUJETO CENTRADO Y CON AIRE. El veredicto ocupa arriba lo que allí ocupa
//     «5 de 6»: etiqueta versalita diminuta, display en cursiva, y espacio.
//   · CERO CAJAS Y CERO LÍNEAS DIVISORIAS. La referencia separa con la etiqueta
//     y el aire. Se han quitado todas las rayas; los bloques se agrupan por
//     distancia (24 dentro de un grupo, 48 entre grupos).
//   · TRAZOS FINOS SOBRE EL TINTE, sin rellenos de color, y los ejes en dos
//     cifras mono diminutas pegadas al borde izquierdo.
//   · EL NARANJA, UNA VEZ: la acción. Como allí.
//
// COLOR SOLO DONDE ES DATO. El VO₂máx iba en azul y ya no: un VO₂máx no es una
// zona. La línea del ritmo tampoco lleva color de zona — lo que se dibuja es el
// ritmo, y la zona es la condición, no la magnitud. El color de zona se queda
// donde se mide una zona (el reparto) y el verde donde hay veredicto.
//
// EL ANILLO SE FUE. Era el elemento más genérico de la pantalla: un donut vale
// para cualquier producto porque no significa nada en particular. Lo sustituye
// un punto por repetición, que además hace el trabajo de la barra divergente:
// el sesgo se ve solo, porque los fallos rápidos y los lentos tienen color
// distinto y se agrupan a la vista.

import { useEffect } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { distribucionZonas } from '../../zonas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Apagado, Barras, BarraReparto, CurvaEsfuerzos, Fondo, Linea, Marca, Plazo, Puntos } from './graficos';
import { ESCENAS } from './datos';
import {
  METODO,
  coberturaDe,
  deltasDe,
  colapso,
  faltaComun,
  salidaDe,
  seCalla,
  tonoDe,
  veredictoDe,
  ORDEN_COBERTURA,
  type Cobertura,
  type Deltas,
  type Falta,
  type RunningHistory,
} from './modelo';
// Los puntos de pliegue de polarización no son del motor de veredicto: son del
// método de FC del coach (`polarization_low_max_zone` / `polarization_mid_max_zone`),
// y `colapso()` los pide por parámetro. El servidor los lee de aquí mismo.
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';
import { Bloque, Boton, Cifra, Delta, Veredicto } from './piezas';

export const meta: TwinMeta = {
  id: 'analiticas-correr',
  titulo: 'Analíticas de correr — ¿estoy mejorando?',
  zona: 'Marcas y tests',
  estado: 'espejo',
  actualizado: '2026-08-12',
  descripcion:
    'El dato es el dibujo: veredicto de dos palabras sobre un lienzo teñido por ese veredicto, y debajo un gráfico grande por pregunta con la comparación dentro. Acabado medido contra lectura-carrera. El VO₂máx sale de Perfil y pasa a titular de la prueba de forma.',
  fuentes: [],
  enApp:
    'La pestaña existe (AnalyticsView + lib/athlete/analytics/running.ts) y ya sirve volumen, zonas, tendencia de ritmo y mejores marcas, en tarjetas. Lo nuevo: el veredicto, la curva de esfuerzos con sombra, el ritmo al mismo pulso y la adherencia agregada (los dos últimos ya se calculan por sesión y se tiran sin acumular), y el VO₂máx traído desde RendimientoSection en Perfil. El motor (veredicto, cobertura, escalera de evidencia) vive en shared/domain/running/progress.ts y lo sirve /api/athlete/analytics/running/progress: este doble ejecuta la misma función que la API, no una copia aparte.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'veterano',
    titulo: '① Siete meses dentro, y mejorando',
    descripcion:
      'El caso lleno, con el lienzo teñido de verde por el veredicto. La línea de puntos bajo la curva del ritmo es de dónde salió; la mancha entre las dos curvas de esfuerzos es la mejora del mes. Cuarenta y seis puntos, uno por serie corrida.',
  },
  {
    id: 'nuevo',
    titulo: '② Tres semanas · sin veredicto',
    descripcion:
      'El que separa un diseño honesto de uno que rellena. «Aún no», lienzo sin teñir porque no hay veredicto que lo tiña, y el plazo es una barra de seis semanas con tres llenas. Sin carrera y sin correr cansado: no le aplican y no existen.',
  },
  {
    id: 'cargando',
    titulo: '③ Cargando de más · el veredicto incómodo',
    descripcion:
      'Lienzo ámbar. La línea del ritmo cae por debajo de su propio fantasma, la mancha entre curvas sale ámbar en vez de verde, las barras rebasan la media de partida y trece puntos rojos delatan que sale pasado de rosca.',
  },
  {
    id: 'sin-zonas',
    titulo: '④ Sin test de umbral · dos lecturas apagadas',
    descripcion:
      'Sin zonas no hay forma ni reparto: las dos se pintan tenues con un candado y aparece UN botón, no dos textos pidiendo el mismo test. El veredicto baja al segundo peldaño (mejores esfuerzos) y sigue siendo defendible.',
  },
];

/** El orden lo manda el dominio, no la pantalla: si aquí dijera otra cosa, el
 *  servidor y la app discreparían sobre cuál es «la primera falta». */
const ORDEN = ORDEN_COBERTURA;

/** Dentro de un grupo. Entre grupos, el doble: se agrupa sin dibujar una raya. */
const DENTRO = S.xl;
const ENTRE = S.xxxl;

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const h: RunningHistory = ESCENAS[escenario] ?? ESCENAS.veterano!;
  const v = veredictoDe(h, METODO);
  const cob = coberturaDe(h, METODO);
  const deltas = deltasDe(h);

  const contables = ORDEN.map((k) => ({ k, f: cob[k] })).filter(
    (x): x is { k: keyof Cobertura; f: Falta } => x.f != null && !seCalla(x.f),
  );
  const comun = faltaComun(contables.map((x) => x.f));
  const salida = comun ? salidaDe(comun) : contables.length === 1 ? salidaDe(contables[0]!.f) : null;

  const modo = (k: keyof Cobertura): 'da' | 'apagada' | 'nada' => {
    const f = cob[k];
    if (f == null) return 'da';
    return seCalla(f) ? 'nada' : 'apagada';
  };

  useEffect(() => {
    onLog(`Veredicto: ${v.clase}${v.peldano ? ` · peldaño ${v.peldano.en}` : ' · sin evidencia'}`);
    onLog(
      `Apagadas: ${ORDEN.filter((k) => modo(k) === 'apagada').length} · calladas: ${ORDEN.filter((k) => modo(k) === 'nada').length}`,
    );
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const zonas = distribucionZonas({ duracionS: h.segundos_corriendo, zonasS: h.zonas_s });
  const reparto = colapso(zonas, DEFAULT_COACH_HR_METHOD.polarization_low_max_zone, DEFAULT_COACH_HR_METHOD.polarization_mid_max_zone);

  return (
    <div className="twin-screen-safe">
      {/* El tinte ES el veredicto, como en la referencia lo es la zona. */}
      <Fondo tono={tonoDe(v.clase)} appearance={appearance} />
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Analíticas" />}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: ENTRE,
            padding: `${S.m}px ${S.l}px ${S.xxl}px`,
          }}
        >
          <Rail />

          <div style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
            <Veredicto clase={v.clase} frase={v.frase}>
              {v.plazo ? <Plazo llevas={v.plazo.llevas} hacen={v.plazo.hacen} /> : null}
            </Veredicto>
            {salida && <Boton onClick={() => onLog(`Salida → ${salida}`)}>{salida}</Boton>}
          </div>

          {/* ── LO QUE SALE · el efecto ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: DENTRO }}>
            <Bloque etiqueta="Forma">
              {modo('forma') === 'da' ? (
                <>
                  <Cifra
                    valor={h.vo2 ? String(h.vo2.valor) : ritmoKm(Math.round(h.al_pulso[h.al_pulso.length - 1]!.valor))}
                    unidad={h.vo2 ? 'VO₂máx' : 'mismo pulso'}
                  >
                    <DeltaForma h={h} d={deltas} />
                  </Cifra>
                  <Linea puntos={h.al_pulso} formato={(s) => reloj(Math.round(s))} />
                  <Marca>{`Ritmo a ${h.ppm_referencia} ppm`}</Marca>
                </>
              ) : (
                <Apagado alto={124} />
              )}
            </Bloque>

            <Bloque etiqueta="Mejores esfuerzos">
              {/* Menor que los demás titulares por dos razones: a 44 px el mono
                  abre tanto los dos puntos que «19:12» se lee «19 : 12», y aquí
                  el sujeto del bloque es la CURVA — la cifra la acompaña. */}
              {mejor5k(h) && (
                <Cifra valor={mejor5k(h)!} unidad="5 km" tam={36}>
                  <DeltaEsfuerzos d={deltas} />
                </Cifra>
              )}
              <CurvaEsfuerzos hoy={h.esfuerzos} antes={h.esfuerzos_antes} />
            </Bloque>
          </div>

          {/* ── LO QUE METES · el trabajo ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: DENTRO }}>
            <Bloque etiqueta="Cuánto corres">
              <Cifra valor={esDecimal(h.semanas_km[h.semanas_km.length - 1]!.valor, 0)} unidad="km" tam={44}>
                <DeltaVolumen d={deltas} />
              </Cifra>
              <Barras puntos={h.semanas_km} />
            </Bloque>

            <Bloque etiqueta="Suave y fuerte">
              {modo('reparto') === 'da' && zonas.length > 0 ? (
                <>
                  <Cifra valor={String(reparto.suave)} unidad="% suave" tam={44} />
                  <BarraReparto segmentos={zonas} objetivoSuave={METODO.reparto.suave} />
                </>
              ) : (
                <Apagado alto={72} />
              )}
            </Bloque>
          </div>

          {modo('pedido') === 'da' && h.pedido && <BloquePedido h={h} />}

          <TramoCarrera h={h} modoCansado={modo('cansado')} clase={v.clase} />
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
    <div className="twin-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
      {SECCIONES.map((s, i) => (
        <span
          key={s}
          style={{
            flex: '0 0 auto',
            padding: '5px 12px',
            borderRadius: R.pill,
            font: '700 12px/1.2 var(--twin-font-sans)',
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
// Las variaciones. Cada una es un número y su ventana: nunca una oración.
// ---------------------------------------------------------------------------

function DeltaForma({ h, d }: { h: RunningHistory; d: Deltas }) {
  if (h.vo2) {
    // NULO, no cero: la serie aún no da para una base. Un 0 diría «lo medimos
    // y no se movió», y lo que pasa es que no hay contra qué compararlo.
    if (h.vo2.delta === null) return null;
    if (h.vo2.delta === 0) return <Delta mejor={null} valor="0" ventana={`${h.vo2.ventana_semanas} sem`} />;
    return <Delta mejor={h.vo2.delta > 0} valor={String(Math.abs(h.vo2.delta))} ventana={`${h.vo2.ventana_semanas} sem`} />;
  }
  if (!d.forma) return null;
  const { gana_s_km, semanas } = d.forma;
  return <Delta mejor={gana_s_km > 0} valor={`${Math.abs(Math.round(gana_s_km))} s`} ventana={`${semanas} sem`} />;
}

function DeltaEsfuerzos({ d }: { d: Deltas }) {
  if (!d.esfuerzos) return null;
  const { gana_s } = d.esfuerzos;
  return <Delta mejor={gana_s > 0} valor={`${Math.abs(gana_s)} s`} ventana="1 mes" />;
}

function DeltaVolumen({ d }: { d: Deltas }) {
  if (!d.volumen) return null;
  const { subida_ratio, semanas } = d.volumen;
  // El volumen NO juzga: subir no es bueno ni malo por sí mismo, así que la
  // flecha va neutra. De la combinación ya se ocupa el veredicto de arriba.
  // El ratio llega servido — es el MISMO número con el que el servidor decidió
  // «cargando de más», así que la cifra y el veredicto no pueden discrepar.
  return (
    <Delta mejor={null} valor={`${subida_ratio > 0 ? '+' : ''}${Math.round(subida_ratio * 100)}%`} ventana={`${semanas} sem`} />
  );
}

/** Nulo si no lo tiene: un guion es una casilla vacía disfrazada de dato (§7). */
function mejor5k(h: RunningHistory): string | null {
  const cinco = h.esfuerzos.find((e) => e.metros === 5000);
  return cinco ? reloj(cinco.segundos) : null;
}

// ---------------------------------------------------------------------------
// LO QUE TE PIDEN — un punto por repetición
// ---------------------------------------------------------------------------

function BloquePedido({ h }: { h: RunningHistory }) {
  const p = h.pedido!;
  // El porcentaje y el «se puede juzgar» llegan SERVIDOS: los saca el mismo
  // sumador que ya juzga cada tramo. Dividir aquí era repetir esa división, y
  // el redondeo de este lado decidía si la cifra se pintaba verde.
  const pct = p.pct_en_banda;
  const tono = !p.juzgable
    ? 'var(--twin-fg)'
    : pct != null && pct >= METODO.good_in_band_pct
      ? 'var(--twin-ok)'
      : 'var(--twin-warning)';
  if (pct == null) return null;

  return (
    <Bloque etiqueta="Lo que te piden" sello>
      <Cifra valor={String(pct)} unidad="% en banda" tam={44} tono={tono} />
      <Puntos dentro={p.dentro} lento={p.fuera_lento} rapido={p.fuera_rapido} />
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// TU CARRERA — existe si hay carrera, o si hay algo que decir de correr
// cansado. Si no hay ninguna de las dos, no hay bloque: la app se calla.
// ---------------------------------------------------------------------------

function TramoCarrera({
  h,
  modoCansado,
  clase,
}: {
  h: RunningHistory;
  modoCansado: 'da' | 'apagada' | 'nada';
  clase: ReturnType<typeof veredictoDe>['clase'];
}) {
  if (!h.carrera && modoCansado === 'nada') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: DENTRO }}>
      {h.carrera && (
        <Bloque etiqueta={h.carrera.nombre}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.xl, flexWrap: 'wrap' }}>
            <Cifra valor={String(h.carrera.dias)} unidad="días" tam={44} />
            {h.carrera.predicho_s != null && (
              <Cifra valor={reloj(h.carrera.predicho_s)} unidad="previsto" tam={30} tono={tonoDe(clase)} />
            )}
          </div>
        </Bloque>
      )}

      {modoCansado === 'da' && <BloqueCansado h={h} />}
      {modoCansado === 'apagada' && (
        <Bloque etiqueta="Correr cansado" sello>
          <Apagado alto={88} />
        </Bloque>
      )}
    </div>
  );
}

function BloqueCansado({ h }: { h: RunningHistory }) {
  const primero = h.cansado[0]!;
  const ultimo = h.cansado[h.cansado.length - 1]!;
  const mejora = primero.coste_s_km - ultimo.coste_s_km;

  return (
    <Bloque etiqueta="Correr cansado" sello>
      <Cifra
        valor={esDecimal(ultimo.coste_s_km)}
        unidad="s/km de más"
        tam={44}
        tono={mejora > 0 ? 'var(--twin-ok)' : 'var(--twin-warning)'}
      >
        <Delta mejor={mejora > 0} valor={esDecimal(Math.abs(mejora))} ventana={`${h.cansado.length - 1} sem`} />
      </Cifra>
      <Linea puntos={h.cansado.map((c) => ({ semana: c.semana, valor: c.coste_s_km }))} formato={(x) => esDecimal(x)} alto={128} />
    </Bloque>
  );
}
