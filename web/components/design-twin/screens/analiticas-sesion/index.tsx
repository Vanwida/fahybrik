'use client';

// ANALÍTICAS · LA SESIÓN, TRAMO A TRAMO — la pregunta 9 (§3, A8): qué pasó en
// esa sesión, prescrito frente a hecho en cada tramo y en todas las
// modalidades. La carga de cada tramo con su peldaño y su ancla, el resumen
// del cumplimiento, las curvas de la sesión (pulso; ritmo o split con la
// franja pedida dibujada), los parciales y las zonas. Los seis casos son las
// ejecuciones contra las que se rompió el modelo (§7).

import { useEffect, useMemo } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CUMPLIMIENTO_PALABRA } from '../../kit-analiticas/contrato';
import { sesionDe, type EscenarioSesion } from '../../kit-analiticas/casos/sesiones';
import { fechaLegible, formatear, horas, reloj, unirUnidades } from '../../kit-analiticas/fmt';
import { BarraReparto } from '../../kit-analiticas/graficos';
import { BarrasSimples, LineaTiempo } from '../../kit-analiticas/graficos-sesion';
import { METODO_DEFECTO, PELDANO_NOMBRE } from '../../kit-analiticas/metodo';
import { PantallaAnaliticas, Seccion } from '../../kit-analiticas/pantalla';
import { AnclaChip, Celda, Cuerpo, Etiqueta, MarcaCumplimiento, Nota, Numeral, PuntoFamilia, Rejilla, Superficie } from '../../kit-analiticas/piezas';
import { PIEL_IPHONE as P, DATO_FILA, colorZonaDe } from '../../kit-analiticas/tokens';
import { Abajo, Apoyo, Arriba, Hero } from '../../kit-dia/hero';
import { fuente, MARGEN, TAM } from '../../kit-dia/tokens';
import { LIENZO } from '../../kit-iphone-vivo/tokens';
import { useMedidaLienzo } from '../../kit-iphone-vivo/piezas';

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
  { id: 'cinta-4x1000', titulo: '① 4 × 1000 m en cinta, reclamada al plan', descripcion: 'Correr: cuatro series a 3:45 a 3:55/km; tres dentro y la tercera a 3:58 (menos de lo pedido). La carga por ritmo (peldaño 2), medida. La curva del ritmo con la franja pedida a trazos; el pulso; los parciales por km; las zonas.' },
  { id: 'remo-5x500', titulo: '② Remo 5 × 500 m', descripcion: 'Ergo: cinco piezas a 1:50 a 1:54/500 m con vatios; cuatro dentro y la cuarta a 1:54,9. Carga por potencia (peldaño 1). La curva del split con la franja.' },
  { id: 'sentadilla-4x5', titulo: '③ Sentadilla 4 × 5 a 100 kg', descripcion: 'Fuerza: RIR pedido 2; la primera quedó floja (RIR 3), la última al límite (RIR 1). Sin pulso: la carga sale del esfuerzo (10 − RIR), peldaño 4, declarada. No hay curva que dibujar y no se dibuja.' },
  { id: 'emom-ski-dominadas', titulo: '④ EMOM 12′ · SkiErg y dominadas', descripcion: 'WOD: doce minutos, cada uno con su dosis (12 cal o 8 reps) y su cumplimiento; los dos últimos se quedaron cortos. Carga por pulso minuto a minuto.' },
  { id: 'fuerza-trineos', titulo: '⑤ Fuerza + trineos sin kg · la carga que NO se sabe', descripcion: 'Libre: el peso muerto carga por RIR; los trineos, sin kg ni pulso ni RPE, no tienen peldaño: su carga no se sabe y cuenta contra la cobertura (55 %), nunca como cero.' },
  { id: 'carrera-salud', titulo: '⑥ Carrera importada de Salud · sin plan', descripcion: 'Sin plan no hay cumplimiento: se lee lo que fue (8 km a 5:30, 149 ppm), carga por pulso, y cuenta igual que una sesión del coach.' },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const metodo = METODO_DEFECTO;
  const s = useMemo(() => sesionDe(escenario as EscenarioSesion, metodo), [escenario, metodo]);
  const { ref, lienzo } = useMedidaLienzo();
  const ancho = (lienzo.ancho || LIENZO.ancho) - 2 * MARGEN;
  const hoy = '2026-09-29';

  useEffect(() => {
    onLog(`${s.titulo_es} · ${s.tramos.length} tramos · carga ${s.carga.tss ?? 'no se sabe'} (${s.carga.peldano ? PELDANO_NOMBRE[s.carga.peldano] : 'sin peldaño'}, ${s.carga.ancla ?? 'sin ancla'}) · cobertura ${s.carga.cobertura_pct ?? 'sin dato'} %`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const atras = { texto: 'Semana a semana', onTap: () => onLog('← Semana a semana') };
  const sobretitulo = `${fechaLegible(s.fecha, hoy)} · ${s.formato_es} · ${horas(s.duracion_s)}`;

  // El sujeto de una sesión es su CARGA: lo que pesó, contra lo planificado, y de dónde sale la cifra.
  const sujeto = (
    <Hero tono="neutro" etiqueta="Carga de la sesión">
      <Arriba>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <PuntoFamilia familia={s.familia} />
            <span style={{ ...fuente(800, TAM.suelo, 1.25), color: P.tinta }}>Carga de la sesión</span>
          </span>
          {s.carga.ancla ? <AnclaChip ancla={s.carga.ancla} enSujeto /> : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {s.carga.tss != null ? <Numeral texto={String(Math.round(s.carga.tss))} cuerpo={TAM.display} estilo={{ letterSpacing: '-0.025em' }} /> : <span style={{ ...fuente(800, TAM.display, 1.02, true), letterSpacing: '-0.025em', color: P.tinta }}>No se sabe</span>}
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: P.tinta }}>
            {s.carga.plan_tss != null ? `de ${s.carga.plan_tss} planificados` : 'sin plan'}
            {s.carga.peldano ? ` · por ${PELDANO_NOMBRE[s.carga.peldano]}` : ''}
          </span>
        </span>
      </Arriba>
      <Abajo>{s.cumplimiento ? <Apoyo tono="neutro">{s.cumplimiento.resumen_es}</Apoyo> : <Apoyo tono="neutro">{s.origen_es}</Apoyo>}</Abajo>
    </Hero>
  );

  const pulsoMedio = s.curvas.pulso ? Math.round(s.curvas.pulso.puntos.reduce((a, q) => a + q.v, 0) / s.curvas.pulso.puntos.length) : 0;
  const tramosTrabajo = s.tramos.filter((t) => t.rol === 'trabajo');
  const dentro = tramosTrabajo.filter((t) => t.cumplimiento === 'dentro').length;

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <PantallaAnaliticas titulo={s.titulo_es} sobretitulo={sobretitulo} ventana="7d" onVentana={() => onLog('La sesión no tiene ventana: es un día')} atras={atras} sujeto={sujeto} sinVentana>
        <Seccion titulo="Tramo a tramo" pregunta={s.cumplimiento ? `${dentro} de ${tramosTrabajo.length} tramos de trabajo dentro` : 'Sin plan: lo que fue'}>
          <Superficie padding="0 16px">
            {s.tramos.map((t, i) => (
              <div key={t.n} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', padding: '14px 0', borderTop: i > 0 ? '1px solid var(--twin-hairline)' : undefined }}>
                <MarcaCumplimiento c={t.prescrito ? t.cumplimiento : 'sin-plan'} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <Cuerpo fuerte>{t.nombre_es}</Cuerpo>
                  {t.prescrito ? (
                    <Etiqueta>
                      Pedido: {unirUnidades(t.prescrito.medida_es)}
                      {t.prescrito.objetivo_es ? ` · ${unirUnidades(t.prescrito.objetivo_es)}` : ''}
                    </Etiqueta>
                  ) : null}
                  <span style={{ ...fuente(500, TAM.cuerpo, 1.3), color: P.tinta, textWrap: 'pretty' }}>
                    {t.hecho.medida_es === t.prescrito?.medida_es ? '' : `${t.hecho.medida_es} · `}
                    {t.hecho.valor_es}
                    {t.hecho.extra_es ? <span style={{ color: P.tinta2 }}> · {t.hecho.extra_es}</span> : null}
                  </span>
                  {t.prescrito && t.cumplimiento !== 'dentro' && t.cumplimiento !== 'sin-plan' ? <Etiqueta>{CUMPLIMIENTO_PALABRA[t.cumplimiento]}</Etiqueta> : null}
                </div>
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  {t.carga.tss != null ? <Numeral texto={String(Math.round(t.carga.tss))} cuerpo={DATO_FILA} /> : <span style={{ ...fuente(700, DATO_FILA, 1), color: P.tinta2 }}>?</span>}
                  <Etiqueta>{t.carga.peldano ? PELDANO_NOMBRE[t.carga.peldano] : 'no se sabe'}</Etiqueta>
                </span>
              </div>
            ))}
          </Superficie>
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
              <LineaTiempo piel={P} alto={170} duracion={s.duracion_s} etiqueta="Pulso a lo largo de la sesión" curva={{ puntos: s.curvas.pulso.puntos, formato: (v) => `${Math.round(v)}`, referencias: [{ valor: pulsoMedio, etiqueta: '' }], color: P.tinta }} />
            </Superficie>
            {/* La media va en una nota, no rotulada sobre la línea: ahí pisaba la propia curva del pulso. */}
            <Nota>La línea fina es tu pulso medio: {pulsoMedio} ppm.</Nota>
          </Seccion>
        ) : null}

        {s.parciales ? (
          <Seccion titulo="Parciales" pregunta="Por kilómetro">
            <Superficie>
              <BarrasSimples piel={P} filas={s.parciales.map((q) => ({ id: q.etiqueta_es, etiqueta: q.etiqueta_es, valor: q.segundos, color: P.tinta }))} formato={(v) => reloj(v)} anchoInicial={ancho - 32} altoFila={28} marcar={[s.parciales.reduce((m, q) => (q.segundos < m.segundos ? q : m)).etiqueta_es, s.parciales.reduce((m, q) => (q.segundos > m.segundos ? q : m)).etiqueta_es]} />
            </Superficie>
            <Nota>El más rápido y el más lento van en tinta; los demás, atenuados.</Nota>
          </Seccion>
        ) : null}

        {s.zonas ? (
          <Seccion titulo="Zonas" pregunta="Dónde estuvo tu pulso">
            <Superficie>
              <BarraReparto piel={P} partes={s.zonas.map((seg, i) => ({ code: `z${i + 1}`, etiqueta: `Z${i + 1}`, pct: (seg / s.zonas!.reduce((a, b) => a + b, 0)) * 100, color: colorZonaDe(P, i + 1) })).filter((x) => x.pct > 0)} />
            </Superficie>
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
