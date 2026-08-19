'use client';

// LAS SECCIONES DE UNA NOTA, EN LA FICHA DEL COACH.
//
// El coach tiene que poder RELEER lo que le mandó, y releerlo con la misma
// estructura: una nota cuya cifra y cuyo reparto se aplanaran aquí a un párrafo
// gris obligaría a abrir el móvil del atleta para saber qué le llegó. Y una
// sección de camino, que no tiene texto, se leería como una sección vacía —
// como si se le hubiera colado un capítulo en blanco.
//
// Es la MISMA información que el atleta, dicha con los tokens del dashboard:
// aquí no se está previsualizando su móvil, se está leyendo el historial.

import { Espina, TOKENS_V2, TONOS_V2, colorDelTono, tramosDesdePlan } from '@/components/plan-espina';
import { ZonasChart } from '../rendimiento/ZonasChart';
import { ZonasComparativa } from '../rendimiento/ZonasComparativa';
import { buildWindowCells, rangeBands, ZONE_METRICS_EMBED } from '@/lib/zones/chart';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import {
  KIND_LABEL,
  type CommunicationItemDTO,
  type LinkedCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';

export function SeccionesDeNota({ items }: { items: CommunicationItemDTO[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] p-3"
        >
          <Seccion item={item} />
        </li>
      ))}
    </ul>
  );
}

function Seccion({ item }: { item: CommunicationItemDTO }) {
  if (item.display === 'cifra') {
    return (
      <>
        <span className="v2-num text-2xl font-bold leading-none text-[color:var(--v2-fg)]">
          {item.content}
        </span>
        {item.label ? (
          <span className="text-label text-[color:var(--v2-muted)]">{item.label}</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      {item.label ? <span className="v2-micro">{item.label}</span> : null}
      {item.display === 'reparto' ? (
        <Reparto segmentos={item.segments} />
      ) : item.display === 'camino' ? (
        <Camino item={item} />
      ) : item.display === 'grafica' ? (
        <Grafica item={item} />
      ) : item.display === 'comparativa' ? (
        <Comparativa item={item} />
      ) : item.display === 'test_result' ? (
        <TestEmbebido item={item} />
      ) : (
        <span className="whitespace-pre-line text-body leading-relaxed text-[color:var(--v2-fg)]">
          {item.content}
        </span>
      )}
    </>
  );
}

/** La misma barra que ve el atleta: cada trozo pesa su número y su color sale de
 *  la posición, nunca de un catálogo de intensidades. */
function Reparto({ segmentos }: { segmentos: CommunicationItemDTO['segments'] }) {
  if (segmentos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 pt-0.5">
      <div className="flex h-2 gap-[3px] overflow-hidden rounded-[var(--v2-r-pill)]">
        {segmentos.map((s, i) => (
          <span
            key={s.position}
            aria-hidden
            className="min-w-[4px] rounded-[var(--v2-r-pill)]"
            style={{ flex: s.value_num, background: colorDelTono(TONOS_V2, i) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segmentos.map((s, i) => (
          <span key={s.position} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: colorDelTono(TONOS_V2, i) }}
            />
            <span className="v2-num text-label font-bold text-[color:var(--v2-fg)]">
              {s.value_num}
            </span>
            <span className="text-label text-[color:var(--v2-muted)]">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * El camino de ESE atleta, tal y como lo tiene hoy. Si no tiene plan no se
 * dibuja nada inventado: se dice, porque eso es justo lo que él está viendo.
 */
function Camino({ item }: { item: CommunicationItemDTO }) {
  if (!item.camino || item.camino.segments.length === 0) {
    return (
      <span className="text-label leading-relaxed text-[color:var(--v2-muted)]">
        Ahora mismo no tiene plan asignado, así que aquí no le aparece nada. En cuanto le asignes
        uno, esta sección se dibuja sola.
      </span>
    );
  }
  return (
    <div className="pt-1">
      <Espina tokens={TOKENS_V2} tramos={tramosDesdePlan(item.camino, TONOS_V2)} />
    </div>
  );
}

/**
 * La gráfica de ESE atleta en el periodo que el coach congeló, con sus marcas.
 *
 * Es el MISMO componente que dibuja la ficha, con la medida embebida: dentro de
 * una tarjeta de historial lo que se lee es la forma de la serie. Y es el mismo
 * dato que tiene el atleta delante, no una copia que pueda desfasarse.
 *
 * Sin ni una semana con dato se dice, no se pinta un suelo de ceros: el coach
 * tiene que saber que lo que le llegó al atleta fue una gráfica vacía.
 */
function Grafica({ item }: { item: CommunicationItemDTO }) {
  const chart = item.grafica;
  if (!chart || chart.weeks_data.length === 0) {
    return (
      <span className="text-label leading-relaxed text-[color:var(--v2-muted)]">
        De ese periodo no hay ni un entreno con pulso medido, así que a él le aparece vacía. En
        cuanto lleguen entrenos con pulso, la gráfica de esta nota los tendrá.
      </span>
    );
  }
  const cells = buildWindowCells({
    weeks_data: chart.weeks_data,
    week_start: chart.week_start,
    weeks: chart.weeks,
  });
  return (
    <div className="pt-1">
      <ZonasChart
        cells={cells}
        bands={[]}
        ranges={rangeBands(cells, chart.ranges)}
        ariaLabel={`Su tiempo en zonas, ${chart.weeks} semanas`}
        metrics={ZONE_METRICS_EMBED}
      />
    </div>
  );
}

/**
 * Los dos periodos de ESE atleta, enfrentados como los tiene él delante.
 *
 * El MISMO bloque que el mando «Comparar» de Rendimiento, con los tokens del
 * dashboard: aquí no se está previsualizando su móvil, se está releyendo lo que
 * se le mandó. Y es el mismo dato, no una copia que pueda desfasarse.
 */
function Comparativa({ item }: { item: CommunicationItemDTO }) {
  const cmp = item.comparativa;
  if (!cmp) {
    return (
      <span className="text-label leading-relaxed text-[color:var(--v2-muted)]">
        Los dos periodos de esta sección se suman con los datos del atleta que la mira. Aquí no hay
        ninguno delante.
      </span>
    );
  }
  return (
    <div className="pt-1">
      <ZonasComparativa comparativa={cmp} />
    </div>
  );
}

/**
 * El pie del enlace cruzado: qué otro comunicado cierra a éste, y si el atleta ya
 * lo resolvió. Es lo que convierte «le mandé la nota» en «le mandé la nota y
 * sigue sin contestarme la pregunta de la que depende».
 */
function TestEmbebido({ item }: { item: CommunicationItemDTO }) {
  const report = item.test_result?.report;
  if (!report) {
    return <span className="text-label text-[color:var(--v2-muted)]">El informe de esa ocurrencia.</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-[family-name:var(--v2-font-display)] text-[28px] font-extrabold leading-none text-[color:var(--v2-accent-text)]">
        {Math.round(report.unloaded_cm)}
        <span className="ml-1 text-[12px] font-medium text-[color:var(--v2-muted)]">cm</span>
      </p>
      <p className="text-[12px] text-[color:var(--v2-muted)]">
        {report.height_label}
        {report.lri_label ? ` · LRI ${report.lri_label.toLowerCase()}` : ''}
      </p>
      <p className="text-[13px] leading-snug">{report.lectura}</p>
    </div>
  );
}

export function EnlaceDelDetalle({ linked }: { linked: LinkedCommunicationDTO | null }) {
  if (!linked) return null;
  const cerrado = linked.state === 'answered' || linked.state === 'done';

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <span className="flex flex-wrap items-center gap-2">
        <MIcon name="link" size={14} className="text-[color:var(--v2-muted)]" />
        <span className="v2-micro">Se cierra con</span>
        <Pill tone={cerrado ? 'ok' : 'accent'} variant="soft">
          {KIND_LABEL[linked.kind]}
        </Pill>
        {linked.blocks && !cerrado ? (
          <Pill tone="warn" variant="soft">
            Bloquea
          </Pill>
        ) : null}
      </span>
      <span className="text-body font-semibold text-[color:var(--v2-fg)]">{linked.title}</span>
      <span className="text-label text-[color:var(--v2-muted)]">
        {cerrado ? 'Ya lo ha resuelto.' : 'Sigue sin resolver, y esto se apoya en ello.'}
      </span>
    </div>
  );
}
