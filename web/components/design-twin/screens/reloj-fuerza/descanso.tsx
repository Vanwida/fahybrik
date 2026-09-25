'use client';

// EL DESCANSO QUE ANOTA — la fase común (P8) con la serie recién hecha dentro.
//
// Tres vistas del mismo descanso, sin salir de él (la cuenta atrás, el
// preaviso, el 3-2-1 y el GO siguen siendo los del kit):
//
//   columnas  (una serie) reps · kg · RIR como tres datos que se tocan; el
//             tocado se enciende (naranja = control activo) y la corona lo
//             gira. Gris = propuesto, «sin confirmar»; blanco = declarado.
//             La cuenta atrás baja a la línea de arriba: ahora manda el dato.
//   lista     (superserie) una píldora por serie de la ronda; tocarla abre
//             sus columnas.
//   resumen   todo declarado: vuelve el descanso del kit —la cuenta atrás de
//             héroe— con la serie en una línea «✓ …» que se puede reabrir.
//
// La acción del momento (doble toque, botón Acción, el botón naranja) es
// «Confirmar» mientras quede algo propuesto, y «Empezar ya» después. Con un
// dato encendido, la corona lo gira: la enfoca el vivo (`VistaVivo.corona`).

import {
  ANCHO_UTIL,
  BotonesDescanso,
  C,
  Centro,
  Columna,
  ContextoLinea,
  Descanso,
  Marca,
  Nota,
  T,
  VieneLinea,
  anchoTexto,
  faltaDe,
  fmtReloj,
  vieneEnUna,
  type Lecturas,
  type Paso,
  type PasoFuerza,
  type Viene,
} from '../../kit-reloj';
import { camposPendientes, fmtValor, pendiente, textoAnotacion, type Anotacion, type Campo, type Dato } from './anotar';

export interface SerieAnotable {
  paso: PasoFuerza;
  anot: Anotacion;
  /** «0,67 m/s · confianza media»: la media de la serie, si la midió el sensor. */
  velocidad: string | null;
}

export type VistaDescanso = 'resumen' | 'lista' | 'columnas';

export interface DescansoFuerzaProps {
  paso: Paso;
  lecturas: Lecturas;
  viene: Viene | null;
  series: SerieAnotable[];
  vista: VistaDescanso;
  abierta: number | null;
  foco: Campo | null;
  pistaCorona: string | null;
  onAbrir: (k: number) => void;
  onFoco: (c: Campo) => void;
  onResumen: () => void;
  onMas30: () => void;
}

/** Una serie en una píldora (≥ 32 pt, se toca para abrirla). */
function Pildora({ slot, texto, hecha, onPulsa }: { slot?: string; texto: string; hecha: boolean; onPulsa: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPulsa();
      }}
      style={{
        width: '100%',
        maxWidth: 178,
        height: 32,
        flex: '0 0 auto',
        border: 0,
        borderRadius: 16,
        background: C.superficie2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 12px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {slot ? <span style={{ fontSize: T.nota.cuerpo, fontWeight: 600, color: C.tinta2 }}>{slot}</span> : null}
      <span style={{ fontSize: T.boton.cuerpo, fontWeight: 600, color: hecha ? C.tinta : C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{texto}</span>
      <Marca hecha={hecha} />
    </button>
  );
}

interface Columna3 {
  campo: Campo;
  dato: Dato;
  etiqueta: string;
}

function camposDe(s: SerieAnotable): Columna3[] {
  const f = s.paso.fuerza;
  const out: Columna3[] = [{ campo: 'reps', dato: s.anot.reps, etiqueta: s.anot.reps.estado === 'medido' ? 'reloj' : 'reps' }];
  if (s.anot.kg) out.push({ campo: 'kg', dato: s.anot.kg, etiqueta: f.carga.tipo === 'tuya' && f.carga.lastre ? 'kg lastre' : 'kg' });
  if (s.anot.esfuerzo && f.esfuerzo) out.push({ campo: 'esfuerzo', dato: s.anot.esfuerzo, etiqueta: f.esfuerzo.eje === 'rir' ? 'RIR' : 'RPE' });
  return out;
}

const HUECO_COL = 4;
const PADDING_COL = 5;

/** Los datos de la serie como columnas que se tocan; a 30 pt si caben las tres, si no a 22. */
function Columnas({ serie, foco, onFoco }: { serie: SerieAnotable; foco: Campo | null; onFoco: (c: Campo) => void }) {
  const campos = camposDe(serie);
  const anchoDe = (c: Columna3, cuerpo: number) =>
    Math.max(48, Math.max(anchoTexto(fmtValor(c.dato.valor), cuerpo), anchoTexto(c.etiqueta, T.nota.cuerpo, T.nota.peso)) + 2 * PADDING_COL);
  const total = (cuerpo: number) => campos.reduce((a, c) => a + anchoDe(c, cuerpo), 0) + HUECO_COL * (campos.length - 1);
  const cuerpo = total(T.segundo.cuerpo) <= ANCHO_UTIL - 6 ? T.segundo.cuerpo : T.tercero.cuerpo;
  return (
    <div style={{ display: 'flex', gap: HUECO_COL, justifyContent: 'center', width: '100%', flex: '0 0 auto' }}>
      {campos.map((c) => (
        <button
          key={c.campo}
          type="button"
          aria-pressed={foco === c.campo}
          onClick={(e) => {
            e.stopPropagation();
            onFoco(c.campo);
          }}
          style={{
            width: anchoDe(c, cuerpo),
            height: 58,
            padding: `0 ${PADDING_COL}px`,
            border: 0,
            borderRadius: 16,
            background: C.superficie,
            boxShadow: foco === c.campo ? `inset 0 0 0 2px ${C.accion}` : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: 'box-shadow 150ms ease',
          }}
        >
          <span style={{ fontSize: cuerpo, fontWeight: 600, lineHeight: 1, color: c.dato.estado === 'propuesto' ? C.tinta2 : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
            {fmtValor(c.dato.valor)}
          </span>
          <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, lineHeight: 1, color: C.tinta2, whiteSpace: 'nowrap' }}>{c.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}

/** «Serie 2», «A1 · serie 1», «Ronda 1». */
function quien(series: SerieAnotable[], k: number | null): string {
  if (k == null) return `Ronda ${series[0]?.paso.posicion?.serie?.n ?? ''}`;
  const p = series[k]!.paso;
  const n = p.posicion?.serie?.n ?? '';
  return series.length > 1 && p.posicion?.slot ? `${p.posicion.slot} · serie ${n}` : `Serie ${n}`;
}

function estadoTexto(pendientes: number, total: number): string {
  if (pendientes === 0) return 'anotada ✓';
  return pendientes === total ? 'sin confirmar' : `${pendientes} sin confirmar`;
}

/** «sin confirmar», «kg sin confirmar» (si ya solo falta uno) o «anotada ✓». */
function estadoSerie(s: SerieAnotable): string {
  const faltan = camposPendientes(s.anot);
  const total = [s.anot.reps, s.anot.kg, s.anot.esfuerzo].filter(Boolean).length;
  if (faltan.length === 0) return 'anotada ✓';
  if (faltan.length === 1 && total > 1) return `${camposDe(s).find((x) => x.campo === faltan[0])?.etiqueta ?? ''} sin confirmar`;
  return 'sin confirmar';
}

export function DescansoFuerza(p: DescansoFuerzaProps) {
  const cuenta = fmtReloj(Math.ceil(faltaDe(p.paso, p.lecturas) ?? 0));

  if (p.vista === 'resumen') {
    // El descanso común del kit, sin pulso y con la serie en una píldora que se reabre.
    const resumen =
      p.series.length === 0 ? null : p.series.length === 1 ? textoAnotacion(p.series[0]!.anot, p.series[0]!.paso.fuerza) : `${quien(p.series, null)} anotada`;
    return (
      <Descanso
        paso={p.paso}
        lecturas={p.lecturas}
        onMas30={p.onMas30}
        viene={p.viene}
        pulso={false}
        hueco={resumen ? { alto: 32, nodo: <Pildora texto={resumen} hecha onPulsa={p.onResumen} /> } : null}
      />
    );
  }

  const pendientes = p.series.filter((s) => pendiente(s.anot)).length;

  if (p.vista === 'lista') {
    const visibles = p.series.length <= 2 ? p.series : p.series.slice(0, 1);
    const resto = p.series.length - visibles.length;
    return (
      <Columna>
        <ContextoLinea partes={['Descanso', cuenta]} />
        <Centro>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Nota>{`${quien(p.series, null)} · ${estadoTexto(pendientes, p.series.length)}`}</Nota>
            {visibles.map((s, k) => (
              <Pildora key={s.paso.id} slot={s.paso.posicion?.slot} texto={textoAnotacion(s.anot, s.paso.fuerza)} hecha={!pendiente(s.anot)} onPulsa={() => p.onAbrir(k)} />
            ))}
            {resto > 0 ? <Pildora texto={`+${resto} series`} hecha={false} onPulsa={() => p.onAbrir(1)} /> : null}
            {p.viene ? <VieneLinea v={p.viene} /> : null}
          </div>
        </Centro>
        <BotonesDescanso etiqueta={pendientes > 0 ? 'Confirmar' : 'Listo'} onMas30={p.onMas30} />
      </Columna>
    );
  }

  const k = p.abierta ?? 0;
  const s = p.series[k];
  if (!s) return null;
  const pend = pendiente(s.anot);
  return (
    <Columna>
      <ContextoLinea partes={['Descanso', cuenta]} />
      <Centro>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <Nota>{`${quien(p.series, k)} · ${estadoSerie(s)}`}</Nota>
          <Columnas serie={s} foco={p.foco} onFoco={p.onFoco} />
          {s.velocidad ? <Nota>{s.velocidad}</Nota> : null}
          {p.foco && p.pistaCorona ? (
            <Nota tono={C.tinta}>{p.pistaCorona}</Nota>
          ) : p.viene && !(s.velocidad && !vieneEnUna(p.viene)) ? (
            // Con la velocidad, «Viene:» en dos líneas no cabe: vuelve al confirmar.
            <VieneLinea v={p.viene} />
          ) : null}
        </div>
      </Centro>
      <BotonesDescanso etiqueta={pend ? 'Confirmar' : 'Listo'} onMas30={p.onMas30} />
    </Columna>
  );
}
