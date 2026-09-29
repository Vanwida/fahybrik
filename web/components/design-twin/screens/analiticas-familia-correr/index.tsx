'use client';

// ANALÍTICAS · CORRER — el «¿mejoro?» a fondo de la familia que es la mitad
// del HYROX (A9, §3): el ritmo umbral y su tendencia, los mejores esfuerzos
// de 400 m a la media con el periodo anterior detrás, el Motor (ritmo al
// mismo pulso), el desacople, la velocidad crítica y su depósito, el VDOT,
// lo que te piden (cumplimiento de series) y los kilómetros por semana plan
// frente a hecho. Rehace el hub de Carrera (correr-hub) sobre el contrato.

import { useEffect, useMemo, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import type { Ventana } from '../../kit-analiticas/contrato';
import { detalleCorrerDe } from '../../kit-analiticas/casos/detalles';
import { nombreDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { fechaLegible, formatear, reloj } from '../../kit-analiticas/fmt';
import { Columnas, CurvaMejores, Lineas, PuntosCumplimiento } from '../../kit-analiticas/graficos';
import { METODO_DEFECTO } from '../../kit-analiticas/metodo';
import { Celda, Etiqueta, HuecoBloque, Nota, PantallaAnaliticas, Rejilla, Seccion, Superficie } from '../../kit-analiticas/piezas';
import { CabeceraFamilia, FilaSinDato, Tabla } from '../../kit-analiticas/piezas-detalle';
import { PIEL_IPHONE as P } from '../../kit-analiticas/tokens';
import { colorFamilia } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-familia-correr',
  titulo: 'Analíticas · Correr',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El detalle de correr: ritmo umbral con su tendencia y su ancla, mejores esfuerzos de 400 m a la media con el periodo anterior en contorno, Motor (ritmo al mismo pulso), desacople, velocidad crítica y depósito, VDOT, lo que te piden (una serie, un punto) y los kilómetros por semana plan frente a hecho.',
  fuentes: [],
  enApp: 'Hoy es el hub de Carrera (AnaliticasCorrerView + running/progress): veredicto y puertas. Esto lo rehace sobre el contrato único, con la misma ventana que la portada y cada cifra con su ancla.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'lleno', titulo: '① Marta · umbral medido, todo lleno', descripcion: 'Ritmo umbral 4:12/km medido en test (3 sep) y 10 s mejor que hace 12 semanas; la curva de mejores esfuerzos con la del periodo anterior detrás (el hueco entre las dos es la mejora); Motor, desacople, velocidad crítica, VDOT; 46 series: 38 dentro; 42 km por semana frente al plan.' },
  { id: 'mixto', titulo: '② Pau · medido, y con series que no salen', descripcion: 'El mismo detalle con otro atleta: umbral 4:26/km; el Motor y la velocidad crítica salen de sus rodajes y sus tests; los kilómetros por semana, con dos semanas por debajo del plan.' },
  { id: 'poco', titulo: '③ Jordi · tres semanas y umbral estimado', descripcion: 'POCO DATO: el umbral es estimado (desde el pulso máximo declarado) y lo dice; Motor, desacople y velocidad crítica esperan sesiones y lo dicen con su plazo; mejores esfuerzos hasta 5 km, sin periodo anterior; sin series pedidas todavía.' },
  { id: 'viejo', titulo: '④ Lucía · marcas de julio', descripcion: 'DATO VIEJO: el umbral de julio, los esfuerzos de julio, y las últimas semanas de kilómetros vacías frente al plan; la cabecera dice desde cuándo.' },
  { id: 'vacio', titulo: '⑤ Sin correr todavía', descripcion: 'VACÍO: la familia entera con su salida.' },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const base = escenario as EscenarioPortada;
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const d = useMemo(() => detalleCorrerDe(base, ventana, metodo), [base, ventana, metodo]);
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(d ? `${nombreDe(base)} · umbral ${formatear(d.umbral.dato!.valor, 's_km')} (${d.umbral.procedencia.ancla}) · ${d.mejores.hoy.length} esfuerzos · km/sem ${d.kmSemana.actual}` : 'Sin correr: vacío');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const atras = { texto: 'Analíticas', onTap: () => onLog('← Analíticas') };
  const viejo = d?.umbral.cobertura.ultimo_dato != null && d.umbral.cobertura.ultimo_dato < '2026-09-15';

  if (!d) {
    return (
      <PantallaAnaliticas titulo="Correr" ventana={ventana} onVentana={setVentana} atras={atras}>
        <HuecoBloque estado="vacio" titulo="Sin correr todavía" cuerpo="Con tu primera carrera aparecen aquí tu ritmo, tus mejores esfuerzos y tu motor. Correr es la mitad del HYROX: es la familia que más cuenta." salida={{ tipo: 'accion', texto: 'Empezar a correr', onTap: () => onLog('Salida → Empezar a correr') }} />
      </PantallaAnaliticas>
    );
  }

  const cabecera = (
    <CabeceraFamilia
      familia="correr"
      etiqueta="Ritmo umbral"
      valor={d.umbral.dato!.valor}
      unidad="s_km"
      comparacion={d.umbral.dato!.comparacion}
      ancla={d.umbral.procedencia.ancla}
      nota={viejo ? `Última sesión ${fechaLegible(d.umbral.cobertura.ultimo_dato!, hoy)} · sin correr desde entonces` : d.umbral.procedencia.ancla === 'estimada' ? 'Estimado desde tu pulso máximo declarado · con el test de zonas pasa a medido' : `${d.umbral.procedencia.explica_es.split(' · ')[0]} · ${fechaLegible(d.umbral.procedencia.explica_es.split(' · ')[1] ?? hoy, hoy)}`}
    />
  );

  return (
    <PantallaAnaliticas titulo="Correr" ventana={ventana} onVentana={(v) => { setVentana(v); onLog(`Ventana → ${v}`); }} atras={atras} cabeceraFija={cabecera}>
      <Seccion titulo="Ritmo umbral" pregunta="Semana a semana · abajo es mejor">
        {d.umbral.serie && d.umbral.serie.hecho.filter((q) => q.v != null).length > 1 ? (
          <Superficie>
            <Lineas piel={P} alto={170} series={[{ id: 'umbral', etiqueta: 'Ritmo umbral', puntos: d.umbral.serie.hecho, color: colorFamilia(P, 'correr'), formato: (v) => formatear(v, 's_km'), rotuloFinal: true }]} formatoY={(v) => reloj(v)} invertido leyenda={false} escalaTiempo />
          </Superficie>
        ) : (
          <Nota>Con {metodo.muestras_minimas} sesiones ya se dibuja la tendencia.</Nota>
        )}
      </Seccion>

      <Seccion titulo="Mejores esfuerzos" pregunta={d.mejores.antes.length ? 'Esta ventana frente a la anterior · abajo es mejor' : 'Esta ventana'}>
        <Superficie>
          <CurvaMejores piel={P} alto={190} hoy={d.mejores.hoy} antes={d.mejores.antes} formatoRitmo={(s) => reloj(s)} />
        </Superficie>
        <Tabla
          etiqueta="Mejores esfuerzos por distancia"
          columnas={[
            { id: 'd', cabecera: 'Distancia', celda: (e) => formatear(e.metros, 'metros') },
            { id: 't', cabecera: 'Tiempo', celda: (e) => reloj(e.segundos), alinear: 'derecha' },
            { id: 'r', cabecera: 'Ritmo', celda: (e) => formatear((e.segundos / e.metros) * 1000, 's_km'), alinear: 'derecha' },
            { id: 'f', cabecera: 'Cuándo', celda: (e) => fechaLegible(e.fecha, hoy), alinear: 'derecha' },
          ]}
          filas={d.mejores.hoy}
          clave={(e) => String(e.metros)}
        />
      </Seccion>

      <Seccion titulo="Motor y economía" pregunta="Lo que corres por el mismo esfuerzo">
        {d.motor.estado === 'medida' && d.desacople.estado === 'medida' ? (
          <Rejilla>
            <Celda etiqueta="Motor" valor={d.motor.dato!.valor} unidad="s_km" comparacion={d.motor.dato!.comparacion} nota="ritmo a 150 ppm en rodajes" />
            <Celda etiqueta="Desacople" valor={d.desacople.dato!.valor} unidad="pct" comparacion={d.desacople.dato!.comparacion} nota="en tiradas largas" />
          </Rejilla>
        ) : (
          <FilaSinDato l={d.motor} onSalida={(t) => onLog(`Salida → ${t}`)} />
        )}
        {d.motor.serie ? (
          <Superficie>
            <Lineas piel={P} alto={150} series={[{ id: 'motor', etiqueta: 'Motor', puntos: d.motor.serie.hecho, color: colorFamilia(P, 'correr'), formato: (v) => formatear(v, 's_km'), rotuloFinal: true }]} formatoY={(v) => reloj(v)} invertido leyenda={false} escalaTiempo />
          </Superficie>
        ) : null}
      </Seccion>

      <Seccion titulo="Velocidad crítica" pregunta="El ritmo que aguantas sin reventar, y cuánto puedes pasarte">
        {d.velocidadCritica.estado === 'medida' ? (
          <Rejilla>
            <Celda etiqueta="Velocidad crítica" valor={d.velocidadCritica.dato!.valor} unidad="m_s" comparacion={d.velocidadCritica.dato!.comparacion} nota={`≈ ${formatear(1000 / d.velocidadCritica.dato!.valor, 's_km')}`} />
            <Celda etiqueta="Depósito" valor={d.deposito.dato!.valor} unidad="metros" nota="por encima de la crítica" />
            <Celda etiqueta="VDOT" valor={d.vdot.dato!.valor} unidad="ml_kg_min" comparacion={d.vdot.dato!.comparacion} ancla={d.vdot.procedencia.ancla} aLoAncho />
          </Rejilla>
        ) : (
          <>
            <FilaSinDato l={d.velocidadCritica} />
            <Rejilla>
              <Celda etiqueta="VDOT" valor={d.vdot.dato!.valor} unidad="ml_kg_min" comparacion={d.vdot.dato!.comparacion} ancla={d.vdot.procedencia.ancla} aLoAncho />
            </Rejilla>
          </>
        )}
        <Nota>{d.velocidadCritica.procedencia.explica_es}</Nota>
      </Seccion>

      <Seccion titulo="Lo que te piden" pregunta="Cada serie con objetivo de ritmo, un punto">
        {d.pedido ? (
          <>
            <PuntosCumplimiento piel={P} dentro={d.pedido.dentro} menos={d.pedido.menos} mas={d.pedido.mas} />
            <Nota>
              {d.pedido.dentro + d.pedido.menos + d.pedido.mas} series en {d.pedido.sesiones} sesiones · dentro = en la franja que pidió tu coach (±{metodo.tolerancias.ritmo.valor} %)
            </Nota>
          </>
        ) : (
          <Nota>Todavía sin series con objetivo de ritmo en esta ventana. Cuando tu coach te pida un ritmo, aquí sale si lo clavas.</Nota>
        )}
      </Seccion>

      <Seccion titulo="Kilómetros por semana" pregunta="Plan frente a hecho">
        <Superficie>
          <Columnas
            piel={P}
            alto={180}
            cubos={d.volumen.serie!.hecho.map((q, i) => ({ t: q.t, plan: d.volumen.serie!.plan?.[i]?.v ?? null, partes: [{ code: 'km', etiqueta: 'Hecho', valor: q.v ?? 0, color: colorFamilia(P, 'correr') }], enCurso: i === d.volumen.serie!.hecho.length - 1 }))}
            leyenda={[{ etiqueta: 'Hecho', color: colorFamilia(P, 'correr') }]}
            formatoY={(v) => `${Math.round(v / 1000)} km`}
            divisor={1000}
          />
        </Superficie>
        <Rejilla>
          <Celda etiqueta="Media por semana" valor={d.kmSemana.actual * 1000} unidad="metros" comparacion={d.kmSemana.anterior != null ? { contra: 'periodo_anterior', valor: d.kmSemana.anterior * 1000, delta: (d.kmSemana.actual - d.kmSemana.anterior) * 1000, delta_pct: null, significativo: Math.abs(d.kmSemana.actual - d.kmSemana.anterior) >= 2, etiqueta_es: 'vs periodo anterior' } : null} aLoAncho />
        </Rejilla>
        <Etiqueta>El plan es el contorno; la columna a trazos es la semana en curso.</Etiqueta>
      </Seccion>
    </PantallaAnaliticas>
  );
}
