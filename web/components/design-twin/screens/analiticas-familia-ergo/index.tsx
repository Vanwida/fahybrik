'use client';

// ANALÍTICAS · ERGO — una pantalla, la máquina como variante (A9, §3): remo,
// SkiErg y BikeErg comparten forma y cambian de unidad. El umbral de potencia
// y su tendencia, los mejores por pieza estándar de Concept2 (100 m, 500 m,
// 1000 m, 2000 m, 5000 m; 1, 4 y 30 min) con las que faltan como invitación,
// los vatios al mismo pulso, las paladas (o las rpm en la bici) y los metros
// por semana plan frente a hecho. La bici se lee por 1000 m.

import { useEffect, useMemo, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import type { Ventana } from '../../kit-analiticas/contrato';
import { MAQUINA_NOMBRE, detalleErgoDe, type Maquina } from '../../kit-analiticas/casos/detalles';
import { nombreDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { fechaLegible, formatear, reloj } from '../../kit-analiticas/fmt';
import { Columnas, Lineas } from '../../kit-analiticas/graficos';
import { METODO_DEFECTO } from '../../kit-analiticas/metodo';
import { PantallaAnaliticas, Seccion, Segmento } from '../../kit-analiticas/pantalla';
import { Celda, Etiqueta, Nota, Rejilla, Sello, Superficie } from '../../kit-analiticas/piezas';
import { CabeceraFamilia, FilaSinDato, SujetoVacio, Tabla } from '../../kit-analiticas/piezas-detalle';
import { PIEL_IPHONE as P, colorFamilia } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-familia-ergo',
  titulo: 'Analíticas · Ergo (remo · ski · bici)',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Una pantalla para las tres máquinas, con la máquina como variante: umbral de potencia con su tendencia y su ancla, mejores por pieza estándar (100 m a 5000 m; 1, 4 y 30 min) con las que faltan como invitación, vatios al mismo pulso, paladas o rpm, metros por semana plan frente a hecho. La bici en /1000 m.',
  fuentes: [],
  enApp: 'Hoy el ergo son tarjetas sueltas en Analíticas (benchmark-erg, marcas) sin «¿mejoro?». Esto le da el mismo mecanismo que a correr sobre el contrato único.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'lleno:remo', titulo: '① Marta · Remo', descripcion: 'Umbral medido en el 2000 m; seis de ocho piezas hechas, dos nuevas en la ventana; vatios al mismo pulso subiendo; metros por semana frente al plan. Toca Ski o Bici arriba.' },
  { id: 'lleno:ski', titulo: '② Marta · SkiErg', descripcion: 'La misma forma con el ski: umbral desde el 1000 m (12 sep), piezas y paladas.' },
  { id: 'lleno:bici', titulo: '③ Marta · BikeErg · /1000 m y rpm', descripcion: 'La bici se lee por 1000 m y con cadencia en rpm, como su monitor; el umbral es declarado y lo dice.' },
  { id: 'mixto:remo', titulo: '④ Pau · umbral DECLARADO', descripcion: 'El ancla se ve: umbral declarado (chip a trazos), con la salida al test; piezas que faltan como invitación.' },
  { id: 'viejo:remo', titulo: '⑤ Lucía · piezas de junio', descripcion: 'DATO VIEJO: la última pieza es de agosto y el umbral, de junio; la cabecera lo dice.' },
  { id: 'poco:remo', titulo: '⑥ Jordi · sin remo todavía', descripcion: 'POCO/VACÍO: a las tres semanas no ha remado; el detalle lo dice y ofrece la salida.' },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [baseId, maquinaInicial] = escenario.split(':') as [EscenarioPortada, Maquina];
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const [maquina, setMaquina] = useState<Maquina>(maquinaInicial ?? 'remo');
  const d = useMemo(() => detalleErgoDe(baseId, ventana, maquina, metodo), [baseId, ventana, maquina, metodo]);
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(d ? `${nombreDe(baseId)} · ${MAQUINA_NOMBRE[maquina]} · umbral ${d.umbral.dato ? formatear(d.umbral.dato.valor, 'w') : 'sin dato'} (${d.umbral.procedencia.ancla}) · ${d.piezas.filter((x) => x.valor != null).length} de 8 piezas` : `${nombreDe(baseId)} · ${MAQUINA_NOMBRE[maquina]}: sin sesiones`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const atras = { texto: 'Analíticas', onTap: () => onLog('← Analíticas') };
  const selector = (
    <Segmento
      items={(['remo', 'ski', 'bici'] as Maquina[]).map((m) => ({ id: m, texto: MAQUINA_NOMBRE[m] }))}
      valor={maquina}
      onCambio={(m) => {
        setMaquina(m);
        onLog(`Máquina → ${MAQUINA_NOMBRE[m]}`);
      }}
      etiqueta="Máquina"
      completo
    />
  );
  const unidadSplit = maquina === 'bici' ? 's_1000m' : 's_500m';

  if (!d) {
    return (
      <PantallaAnaliticas
        titulo="Ergo"
        ventana={ventana}
        onVentana={setVentana}
        atras={atras}
        sujeto={
          <SujetoVacio
            familia={maquina}
            etiqueta={MAQUINA_NOMBRE[maquina]}
            titulo={`Sin ${MAQUINA_NOMBRE[maquina].toLowerCase()} todavía`}
            cuerpo={`Con la primera pieza aparecen aquí tu umbral, tus mejores por distancia y tus vatios. ${maquina === 'remo' ? 'El remo de 1000 m es una de las ocho estaciones.' : maquina === 'ski' ? 'El SkiErg abre el HYROX.' : 'La bici no está en el HYROX, pero suma base sin impacto.'}`}
            salida={{ texto: `Hacer una pieza de ${MAQUINA_NOMBRE[maquina].toLowerCase()}`, onTap: () => onLog('Salida → pieza de ergo') }}
            accesorio={selector}
          />
        }
      >
        {null}
      </PantallaAnaliticas>
    );
  }

  const viejo = d.umbral.cobertura.ultimo_dato != null && d.umbral.cobertura.ultimo_dato < '2026-09-15';
  const cabecera = (
    <CabeceraFamilia
      familia={maquina}
      etiqueta="Umbral de potencia"
      valor={d.umbral.dato?.valor ?? null}
      unidad="w"
      comparacion={d.umbral.dato?.comparacion}
      ancla={d.umbral.procedencia.ancla}
      nota={d.umbral.estado === 'sin_dato' ? d.umbral.procedencia.explica_es : viejo ? `Última pieza ${fechaLegible(d.umbral.cobertura.ultimo_dato!, hoy)} · nada desde entonces` : d.umbral.procedencia.explica_es}
      accesorio={selector}
    />
  );

  return (
    <PantallaAnaliticas titulo="Ergo" ventana={ventana} onVentana={(v) => { setVentana(v); onLog(`Ventana → ${v}`); }} atras={atras} sujeto={cabecera}>
      <Seccion titulo="Umbral de potencia" pregunta="Semana a semana · arriba es mejor">
        {d.umbral.serie ? (
          <Superficie>
            <Lineas piel={P} alto={170} series={[{ id: 'umbral', etiqueta: 'Umbral', puntos: d.umbral.serie.hecho, color: colorFamilia(P, maquina), formato: (v) => formatear(v, 'w'), rotuloFinal: true }]} formatoY={(v) => String(Math.round(v))} leyenda={false} />
          </Superficie>
        ) : (
          <FilaSinDato l={d.umbral} onSalida={(t) => onLog(`Salida → ${t}`)} />
        )}
        {d.umbral.procedencia.ancla === 'declarada' ? <Nota>Declarado por ti: el test de {maquina === 'ski' ? '1000' : '2000'} m lo convierte en medido y afina la carga de cada pieza.</Nota> : null}
      </Seccion>

      <Seccion titulo="Mejores por pieza" pregunta={`Las ocho piezas estándar · ${d.piezas.filter((x) => x.valor != null).length} hechas`}>
        <Tabla
          etiqueta="Mejores por pieza estándar"
          columnas={[
            { id: 'p', cabecera: 'Pieza', celda: (x) => x.pieza, ancho: '74px' },
            { id: 'v', cabecera: 'Marca', celda: (x) => (x.valor == null ? <span style={{ color: P.tinta2 }}>sin hacer</span> : x.unidad === 'metros' ? formatear(x.valor, 'metros') : reloj(x.valor)), alinear: 'derecha' },
            { id: 's', cabecera: maquina === 'bici' ? '/1000 m' : '/500 m', celda: (x) => (x.split == null ? '' : reloj(x.split)), alinear: 'derecha' },
            { id: 'f', cabecera: 'Cuándo', celda: (x) => (x.fecha ? <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>{x.nuevo ? <Sello texto="Nuevo" /> : null}<Etiqueta>{fechaLegible(x.fecha, hoy)}</Etiqueta></span> : ''), alinear: 'derecha' },
          ]}
          filas={d.piezas}
          clave={(x) => x.pieza}
        />
        <Nota>Las piezas sin hacer son las de la tabla de Concept2: hacer una es un récord seguro.</Nota>
      </Seccion>

      <Seccion titulo="Vatios al mismo pulso" pregunta="Lo que rindes por el mismo esfuerzo">
        {d.vatiosAlPulso.estado === 'medida' ? (
          <>
            <Rejilla>
              <Celda etiqueta="A 150 ppm" valor={d.vatiosAlPulso.dato!.valor} unidad="w" comparacion={d.vatiosAlPulso.dato!.comparacion} />
              <Celda etiqueta={maquina === 'bici' ? 'Cadencia' : 'Paladas'} valor={d.cadencia.dato!.valor} unidad={maquina === 'bici' ? 'rpm' : 'spm'} nota="media en piezas de trabajo" />
            </Rejilla>
            {d.vatiosAlPulso.serie ? (
              <Superficie>
                <Lineas piel={P} alto={150} series={[{ id: 'vp', etiqueta: 'Vatios a 150 ppm', puntos: d.vatiosAlPulso.serie.hecho, color: colorFamilia(P, maquina), formato: (v) => formatear(v, 'w'), rotuloFinal: true }]} formatoY={(v) => String(Math.round(v))} leyenda={false} />
              </Superficie>
            ) : null}
          </>
        ) : (
          <FilaSinDato l={d.vatiosAlPulso} />
        )}
      </Seccion>

      <Seccion titulo="Metros por semana" pregunta="Plan frente a hecho">
        <Superficie>
          <Columnas
            piel={P}
            alto={180}
            cubos={d.volumen.serie!.hecho.map((q, i) => ({ t: q.t, plan: d.volumen.serie!.plan?.[i]?.v ?? null, partes: [{ code: 'm', etiqueta: 'Hecho', valor: q.v ?? 0, color: colorFamilia(P, maquina) }], enCurso: i === d.volumen.serie!.hecho.length - 1 }))}
            leyenda={[{ etiqueta: 'Hecho', color: colorFamilia(P, maquina) }]}
            formatoY={(v) => `${Math.round(v / 1000)} km`}
            divisor={1000}
          />
        </Superficie>
        <Nota>{d.sesiones} sesiones de {MAQUINA_NOMBRE[maquina].toLowerCase()} en la ventana. La unidad del split es la del monitor: {formatear(unidadSplit === 's_500m' ? 112 : 124, unidadSplit).replace(/^[\d:]+/, '…')}.</Nota>
      </Seccion>
    </PantallaAnaliticas>
  );
}
