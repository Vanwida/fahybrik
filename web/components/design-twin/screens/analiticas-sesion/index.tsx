'use client';

// ANALÍTICAS · LA SESIÓN, TRAMO A TRAMO — la pregunta 9 (§3, A8): qué pasó en
// esa sesión, prescrito frente a hecho en cada tramo y en todas las
// modalidades. La carga de cada tramo con su peldaño y su ancla, el resumen
// del cumplimiento, las curvas de la sesión (pulso; ritmo o split con la
// franja pedida dibujada), los parciales y las zonas. Los seis casos son las
// ejecuciones contra las que se rompió el modelo (§7).

import { useEffect, useMemo } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CUMPLIMIENTO_PALABRA, type Cumplimiento } from '../../kit-analiticas/contrato';
import { sesionDe, type EscenarioSesion } from '../../kit-analiticas/casos/sesiones';
import { fechaLegible, formatear, horas, reloj } from '../../kit-analiticas/fmt';
import { BarraReparto } from '../../kit-analiticas/graficos';
import { BarrasSimples, LineaTiempo } from '../../kit-analiticas/graficos-sesion';
import { METODO_DEFECTO, PELDANO_NOMBRE } from '../../kit-analiticas/metodo';
import { AnclaChip, Celda, Cuerpo, Etiqueta, Nota, PantallaAnaliticas, PuntoFamilia, Rejilla, Seccion, Superficie } from '../../kit-analiticas/piezas';
import { LIENZO } from '../../kit-iphone-vivo/tokens';
import { useMedidaLienzo } from '../../kit-iphone-vivo/piezas';
import { MARGEN_A, PIEL_IPHONE as P, TA, colorZonaDe } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-sesion',
  titulo: 'Analíticas · la sesión, tramo a tramo',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Qué pasó en esa sesión: prescrito frente a hecho tramo a tramo en todas las modalidades (ritmo, zona, split, vatios, reps, kg, RIR, rondas, tiempo), la carga de cada tramo con su peldaño y su ancla, el cumplimiento resumido, las curvas con la franja pedida, los parciales y las zonas. Seis ejecuciones reales de forma.',
  fuentes: [],
  enApp: 'Hoy existen lectura-carrera (correr) y lectura-sesion (el resto) al terminar, sin prescrito frente a hecho por tramo ni carga por tramo. Esto es la lectura que se abre días después desde Semana a semana y desde el panel del coach.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'cinta-4x1000', titulo: '① 4 × 1000 m en cinta, reclamada al plan', descripcion: 'Correr: cuatro series a 3:45–3:55/km; tres dentro y la tercera a 3:58 (menos de lo pedido). La carga por ritmo (peldaño 2), medida. La curva del ritmo con la franja pedida a trazos; el pulso; los parciales por km; las zonas.' },
  { id: 'remo-5x500', titulo: '② Remo 5 × 500 m', descripcion: 'Ergo: cinco piezas a 1:50–1:54/500 m con vatios; cuatro dentro y la cuarta a 1:54,9. Carga por potencia (peldaño 1). La curva del split con la franja.' },
  { id: 'sentadilla-4x5', titulo: '③ Sentadilla 4 × 5 a 100 kg', descripcion: 'Fuerza: RIR pedido 2; la primera quedó floja (RIR 3), la última al límite (RIR 1). Sin pulso: la carga sale del esfuerzo (10 − RIR), peldaño 4, declarada. No hay curva que dibujar y no se dibuja.' },
  { id: 'emom-ski-dominadas', titulo: '④ EMOM 12′ · SkiErg y dominadas', descripcion: 'WOD: doce minutos, cada uno con su dosis (12 cal o 8 reps) y su cumplimiento; los dos últimos se quedaron cortos. Carga por pulso minuto a minuto.' },
  { id: 'fuerza-trineos', titulo: '⑤ Fuerza + trineos sin kg · la carga que NO se sabe', descripcion: 'Libre: el peso muerto carga por RIR; los trineos, sin kg ni pulso ni RPE, no tienen peldaño: su carga no se sabe y cuenta contra la cobertura (55 %), nunca como cero.' },
  { id: 'carrera-salud', titulo: '⑥ Carrera importada de Salud · sin plan', descripcion: 'Sin plan no hay cumplimiento: se lee lo que fue (8 km a 5:30, 149 ppm), carga por pulso, y cuenta igual que una sesión del coach.' },
];

const MARCA: Record<Cumplimiento, string> = { dentro: '✓', 'por-encima': '▲', 'por-debajo': '▼', 'no-hecha': '✕', 'sin-plan': '·' };

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const metodo = METODO_DEFECTO;
  const s = useMemo(() => sesionDe(escenario as EscenarioSesion, metodo), [escenario, metodo]);
  const { ref, lienzo } = useMedidaLienzo();
  const ancho = (lienzo.ancho || LIENZO.ancho) - 2 * MARGEN_A;
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(`${s.titulo_es} · ${s.tramos.length} tramos · carga ${s.carga.tss ?? 'no se sabe'} (${s.carga.peldano ? PELDANO_NOMBRE[s.carga.peldano] : '—'}, ${s.carga.ancla ?? '—'}) · cobertura ${s.carga.cobertura_pct ?? '—'} %`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const atras = { texto: 'Semana a semana', onTap: () => onLog('← Semana a semana') };
  const cabecera = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PuntoFamilia familia={s.familia} />
        <Etiqueta>{fechaLegible(s.fecha, hoy)} · {s.formato_es} · {horas(s.duracion_s)}</Etiqueta>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <Etiqueta>Carga</Etiqueta>
          <span style={{ font: `600 ${TA.dato.cuerpo}px/1 ${P.fuente}`, fontVariantNumeric: 'tabular-nums', color: s.carga.tss != null ? P.tinta : P.tinta2 }}>{s.carga.tss != null ? Math.round(s.carga.tss) : 'no se sabe'}</span>
          {s.carga.plan_tss != null ? <Etiqueta>de {s.carga.plan_tss} planificados</Etiqueta> : <Etiqueta>sin plan</Etiqueta>}
        </span>
        {s.carga.peldano ? <Etiqueta>por {PELDANO_NOMBRE[s.carga.peldano]}</Etiqueta> : null}
        {s.carga.ancla ? <AnclaChip ancla={s.carga.ancla} /> : null}
      </div>
      {s.cumplimiento ? <Cuerpo fuerte estilo={{ textWrap: 'pretty' }}>{s.cumplimiento.resumen_es}</Cuerpo> : <Etiqueta>{s.origen_es}</Etiqueta>}
    </div>
  );

  const tramosTrabajo = s.tramos.filter((t) => t.rol === 'trabajo');
  const dentro = tramosTrabajo.filter((t) => t.cumplimiento === 'dentro').length;

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <PantallaAnaliticas titulo={s.titulo_es} ventana="7d" onVentana={() => onLog('La sesión no tiene ventana: es un día')} atras={atras} cabeceraFija={cabecera} accionDerecha={null} sinVentana>
        <Seccion titulo="Tramo a tramo" pregunta={s.cumplimiento ? `${dentro} de ${tramosTrabajo.length} tramos de trabajo dentro` : 'Sin plan: lo que fue'}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {s.tramos.map((t) => (
              <div key={t.n} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) auto', gap: 10, alignItems: 'start', padding: '10px 0', borderBottom: `1px solid ${P.rejilla}`, opacity: t.rol === 'trabajo' ? 1 : 0.85 }}>
                <span aria-label={CUMPLIMIENTO_PALABRA[t.cumplimiento]} style={{ font: `700 ${TA.cuerpo.cuerpo}px/1.3 ${P.fuente}`, color: t.cumplimiento === 'dentro' ? P.tinta : P.tinta2, textAlign: 'center' }}>
                  {t.prescrito ? MARCA[t.cumplimiento] : '·'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <Cuerpo fuerte>{t.nombre_es}</Cuerpo>
                  {t.prescrito ? (
                    <Etiqueta estilo={{ textWrap: 'pretty' }}>
                      Pedido: {t.prescrito.medida_es}
                      {t.prescrito.objetivo_es ? ` a ${t.prescrito.objetivo_es}` : ''}
                    </Etiqueta>
                  ) : null}
                  <span style={{ font: `500 ${TA.cuerpo.cuerpo}px/1.3 ${P.fuente}`, color: P.tinta, textWrap: 'pretty' }}>
                    {t.hecho.medida_es === t.prescrito?.medida_es ? '' : `${t.hecho.medida_es} · `}
                    {t.hecho.valor_es}
                    {t.hecho.extra_es ? <span style={{ color: P.tinta2 }}> · {t.hecho.extra_es}</span> : null}
                  </span>
                  {t.prescrito && t.cumplimiento !== 'dentro' && t.cumplimiento !== 'sin-plan' ? <Etiqueta>{CUMPLIMIENTO_PALABRA[t.cumplimiento]}</Etiqueta> : null}
                </div>
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ font: `600 ${TA.datoMenor.cuerpo}px/1 ${P.fuente}`, fontVariantNumeric: 'tabular-nums', color: t.carga.tss != null ? P.tinta : P.tinta2 }}>{t.carga.tss != null ? Math.round(t.carga.tss) : '?'}</span>
                  <Etiqueta>{t.carga.peldano ? PELDANO_NOMBRE[t.carga.peldano] : 'no se sabe'}</Etiqueta>
                </span>
              </div>
            ))}
          </div>
          <Nota>
            A la derecha, la carga de cada tramo y de dónde sale ({Object.values(PELDANO_NOMBRE).join(' › ')}: gana el primer peldaño con dato y ancla). «?» = ese tramo no tiene peldaño y cuenta contra la cobertura.
          </Nota>
        </Seccion>

        {s.curvas.principal ? (
          <Seccion titulo={s.curvas.principal.unidad === 's_km' ? 'Ritmo' : s.curvas.principal.unidad === 's_500m' ? 'Split' : 'Vatios'} pregunta="A lo largo de la sesión · la franja a trazos es lo pedido">
            <Superficie>
              <LineaTiempo piel={P} alto={170} duracion={s.duracion_s} etiqueta="Ritmo a lo largo de la sesión" curva={{ puntos: s.curvas.principal.puntos, invertido: s.curvas.principal.unidad !== 'w', formato: (v) => (s.curvas.principal!.unidad === 'w' ? `${Math.round(v)} W` : reloj(v)), banda: s.curvas.principal.banda, color: P.tinta }} />
            </Superficie>
          </Seccion>
        ) : null}

        {s.curvas.pulso ? (
          <Seccion titulo="Pulso" pregunta="A lo largo de la sesión">
            <Superficie>
              <LineaTiempo piel={P} alto={170} duracion={s.duracion_s} etiqueta="Pulso a lo largo de la sesión" curva={{ puntos: s.curvas.pulso.puntos, formato: (v) => `${Math.round(v)}`, referencias: [{ valor: Math.round(s.curvas.pulso.puntos.reduce((a, p) => a + p.v, 0) / s.curvas.pulso.puntos.length), etiqueta: `${Math.round(s.curvas.pulso.puntos.reduce((a, p) => a + p.v, 0) / s.curvas.pulso.puntos.length)} media` }], color: P.tinta }} />
            </Superficie>
          </Seccion>
        ) : null}

        {s.parciales ? (
          <Seccion titulo="Parciales" pregunta="Por kilómetro">
            <BarrasSimples piel={P} filas={s.parciales.map((q) => ({ id: q.etiqueta_es, etiqueta: q.etiqueta_es, valor: q.segundos, color: P.tinta2 }))} formato={(v) => reloj(v)} anchoInicial={ancho} altoFila={28} marcar={[s.parciales.reduce((m, q) => (q.segundos < m.segundos ? q : m)).etiqueta_es, s.parciales.reduce((m, q) => (q.segundos > m.segundos ? q : m)).etiqueta_es]} />
            <Nota>El más rápido y el más lento van en tinta; los demás, atenuados.</Nota>
          </Seccion>
        ) : null}

        {s.zonas ? (
          <Seccion titulo="Zonas" pregunta="Dónde estuvo tu pulso">
            <BarraReparto piel={P} partes={s.zonas.map((seg, i) => ({ code: `z${i + 1}`, etiqueta: `Z${i + 1}`, pct: (seg / s.zonas!.reduce((a, b) => a + b, 0)) * 100, color: colorZonaDe(P, i + 1) })).filter((x) => x.pct > 0)} />
          </Seccion>
        ) : null}

        <Seccion titulo="Lo que dijiste" pregunta={s.rpe != null ? 'Tu esfuerzo al cerrar' : 'Sin esfuerzo declarado'}>
          {s.rpe != null ? (
            <Rejilla>
              <Celda etiqueta="Esfuerzo (RPE)" valor={s.rpe} unidad="puntos" nota="de 10" />
              <Celda etiqueta="Duración" valor={s.duracion_s} unidad="segundos" nota={s.origen_es} />
            </Rejilla>
          ) : (
            <Nota>{s.nota_es ?? 'Sin RPE al cerrar: si un tramo no tiene ritmo, vatios ni pulso, su carga no se sabe.'}</Nota>
          )}
          {s.rpe != null && s.nota_es ? <Nota>{s.nota_es}</Nota> : null}
          <Etiqueta>{formatear(s.duracion_s, 'segundos')} de sesión · {s.origen_es}</Etiqueta>
        </Seccion>
      </PantallaAnaliticas>
    </div>
  );
}
