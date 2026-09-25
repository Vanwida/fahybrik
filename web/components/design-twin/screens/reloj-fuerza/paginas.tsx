'use client';

// LA CORONA EN FUERZA — Serie → Ejercicios → Datos.
//
//   Ejercicios  la hoja del coach: lo hecho apagado con su cuenta («4/4»), el
//               bloque en curso abierto serie a serie con lo anotado (✓
//               declarado, anillo sin confirmar, «ahora», y lo que viene con
//               su carga en cascada), y lo que falta con su dosis.
//   Datos       la sesión: tiempo, series hechas, volumen (reps × kg) y el
//               pulso con su zona. Lo que siga sin confirmar se dice.
//
// Una ventana alrededor de «ahora» si no cabe todo: nunca scroll dentro de
// una página de la corona.

import {
  ALTO_UTIL,
  ANCHO_PIE,
  C,
  Columna,
  ContextoLinea,
  Marca,
  Nota,
  PaginaFilas,
  T,
  dosisEjercicio,
  dosisSerie,
  esFuerza,
  fmtDuracion,
  fmtPrescrito,
  fmtReloj,
  type EstadoSecuencia,
  type PlanSesion,
  type Simulador,
  type ZonasCoach,
} from '../../kit-reloj';
import { anotacionDe, cargaArrastrada, medidaDe, pendiente, textoAnotacion, volumen, type Registro } from './anotar';
import { anteriorTrabajo, ejerciciosDe, fmtMiles, siguienteTrabajo, type Ejercicio } from './modelo';

type MarcaLinea = 'hecha' | 'propuesta' | 'ahora' | 'luego';

type LineaEj =
  | { tipo: 'ej'; slot?: string; nombre: string; sinConfirmar: boolean; estado: 'hecho' | 'ahora' | 'pendiente'; ahora: boolean }
  | { tipo: 'serie'; n: number | null; texto: string; marca: MarcaLinea; ahora: boolean };

const ALTO = { ej: 24, serie: 21 } as const;

function estadoDe(e: Ejercicio, i: number): 'hecho' | 'ahora' | 'pendiente' {
  if (e.pasos.every((j) => j < i)) return 'hecho';
  if (e.pasos.some((j) => j <= i)) return 'ahora';
  return 'pendiente';
}

/**
 * Todas las líneas de la hoja. Se abre serie a serie el ejercicio de «ahora»
 * (en un descanso, el que se acaba de hacer) y, en superserie, sus
 * compañeros de ronda. Lo hecho, cerrado; lo que falta, con su dosis debajo.
 */
function lineas(plan: PlanSesion, e: EstadoSecuencia, registro: Registro, sim: Simulador): LineaEj[] {
  const i = e.i;
  const paso = plan.pasos[i]!;
  const ref = paso.rol === 'trabajo' ? i : (anteriorTrabajo(plan, i) ?? siguienteTrabajo(plan, i) ?? i);
  const pRef = plan.pasos[ref]!;
  const out: LineaEj[] = [];
  for (const ej of ejerciciosDe(plan)) {
    const estado = estadoDe(ej, i);
    const primero = plan.pasos[ej.pasos[0]!]!;
    const trabajo = ej.pasos.filter((j) => {
      const q = plan.pasos[j];
      return !(esFuerza(q) && q.fuerza.aproximacion);
    });
    const anot = (j: number) => anotacionDe(plan, j, registro, medidaDe(plan, e, j, sim));
    const sinConfirmar = trabajo.some((j) => {
      const a = j < i ? anot(j) : null;
      return !!a && plan.pasos[j]!.medida.tipo === 'reps' && pendiente(a);
    });
    const abierto =
      esFuerza(primero) && (ej.pasos.includes(ref) || (!!ej.slot && !!pRef.posicion?.slot && ej.bloque === (pRef.bloque ?? 0) && estado !== 'pendiente'));
    out.push({ tipo: 'ej', slot: ej.slot, nombre: ej.nombre, sinConfirmar: sinConfirmar && !abierto, estado, ahora: ej.pasos.includes(ref) });
    if (estado === 'pendiente' && !abierto) {
      const dosis = esFuerza(primero) ? dosisEjercicio(primero, ej.series) : [ej.series > 1 ? `${ej.series} ×` : '', fmtPrescrito(primero.medida)].filter(Boolean).join(' ');
      out.push({ tipo: 'serie', n: null, texto: dosis, marca: 'luego', ahora: false });
      continue;
    }
    if (!abierto) continue;
    for (const j of trabajo) {
      const q = plan.pasos[j]!;
      if (!esFuerza(q)) continue;
      const n = q.posicion?.serie?.n ?? 0;
      if (j < i) {
        const m = medidaDe(plan, e, j, sim);
        if (q.medida.tipo === 'tiempo') {
          out.push({ tipo: 'serie', n, texto: fmtDuracion(Math.round(m?.segundos ?? q.medida.prescrito ?? 0)), marca: 'hecha', ahora: false });
          continue;
        }
        const a = anot(j)!;
        out.push({ tipo: 'serie', n, texto: textoAnotacion(a, q.fuerza, false), marca: pendiente(a) ? 'propuesta' : 'hecha', ahora: false });
      } else {
        const ahora = j === i;
        out.push({ tipo: 'serie', n, texto: dosisSerie(q, cargaArrastrada(plan, j, registro)), marca: ahora ? 'ahora' : 'luego', ahora });
      }
    }
  }
  return out;
}

/** La ventana que cabe: desde un poco antes de «ahora». */
function ventana(ls: LineaEj[], alto: number): LineaEj[] {
  const kEj = Math.max(0, ls.findIndex((l) => l.tipo === 'ej' && l.ahora));
  const kSerie = ls.findIndex((l) => l.tipo === 'serie' && l.ahora);
  const foco = kSerie >= 0 ? kSerie : kEj;
  const cabe = (d: number) => {
    let h = 0;
    let n = 0;
    for (let x = d; x < ls.length && h + ALTO[ls[x]!.tipo] <= alto; x++) {
      h += ALTO[ls[x]!.tipo];
      n += 1;
    }
    return n;
  };
  // Arranca un ejercicio antes del de «ahora»; si «ahora» se queda fuera por abajo, baja.
  let desde = Math.max(0, kEj - 1);
  while (desde > 0 && ls[desde]!.tipo !== 'ej') desde -= 1;
  while (desde < foco && desde + cabe(desde) <= foco + 1) desde += 1;
  return ls.slice(desde, desde + cabe(desde));
}

function MarcaSerie({ marca }: { marca: MarcaLinea }) {
  if (marca === 'ahora') return <span style={{ fontSize: T.nota.cuerpo, color: C.tinta, fontWeight: 600 }}>ahora</span>;
  if (marca === 'propuesta') return <Marca hecha={false} talla={14} />;
  if (marca === 'hecha') return <Marca hecha talla={14} />;
  return null;
}

export function PaginaEjercicios({ plan, estado, registro, sim }: { plan: PlanSesion; estado: EstadoSecuencia; registro: Registro; sim: Simulador }) {
  const ls = ventana(lineas(plan, estado, registro, sim), ALTO_UTIL - 26);
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 0, paddingLeft: 'calc(var(--twin-safe-left) + 12px)', paddingRight: 'calc(var(--twin-safe-right) + 14px)' }}>
      <div style={{ marginBottom: 6 }}>
        <ContextoLinea partes={['Ejercicios']} tono={C.tinta2} />
      </div>
      {ls.map((l, k) =>
        l.tipo === 'ej' ? (
          <div key={k} style={{ height: ALTO.ej, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                flex: '0 0 auto',
                background: l.estado === 'ahora' ? C.tinta : l.estado === 'hecho' ? C.tinta2 : 'transparent',
                boxShadow: l.estado === 'pendiente' ? `inset 0 0 0 1.5px ${C.tinta2}` : undefined,
              }}
            />
            <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: l.estado === 'ahora' ? C.tinta : C.tinta2, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>
              {l.slot ? <span style={{ color: C.tinta2 }}>{l.slot} </span> : null}
              {l.nombre}
            </span>
            {l.sinConfirmar ? <MarcaSerie marca="propuesta" /> : null}
          </div>
        ) : (
          <div key={k} style={{ height: ALTO.serie, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 15, whiteSpace: 'nowrap' }}>
            {l.n != null ? <span style={{ width: 12, fontSize: T.nota.cuerpo, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{l.n}</span> : null}
            <span
              style={{
                fontSize: T.nota.cuerpo,
                fontWeight: l.marca === 'ahora' ? 600 : 500,
                color: l.marca === 'hecha' || l.marca === 'ahora' ? C.tinta : C.tinta2,
                opacity: l.marca === 'luego' ? 0.7 : 1,
                fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: '1 1 auto',
              }}
            >
              {l.texto}
            </span>
            <MarcaSerie marca={l.marca} />
          </div>
        ),
      )}
    </Columna>
  );
}

export function PaginaDatosFuerza({
  plan,
  estado,
  registro,
  sim,
  ppm,
  zonas,
}: {
  plan: PlanSesion;
  estado: EstadoSecuencia;
  registro: Registro;
  sim: Simulador;
  ppm: number | null;
  zonas: ZonasCoach | null;
}) {
  const v = volumen(plan, estado, registro, sim);
  return (
    <PaginaFilas
      titulo={['Sesión']}
      zonas={zonas}
      sangria={12}
      filas={[
        { valor: fmtReloj(estado.sesionT), unidad: 'total' },
        { valor: `${v.hechas}/${v.total}`, unidad: 'series' },
        { valor: v.kg > 0 ? fmtMiles(v.kg) : '—', unidad: 'kg de volumen' },
        { valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm', ppm, glifo: 'pulso' },
      ]}
      pie={v.sinConfirmar > 0 ? <Nota ancho={ANCHO_PIE}>{`${v.sinConfirmar} ${v.sinConfirmar === 1 ? 'serie' : 'series'} sin confirmar`}</Nota> : null}
    />
  );
}
