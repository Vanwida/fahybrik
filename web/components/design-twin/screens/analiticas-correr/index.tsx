'use client';

// LAS ANALÍTICAS DE CARRERA — ¿estoy mejorando?
//
// LA REGLA: **el dato es el dibujo.** El texto es pie, y casi siempre sobra.
//
// La primera versión (12-ago) razonaba bien y se leía como un informe: un
// veredicto y debajo párrafos explicando cada gráfica. Alex la rechazó por eso,
// y tenía razón — Garmin y Whoop no explican con frases, enseñan un anillo, una
// curva grande, una banda de color. Se leen de un vistazo, sin leer.
//
// LO QUE CAMBIÓ, y ninguno es cosmético:
//
// 1 · CADA BLOQUE NACE DE UN GRÁFICO. Primero qué forma cuenta el hecho —curva,
//     barras, anillo, banda, plazo—, y solo después, si hace falta, una cifra.
//     Lo que no se podía dibujar se borró: no se reescribió más corto.
//
// 2 · LA COMPARACIÓN SE DIBUJA. «Hace 4 semanas perdías 15,5» era una frase;
//     ahora es un punto hueco y una línea de puntos, y la distancia entre esa
//     línea y el trazo ES la mejora. La curva de esfuerzos rellena el hueco
//     contra la de hace un mes: esa mancha verde es el progreso.
//
// 3 · LO QUE FALTA SE ENSEÑA APAGADO, NO EXPLICADO. Una lectura sin cobertura
//     se pinta en gris con un candado; el único texto es un botón. Y el «aún
//     no» del recién llegado es una barra de semanas que se llena.
//
// 4 · EL VO₂MÁX SALE DE PERFIL Y VIENE AQUÍ, de titular de la prueba de forma
//     (ver `modelo.ts`). Es de lo que más se mira y estaba archivado entre los
//     ajustes; su sitio es donde el atleta pregunta si está mejorando.
//
// LO QUE NO SE TOCÓ: la honestidad. El recién llegado sigue sin veredicto, la
// petición del test sigue saliendo una sola vez y una lectura que no aplica
// sigue sin existir. Solo que ahora eso también se dibuja.
//
// COMPOSICIÓN. Arquetipo Detalle, estrategia **llena**: el veredicto manda el
// primer tercio y por debajo scrollea un bloque por pregunta, separados por
// raya y aire, sin una sola tarjeta. Es pantalla raíz del TabView, así que la
// barra de pestañas se pinta y el alto disponible se mide de verdad.

import { useEffect } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { colorZona } from '../../kit-vivo';
import { distribucionZonas } from '../../zonas';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS } from './datos';
import { Anillo, Barras, BarraReparto, Bloqueado, CurvaEsfuerzos, Divergente, Linea, Marca, Plazo } from './graficos';
import {
  METODO,
  coberturaDe,
  faltaComun,
  salidaDe,
  sePuedeJuzgarElPedido,
  seCalla,
  subidaDeVolumen,
  tonoDe,
  veredictoDe,
  type Cobertura,
  type Falta,
  type Historia,
} from './modelo';
import { Bloque, Boton, Cifra, Delta, Raya, Veredicto } from './piezas';

export const meta: TwinMeta = {
  id: 'analiticas-correr',
  titulo: 'Analíticas de correr — ¿estoy mejorando?',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-12',
  descripcion:
    'El dato es el dibujo: un veredicto de tres palabras y, debajo, un gráfico grande por pregunta con la comparación dentro. El VO₂máx sale de Perfil y pasa a ser el titular de la prueba de forma. Lo que no se puede afirmar se enseña apagado con un candado, no explicado.',
  fuentes: [],
  enApp:
    'La pestaña existe (AnalyticsView + lib/athlete/analytics/running.ts) y ya sirve volumen, zonas, tendencia de ritmo y mejores marcas, en tarjetas. Lo nuevo: el veredicto, la curva de esfuerzos con sombra, el ritmo al mismo pulso y la adherencia agregada (los dos últimos ya se calculan por sesión y se tiran), y el VO₂máx traído desde RendimientoSection en Perfil.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'veterano',
    titulo: '① Siete meses dentro, y mejorando',
    descripcion:
      'El caso lleno. VO₂máx de titular, y debajo la curva del ritmo al mismo pulso con la línea de puntos de dónde salió. En mejores esfuerzos, la mancha verde entre las dos curvas es la mejora del mes.',
  },
  {
    id: 'nuevo',
    titulo: '② Tres semanas · sin veredicto',
    descripcion:
      'El que separa un diseño honesto de uno que rellena. El veredicto es «Aún no» y el plazo es una barra de seis semanas con tres llenas. Sin sombra en la curva, sin carrera y sin correr cansado: la pantalla sale corta y esa es la respuesta correcta.',
  },
  {
    id: 'cargando',
    titulo: '③ Cargando de más · el veredicto incómodo',
    descripcion:
      'Volumen subiendo y motor respondiendo peor, sin una frase que lo explique: la línea del ritmo cae, las barras rebasan la media de partida y el reparto enseña un tercio en verde de Z3 con la marca del coach muy a la derecha.',
  },
  {
    id: 'sin-zonas',
    titulo: '④ Sin test de umbral · dos lecturas apagadas',
    descripcion:
      'Sin zonas no hay forma ni reparto. Las dos se pintan en gris con candado y aparece UN botón; no hay dos textos pidiendo el mismo test. El veredicto baja al segundo peldaño y sigue siendo defendible.',
  },
];

/** El botón sale una vez, y lo que abre se ve apagado. Cero prosa. */
const ORDEN: (keyof Cobertura)[] = ['forma', 'esfuerzos', 'volumen', 'reparto', 'pedido', 'cansado'];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const h: Historia = ESCENAS[escenario] ?? ESCENAS.veterano!;
  const v = veredictoDe(h);
  const cob = coberturaDe(h);

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
    const apagadas = ORDEN.filter((k) => modo(k) === 'apagada');
    const calladas = ORDEN.filter((k) => modo(k) === 'nada');
    onLog(`Apagadas: ${apagadas.length} · calladas: ${calladas.length}`);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const zonas = distribucionZonas({ duracionS: h.segundosCorriendo, zonasS: h.zonasS });
  const tonoZona = colorZona(h.zonaReferencia);

  return (
    <div className="twin-screen-safe">
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Analíticas" />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xl, padding: `${S.m}px ${S.m}px ${S.xxl}px` }}>
          <Rail />

          <Veredicto clase={v.clase} frase={v.frase}>
            {v.plazo ? <Plazo llevas={v.plazo.llevas} hacen={v.plazo.hacen} /> : null}
          </Veredicto>

          {salida && <Boton onClick={() => onLog(`Salida → ${salida}`)}>{salida}</Boton>}

          <Raya />

          {/* ── FORMA · el VO₂máx de titular, el ritmo al mismo pulso de prueba ── */}
          <Bloque etiqueta="Forma">
            {modo('forma') === 'da' ? (
              <>
                <Cifra valor={h.vo2 ? String(h.vo2.valor) : ritmoKm(Math.round(h.alPulso[h.alPulso.length - 1]!.valor))} unidad={h.vo2 ? 'VO₂máx' : 'al mismo pulso'} tono={tonoZona}>
                  <DeltaForma h={h} />
                </Cifra>
                <Linea
                  puntos={h.alPulso}
                  color={tonoZona}
                  formato={(s) => reloj(Math.round(s))}
                />
                <Marca>{`Ritmo a ${h.ppmReferencia} ppm`}</Marca>
              </>
            ) : (
              <Bloqueado alto={132} />
            )}
          </Bloque>

          <Raya />

          {/* ── MEJORES ESFUERZOS · la curva entera con la sombra del mes ────── */}
          <Bloque etiqueta="Mejores esfuerzos">
            {/* Un poco menor que el resto de titulares: a 56 px la cifra mono
                abre tanto los dos puntos que «19:12» se lee «19 : 12». */}
            {mejor5k(h) && (
              <Cifra valor={mejor5k(h)!} unidad="5 km" tam={46}>
                <DeltaEsfuerzos h={h} />
              </Cifra>
            )}
            <CurvaEsfuerzos hoy={h.esfuerzos} antes={h.esfuerzosAntes} />
          </Bloque>

          <Raya />

          {/* ── CARGA · cuánto, y cómo lo reparte ───────────────────────────── */}
          <Bloque etiqueta="Cuánto corres">
            <Cifra valor={esDecimal(h.semanasKm[h.semanasKm.length - 1]!.valor, 0)} unidad="km esta semana">
              <DeltaVolumen h={h} />
            </Cifra>
            <Barras puntos={h.semanasKm} />
          </Bloque>

          <Bloque etiqueta="Suave y fuerte">
            {modo('reparto') === 'da' && zonas.length > 0 ? (
              <BarraReparto segmentos={zonas} objetivoSuave={METODO.reparto.suave} />
            ) : (
              <Bloqueado alto={72} />
            )}
          </Bloque>

          <Raya />

          {/* ── LO QUE TE PIDEN · anillo y sesgo, sin una frase ─────────────── */}
          {modo('pedido') === 'da' && h.pedido && <BloquePedido h={h} />}

          {/* ── TU CARRERA · el día, el tiempo, y correr cansado ────────────── */}
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
// Las variaciones. Cada una es un número y su ventana: nunca una oración.
// ---------------------------------------------------------------------------

function DeltaForma({ h }: { h: Historia }) {
  if (h.vo2) {
    if (h.vo2.delta === 0) return <Delta mejor={null} valor="0" ventana={`${h.vo2.ventanaSemanas} sem`} />;
    return <Delta mejor={h.vo2.delta > 0} valor={String(Math.abs(h.vo2.delta))} ventana={`${h.vo2.ventanaSemanas} sem`} />;
  }
  const gana = h.alPulso[0]!.valor - h.alPulso[h.alPulso.length - 1]!.valor;
  return <Delta mejor={gana > 0} valor={`${Math.abs(Math.round(gana))} s/km`} ventana={`${h.alPulso.length - 1} sem`} />;
}

function DeltaEsfuerzos({ h }: { h: Historia }) {
  const hoy = h.esfuerzos.find((e) => e.metros === 5000);
  const antes = h.esfuerzosAntes.find((e) => e.metros === 5000);
  if (!hoy || !antes) return null;
  const dif = antes.segundos - hoy.segundos;
  return <Delta mejor={dif > 0} valor={`${Math.abs(dif)} s`} ventana="1 mes" />;
}

function DeltaVolumen({ h }: { h: Historia }) {
  if (h.semanasKm.length < 6) return null;
  const subida = subidaDeVolumen(h.semanasKm);
  // El volumen NO juzga: subir no es bueno ni malo por sí mismo, así que la
  // flecha va neutra. Lo que sí avisa es la combinación, y de eso ya se ocupa
  // el veredicto de arriba.
  return <Delta mejor={null} valor={`${subida > 0 ? '+' : ''}${Math.round(subida * 100)}%`} ventana={`${h.semanasKm.length - 1} sem`} />;
}

/** Nulo si no lo tiene: un guion es una casilla vacía disfrazada de dato (§7). */
function mejor5k(h: Historia): string | null {
  const cinco = h.esfuerzos.find((e) => e.metros === 5000);
  return cinco ? reloj(cinco.segundos) : null;
}

// ---------------------------------------------------------------------------
// LO QUE TE PIDEN — anillo a la izquierda, sesgo a la derecha
// ---------------------------------------------------------------------------

function BloquePedido({ h }: { h: Historia }) {
  const p = h.pedido!;
  const pct = Math.round((p.dentro / p.evaluadas) * 100);
  const juzgable = sePuedeJuzgarElPedido(p);
  // Con pocas repeticiones el porcentaje existe pero no se puede juzgar: el
  // anillo sale en tinta normal en vez de verde. El juicio es el color.
  const tono = !juzgable ? 'var(--twin-fg)' : pct >= METODO.enBandaBienPct ? 'var(--twin-ok)' : 'var(--twin-warning)';

  return (
    <>
      <Raya />
      <Bloque etiqueta="Lo que te piden" sello>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.l }}>
          <Anillo pct={pct} tono={tono} alto={124} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S.s }}>
            <Divergente lento={p.fueraLento} dentro={p.dentro} rapido={p.fueraRapido} />
            <Marca>{`${p.dentro} de ${p.evaluadas} en banda`}</Marca>
          </div>
        </div>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// TU CARRERA — existe si hay carrera, o si hay algo que decir de correr
// cansado. Si no hay ninguna de las dos, no hay bloque: la app se calla.
// ---------------------------------------------------------------------------

function TramoCarrera({ h, modoCansado, clase }: { h: Historia; modoCansado: 'da' | 'apagada' | 'nada'; clase: ReturnType<typeof veredictoDe>['clase'] }) {
  if (!h.carrera && modoCansado === 'nada') return null;

  return (
    <>
      <Raya />
      {h.carrera && (
        <Bloque etiqueta="Tu carrera">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.l, flexWrap: 'wrap' }}>
            <Cifra valor={String(h.carrera.dias)} unidad="días" tam={44} />
            {h.carrera.predichoS != null && (
              <Cifra valor={reloj(h.carrera.predichoS)} unidad="previsto" tam={30} tono={tonoDe(clase)} />
            )}
          </div>
          <Marca>{h.carrera.nombre}</Marca>
        </Bloque>
      )}

      {modoCansado === 'da' && <BloqueCansado h={h} />}
      {modoCansado === 'apagada' && (
        <Bloque etiqueta="Correr cansado" sello>
          <Bloqueado alto={96} />
        </Bloque>
      )}
    </>
  );
}

function BloqueCansado({ h }: { h: Historia }) {
  const primero = h.cansado[0]!;
  const ultimo = h.cansado[h.cansado.length - 1]!;
  const mejora = primero.costeSkm - ultimo.costeSkm;

  return (
    <Bloque etiqueta="Correr cansado" sello>
      <Cifra valor={esDecimal(ultimo.costeSkm)} unidad="s/km de más" tam={44} tono={mejora > 0 ? 'var(--twin-ok)' : 'var(--twin-warning)'}>
        <Delta mejor={mejora > 0} valor={esDecimal(Math.abs(mejora))} ventana={`${h.cansado.length - 1} sem`} />
      </Cifra>
      <Linea
        puntos={h.cansado.map((c) => ({ semana: c.semana, valor: c.costeSkm }))}
        formato={(v) => `${esDecimal(v)} s`}
        alto={140}
      />
    </Bloque>
  );
}
