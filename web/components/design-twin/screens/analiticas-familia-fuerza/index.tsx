'use client';

// ANALÍTICAS · FUERZA — el «¿mejoro?» de la fuerza (A9, §3): el 1RM estimado
// por ejercicio con la fórmula del coach y su tendencia, la tabla de mejores
// por número de repeticiones del ejercicio elegido, el tonelaje y las series
// por semana plan frente a hecho, el reparto por patrón de movimiento y el
// cumplimiento del RIR pedido (una serie, un punto). La carga de la fuerza
// sale del esfuerzo (RPE o 10 − RIR), y lo dice.

import { useEffect, useMemo, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import type { Ventana } from '../../kit-analiticas/contrato';
import { detalleFuerzaDe } from '../../kit-analiticas/casos/detalles';
import { nombreDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { conMillar, fechaLegible, formatear } from '../../kit-analiticas/fmt';
import { Columnas, PuntosCumplimiento } from '../../kit-analiticas/graficos';
import { METODO_DEFECTO } from '../../kit-analiticas/metodo';
import { Celda, Etiqueta, FilaProgreso, HuecoBloque, Lista, Nota, PantallaAnaliticas, Rejilla, Seccion, Segmento, Sello, Superficie } from '../../kit-analiticas/piezas';
import { CabeceraFamilia, Tabla } from '../../kit-analiticas/piezas-detalle';
import { PIEL_IPHONE as P, colorFamilia } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-familia-fuerza',
  titulo: 'Analíticas · Fuerza',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El detalle de fuerza: 1RM estimado por ejercicio (fórmula del coach) con tendencia, mejores por número de repeticiones del ejercicio elegido, tonelaje y series por semana plan frente a hecho, reparto por patrón de movimiento y cumplimiento del RIR pedido. La carga sale del esfuerzo y lo dice.',
  fuentes: [],
  enApp: 'Hoy la fuerza son los 1RM en Perfil y unas marcas sueltas, sin «¿mejoro?» ni volumen por semana. Esto le da el mismo mecanismo que a correr sobre el contrato único.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'lleno', titulo: '① Marta · cinco ejercicios, todo lleno', descripcion: 'Sentadilla 132 kg estimados (5 × 112,5 el 20 sep, Epley) y 7,5 kg más que hace 12 semanas; mejores por reps de la sentadilla con las series que faltan como invitación; 11,5 t por semana frente al plan; el reparto por patrón; 82 series con RIR pedido, 61 dentro.' },
  { id: 'mixto', titulo: '② Pau · la carga por esfuerzo', descripcion: 'Fuerza sin pulso: cada serie carga por 10 − RIR, y el detalle lo dice. Sentadilla 121 kg; press banca; tonelaje por semana con una semana saltada.' },
  { id: 'poco', titulo: '③ Jordi · dos ejercicios, tres semanas', descripcion: 'POCO DATO: dos ejercicios con una marca cada uno, sin tendencia ni comparación (no hay periodo anterior); el RIR todavía no se juzga; el reparto por patrón con dos patrones.' },
  { id: 'viejo', titulo: '④ Lucía · 1RM de agosto', descripcion: 'DATO VIEJO: las marcas se quedan donde estaban y las últimas semanas de tonelaje están vacías frente al plan.' },
  { id: 'vacio', titulo: '⑤ Sin fuerza todavía', descripcion: 'VACÍO: la familia entera con su salida.' },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const base = escenario as EscenarioPortada;
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const d = useMemo(() => detalleFuerzaDe(base, ventana, metodo), [base, ventana, metodo]);
  const [ejercicio, setEjercicio] = useState(0);
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(d ? `${nombreDe(base)} · ${d.ejercicios.length} ejercicios · sentadilla ${formatear(d.ejercicios[0]!.rm.dato!.valor, 'kg')} est. · ${d.sesiones} sesiones` : 'Sin fuerza: vacío');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const atras = { texto: 'Analíticas', onTap: () => onLog('← Analíticas') };
  if (!d) {
    return (
      <PantallaAnaliticas titulo="Fuerza" ventana={ventana} onVentana={setVentana} atras={atras}>
        <HuecoBloque estado="vacio" titulo="Sin fuerza todavía" cuerpo="Con la primera sesión de fuerza aparecen aquí tu 1RM estimado por ejercicio, tu tonelaje por semana y si clavas el RIR que te piden. Anota kg y RIR en cada descanso: es lo que lo alimenta." salida={{ tipo: 'accion', texto: 'Empezar una sesión de fuerza', onTap: () => onLog('Salida → fuerza') }} />
      </PantallaAnaliticas>
    );
  }

  const principal = d.ejercicios[0]!;
  const elegido = d.ejercicios[Math.min(ejercicio, d.ejercicios.length - 1)]!;
  const viejo = principal.rm.cobertura.ultimo_dato != null && principal.rm.cobertura.ultimo_dato < '2026-09-15';
  const cabecera = (
    <CabeceraFamilia
      familia="fuerza"
      etiqueta={principal.rm.titulo_es}
      valor={principal.rm.dato!.valor}
      unidad="kg"
      comparacion={principal.rm.dato!.comparacion}
      ancla={principal.rm.procedencia.ancla}
      nota={viejo ? `Última serie ${fechaLegible(principal.rm.cobertura.ultimo_dato!, hoy)} · nada desde entonces` : principal.rm.procedencia.explica_es}
    />
  );

  return (
    <PantallaAnaliticas titulo="Fuerza" ventana={ventana} onVentana={(v) => { setVentana(v); onLog(`Ventana → ${v}`); }} atras={atras} cabeceraFija={cabecera}>
      <Seccion titulo="1RM estimado" pregunta={`Por ejercicio · fórmula de ${metodo.formula_1rm === 'epley' ? 'Epley' : 'Brzycki'}, la de tu coach`}>
        <Lista>
          {d.ejercicios.map((e) => (
            <FilaProgreso key={e.nombre} familia="fuerza" nombre={e.nombre} metrica={e.patron === e.nombre ? '1RM est.' : `${e.patron} · 1RM est.`} valor={e.rm.dato!.valor} unidad="kg" comparacion={e.rm.dato!.comparacion} tendencia={e.rm.serie?.hecho ?? null} nota={e.rm.dato!.comparacion ? null : 'sin periodo anterior con el que comparar'} onAbrir={() => { setEjercicio(d.ejercicios.indexOf(e)); onLog(`Ejercicio → ${e.nombre}`); }} />
          ))}
        </Lista>
        <Nota>Estimado desde tu mejor serie declarada (kg × reps). Un 1RM real pesa más que una estimación: si haces un test, manda.</Nota>
      </Seccion>

      <Seccion titulo="Mejores por repeticiones" pregunta={elegido.nombre} accesorio={<Segmento items={d.ejercicios.map((e, i) => ({ id: String(i), texto: e.nombre.split(' ')[0]! }))} valor={String(d.ejercicios.indexOf(elegido))} onCambio={(v) => setEjercicio(Number(v))} etiqueta="Ejercicio" />}>
        <Tabla
          etiqueta={`Mejores por repeticiones · ${elegido.nombre}`}
          columnas={[
            { id: 'r', cabecera: 'Reps', celda: (x) => `${x.reps} ${x.reps === 1 ? 'rep' : 'reps'}`, ancho: '72px' },
            { id: 'k', cabecera: 'Mejor', celda: (x) => (x.kg == null ? <span style={{ color: P.tinta2 }}>sin hacer</span> : formatear(x.kg, 'kg')), alinear: 'derecha' },
            { id: 'e', cabecera: '1RM est.', celda: (x) => (x.kg == null ? '' : formatear(Math.round(x.kg * (1 + x.reps / 30) * 2) / 2, 'kg')), alinear: 'derecha' },
            { id: 'f', cabecera: 'Cuándo', celda: (x) => (x.fecha ? <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>{x.nuevo ? <Sello texto="Nuevo" /> : null}<Etiqueta>{fechaLegible(x.fecha, hoy)}</Etiqueta></span> : ''), alinear: 'derecha' },
          ]}
          filas={elegido.mejoresPorReps}
          clave={(x) => String(x.reps)}
        />
      </Seccion>

      <Seccion titulo="Tonelaje por semana" pregunta="Σ reps × kg · plan frente a hecho">
        <Superficie>
          <Columnas
            piel={P}
            alto={180}
            cubos={d.tonelaje.serie!.hecho.map((q, i) => ({ t: q.t, plan: d.tonelaje.serie!.plan?.[i]?.v ?? null, partes: [{ code: 'kg', etiqueta: 'Hecho', valor: q.v ?? 0, color: colorFamilia(P, 'fuerza') }], enCurso: i === d.tonelaje.serie!.hecho.length - 1 }))}
            leyenda={[{ etiqueta: 'Hecho', color: colorFamilia(P, 'fuerza') }]}
            formatoY={(v) => `${Math.round(v / 1000)} t`}
            divisor={1000}
          />
        </Superficie>
        <Rejilla>
          <Celda etiqueta="Tonelaje medio" valor={d.tonelaje.dato!.valor} unidad="kg" comparacion={d.tonelaje.dato!.comparacion} />
          <Celda etiqueta="Series por semana" valor={d.seriesSemana.dato!.valor} unidad="reps" nota="de trabajo" />
        </Rejilla>
      </Seccion>

      <Seccion titulo="Por patrón" pregunta="Series y tonelaje de la ventana">
        <Tabla
          etiqueta="Series y tonelaje por patrón de movimiento"
          columnas={[
            { id: 'p', cabecera: 'Patrón', celda: (x) => x.patron },
            { id: 's', cabecera: 'Series', celda: (x) => `${x.series}${x.seriesAnterior != null && x.seriesAnterior !== x.series ? ` (${x.series > x.seriesAnterior ? '+' : '−'}${Math.abs(x.series - x.seriesAnterior)})` : ''}`, alinear: 'derecha' },
            { id: 't', cabecera: 'Tonelaje', celda: (x) => (x.tonelaje_kg > 0 ? `${conMillar(x.tonelaje_kg)} kg` : 'sin kg'), alinear: 'derecha' },
          ]}
          filas={d.patrones}
          clave={(x) => x.patron}
        />
        <Nota>Entre paréntesis, las series frente al periodo anterior. Los acarreos no suman tonelaje: se cuentan por series y metros.</Nota>
      </Seccion>

      <Seccion titulo="El RIR que te piden" pregunta="Cada serie con RIR pedido, un punto">
        {d.rir ? (
          <>
            <PuntosCumplimiento piel={P} dentro={d.rir.dentro} menos={d.rir.menos} mas={d.rir.mas} />
            <Nota>{d.rir.series} series con RIR pedido · dentro = a ±{metodo.tolerancias.rir.valor} del RIR pedido · «más de lo pedido» = te quedaste con menos reps en reserva (fuiste más duro)</Nota>
          </>
        ) : (
          <Nota>Con {metodo.muestras_minimas} sesiones con RIR pedido, aquí sale si vas al esfuerzo que toca.</Nota>
        )}
      </Seccion>
    </PantallaAnaliticas>
  );
}
