'use client';

// LAS CINCO LECTURAS DE «CÓMO CORRE» — mockup `docs/carrera-en-el-panel.html`,
// apartados 05 y 06.
//
// Tres son rasgos del ATLETA que hasta ahora nacían y morían dentro de una
// sesión (calibración, coste de correr cansado, huella) y dos son huecos del
// panel que el análisis destapó (kilómetros por semana, y la carga, que se
// calculaba y no se enseñaba).
//
// LO QUE COMPARTEN Y NO SE NEGOCIA: el veredicto va delante y los números
// debajo; un umbral del coach que haya decidido algo se escribe; y cuando no
// hay muestra para afirmar, se dice cuánta falta en vez de pintar un cero.

import { PACING_SHAPE_LABEL } from '@fahybrid/shared/domain/running/pacing-shape';
import type { AthleteWeekChipKind } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import {
  allowsFreshnessVerdict,
  weekHasSessions,
} from '@fahybrid/shared/domain/coach/honest-week';
import type { RunningAnalyticsPayload } from '@/lib/coach/running-analytics';
import {
  BarrasSemanales,
  BarraSesgo,
  Cifra,
  Cifras,
  ColumnasPorPosicion,
  formatCoste,
  LineaDeCoste,
  NotaMetodo,
  Panel,
  SinBastante,
  Veredicto,
} from './piezas';

// ---------------------------------------------------------------------------
// 1 · ¿Le estoy poniendo bien los ritmos?
// ---------------------------------------------------------------------------

/**
 * HACIA DÓNDE FALLA ES LO QUE INFORMA, no el porcentaje. La frase sale del
 * recuento de direcciones, que es dato: no se infiere nada que el payload no
 * diga.
 */
function fraseDeSesgo(rapido: number, lento: number): string {
  if (rapido === 0 && lento === 0) return 'Todo lo que le pides, lo clava.';
  if (rapido > 0 && lento > 0) return 'Se le va por los dos lados.';
  return lento > 0 ? 'Va largo, no corto.' : 'Va corto, no largo.';
}

export function PanelCalibracion({ analytics }: { analytics: RunningAnalyticsPayload }) {
  const { calibration, thresholds, window_weeks } = analytics;
  const { bias, positions, has_enough_data, min_series_required } = calibration;

  if (bias.total === 0) {
    return (
      <Panel titulo="¿Le estoy poniendo bien los ritmos?">
        <SinBastante>
          En las últimas {window_weeks} semanas no ha hecho ninguna serie con ritmo objetivo. Esta lectura sólo entra
          por tramos de ritmo: los rodajes y lo que se corre por sensaciones responderían otra pregunta.
        </SinBastante>
      </Panel>
    );
  }

  const fuera = bias.fuera_rapido + bias.fuera_lento;

  return (
    <Panel titulo="¿Le estoy poniendo bien los ritmos?" chip={`${bias.total} series con ritmo objetivo`}>
      {has_enough_data ? (
        <Veredicto
          frase={fraseDeSesgo(bias.fuera_rapido, bias.fuera_lento)}
          apoyo={
            fuera > 0
              ? `${bias.dentro} de ${bias.evaluable} en banda. Las columnas dicen en qué repetición se rompe.`
              : `${bias.dentro} de ${bias.evaluable} en banda.`
          }
        />
      ) : (
        <SinBastante>
          Llevan {bias.total} de las {min_series_required} series que pides para juzgar la calibración. Los recuentos de
          abajo son reales; el porcentaje de acierto se retira hasta que haya muestra, porque con pocas series diría más
          de lo que sabe.
        </SinBastante>
      )}

      <BarraSesgo
        rapido={bias.fuera_rapido}
        dentro={bias.dentro}
        lento={bias.fuera_lento}
        pct={has_enough_data ? bias.pct_dentro : null}
      />

      {fuera > 0 && has_enough_data ? (
        <p className="max-w-[62ch] text-xs leading-relaxed text-[color:var(--v2-muted)]">
          El mismo {bias.pct_dentro} % con los fallos del otro lado querría decir lo contrario, y es la razón por la que
          el porcentaje solo no sirve.
        </p>
      ) : null}

      {positions.length > 0 ? (
        <>
          <h4 className="v2-micro mt-1">Dónde se rompe dentro de la serie</h4>
          <ColumnasPorPosicion posiciones={positions} minPorPosicion={thresholds.min_reps_per_position} />
        </>
      ) : null}

      <NotaMetodo>
        Sale de sesiones de series con ritmo objetivo de las últimas {window_weeks} semanas. Los rodajes y las sesiones
        por sensaciones no entran: mezclarlos taparía justo lo que se está mirando.
      </NotaMetodo>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 2 · Lo que le cuesta correr cansado
// ---------------------------------------------------------------------------

export function PanelComprometida({ analytics }: { analytics: RunningAnalyticsPayload }) {
  const { compromised, thresholds } = analytics;
  const { points, valid_pairs, has_enough_data, min_pairs_required } = compromised;

  if (points.length === 0) {
    return (
      <Panel titulo="Lo que le cuesta correr cansado" chip="Solo aquí" chipTono="accent">
        <SinBastante>
          Todavía no hay ninguna pareja con la que comparar. Hace falta el mismo objetivo corrido en fresco y detrás de
          trabajo: sin pareja no hay número, porque medir un rodaje suave contra unas series no diría nada.
        </SinBastante>
      </Panel>
    );
  }

  const primero = points[0]!.cost_s_per_km;
  const ultimo = points[points.length - 1]!.cost_s_per_km;
  const frase =
    points.length < 2
      ? 'Primera medida del coste.'
      : ultimo < primero
        ? 'Cada vez le cuesta menos.'
        : ultimo > primero
          ? 'Cada vez le cuesta más.'
          : 'El coste no se mueve.';

  return (
    <Panel titulo="Lo que le cuesta correr cansado" chip="Solo aquí" chipTono="accent">
      <Veredicto
        frase={frase}
        apoyo={
          points.length < 2
            ? `${formatCoste(ultimo)} s/km de más al correr detrás de trabajo.`
            : `De ${formatCoste(primero)} a ${formatCoste(ultimo)} s/km en ${points.length} semanas con medida. Es la cualidad que separa a un corredor híbrido de uno de asfalto, y es la que se entrena.`
        }
      />
      <LineaDeCoste puntos={points} />
      <NotaMetodo>
        Segundos por kilómetro de más al correr después de trabajo, contra su propio ritmo en fresco al mismo objetivo.
        Sobre {valid_pairs} {valid_pairs === 1 ? 'comparación válida' : 'comparaciones válidas'}.
        {has_enough_data
          ? ''
          : ` Pides ${min_pairs_required} para dar la curva por buena, así que de momento es un indicio, no una tendencia.`}
        {' '}Qué cuenta como trabajo previo lo decides tú.
      </NotaMetodo>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 3 · Cómo reparte el esfuerzo
// ---------------------------------------------------------------------------

export function PanelHuella({ analytics }: { analytics: RunningAnalyticsPayload }) {
  const { pacing_shape, window_weeks } = analytics;
  const { total, aguantaste, de_menos_a_mas, se_te_fue } = pacing_shape;

  if (total === 0) {
    return (
      <Panel titulo="Cómo reparte el esfuerzo">
        <SinBastante>
          Ninguna sesión de las últimas {window_weeks} semanas tiene forma que leer. Un rodaje uniforme no la tiene, y
          una serie corta tampoco: hacen falta varios tramos para ver cómo repartió.
        </SinBastante>
      </Panel>
    );
  }

  // El rasgo se afirma sólo cuando UNA forma es mayoría. Con el reparto
  // repartido, lo honesto es decir que no tiene una forma fija, no elegir la
  // más frecuente y llamarla rasgo.
  const mayor = Math.max(aguantaste, de_menos_a_mas, se_te_fue);
  const hayMayoria = mayor * 2 > total;
  const cual = se_te_fue === mayor ? 'se_te_fue' : de_menos_a_mas === mayor ? 'de_menos_a_mas' : 'aguantaste';
  const FRASE = {
    se_te_fue: 'Sale fuerte y se apaga.',
    de_menos_a_mas: 'Va de menos a más.',
    aguantaste: 'Aguanta de principio a fin.',
  } as const;

  return (
    <Panel titulo="Cómo reparte el esfuerzo" chip={`${total} ${total === 1 ? 'sesión' : 'sesiones'} con forma legible`}>
      <Veredicto
        frase={hayMayoria ? FRASE[cual] : 'No tiene una forma fija.'}
        apoyo={
          hayMayoria
            ? `${mayor} de ${total} sesiones. Es un rasgo suyo, no de un entreno.`
            : `De ${total} sesiones, el reparto no repite ninguna forma. Elegir la más frecuente y llamarla rasgo sería inventarlo.`
        }
      />
      <Cifras>
        <Cifra etiqueta={PACING_SHAPE_LABEL.se_te_fue} valor={String(se_te_fue)} pie={`de ${total} sesiones`} />
        <Cifra etiqueta={PACING_SHAPE_LABEL.aguantaste} valor={String(aguantaste)} pie={`de ${total} sesiones`} />
        <Cifra etiqueta={PACING_SHAPE_LABEL.de_menos_a_mas} valor={String(de_menos_a_mas)} pie={`de ${total} sesiones`} />
      </Cifras>
      <NotaMetodo>
        Son las mismas tres palabras que la app le enseña a él al terminar de correr, agregadas por sesión.
      </NotaMetodo>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 4 · Kilómetros por semana
// ---------------------------------------------------------------------------

export function PanelVolumen({ analytics }: { analytics: RunningAnalyticsPayload }) {
  const { weeks, trend } = analytics.volume;
  const conKm = weeks.some((w) => w.km > 0);

  if (!conKm) {
    return (
      <Panel titulo="Kilómetros por semana">
        <SinBastante>No hay ni un kilómetro corrido en las semanas que se miran.</SinBastante>
      </Panel>
    );
  }

  const pct = trend.pct_vs_previous_weeks;
  const chip =
    pct != null
      ? `${pct > 0 ? '+' : ''}${pct} % la semana pasada contra las ${trend.compare_weeks} anteriores`
      : null;

  return (
    <Panel titulo="Kilómetros por semana" chip={chip}>
      <BarrasSemanales semanas={weeks} />
      <NotaMetodo>
        La barra rayada es la semana en curso: lleva menos de siete días y no se compara con las cerradas. Aquí no hay
        listón ni color de aviso, porque dónde está el techo de una semana buena, y cuánto se puede subir de una a otra,
        es tuyo y no nuestro.
      </NotaMetodo>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 5 · La carga, con el veredicto delante
// ---------------------------------------------------------------------------

export function PanelCarga({
  analytics,
  weekChipKind,
}: {
  analytics: RunningAnalyticsPayload;
  weekChipKind: AthleteWeekChipKind;
}) {
  const { load } = analytics;
  const { ctl, atl, tsb, acr, coverage, cold_start, allows_verdict, is_alert, freshness_alert_tsb } = load;

  // El signo menos es el TIPOGRÁFICO (U+2212), el mismo que usa la lectura de
  // una carrera para «al parar −34 ppm». Un guion ASCII al lado de una cifra
  // grande se lee como un guion de relleno, que es justo lo que no hay aquí.
  const conSigno = (n: number) => (n < 0 ? `−${Math.abs(Math.round(n))}` : `+${Math.round(n)}`);
  const redondo = (n: number) => String(Math.round(n));
  const frescura = conSigno(tsb);
  const haySemana = weekHasSessions(weekChipKind);
  const showVerdict = allowsFreshnessVerdict(allows_verdict, weekChipKind);

  return (
    <Panel titulo="Carga" chip={`Fondo sobre ${cold_start.ctl_window_days} días`}>
      {showVerdict ? (
        <Veredicto
          frase={is_alert ? 'Está apretando.' : 'No está apretando.'}
          tono={is_alert ? 'alerta' : null}
          apoyo={
            is_alert
              ? `La carga reciente va ${Math.abs(Math.round(tsb))} por encima de su fondo.`
              : `Su frescura está en ${frescura}, por encima del corte que pusiste.`
          }
        />
      ) : (
        <SinBastante>
          {!haySemana
            ? 'Esta semana no hay kilómetros de los que leer frescura.'
            : (
              <>
                Los números están, pero no se puede decir si está apretando.{' '}
                {!cold_start.is_warmed_up
                  ? cold_start.days_of_history == null
                    ? 'No tiene ninguna sesión ejecutada desde la que contar el fondo.'
                    : `El fondo se calcula sobre ${cold_start.ctl_window_days} días y lleva ${cold_start.days_of_history}: le faltan ${cold_start.days_missing} para que se asiente.`
                  : (coverage.note_es ?? 'Falta cobertura de carga en la ventana.')}
              </>
            )}
        </SinBastante>
      )}

      <Cifras>
        <Cifra etiqueta="Fondo" valor={redondo(ctl)} pie="lo que aguanta de normal" />
        <Cifra etiqueta="Reciente" valor={redondo(atl)} pie="lo que ha metido estos días" />
        <Cifra
          etiqueta="Frescura"
          valor={haySemana ? frescura : '—'}
          pie={haySemana ? 'fondo menos reciente' : 'sin kilómetros esta semana'}
          tono={showVerdict && is_alert ? 'var(--v2-warn)' : undefined}
        />
        {acr != null ? <Cifra etiqueta="Reciente contra fondo" valor={acr.toFixed(2).replace('.', ',')} /> : null}
      </Cifras>

      {coverage.state === 'partial' && coverage.note_es ? (
        <NotaMetodo>{coverage.note_es}</NotaMetodo>
      ) : null}

      <NotaMetodo>
        Avisa cuando la frescura baja de {conSigno(freshness_alert_tsb)}. Cuántos días son el fondo, cuántos lo reciente y a
        partir de qué frescura esto es un aviso lo pones tú.
      </NotaMetodo>
    </Panel>
  );
}
