'use client';

// LA PREVIA — el móvil del atleta con lo que el coach acaba de escribir.
//
// No es decoración: es el control de calidad. Si la frase se lee rara en este
// móvil, se leerá rara en el suyo.
//
// POR QUÉ SE MONTA ASÍ (decisión de la tanda): el marco, los tokens y los átomos
// son los del DOBLE, importados tal cual — `DeviceFrame` da el lienzo lógico de
// 402×874 pt y `twin.css` los colores de la app, que NO son los del dashboard
// (sus grises son más cálidos y su naranja se apoya en un glifo marrón). Lo
// único propio son los cuerpos de las cinco pantallas (`previa-pantallas.tsx`),
// y son propios porque tienen que leer el BORRADOR de verdad: las pantallas del
// doble están cableadas a su escenario (`PROTOCOLO_CALENTAMIENTO`,
// `PREGUNTA_WAVE`…) y su modelo de nota admite bloques —cifras, repartos,
// líneas de tiempo— que el modelo real todavía no tiene. Adaptar el borrador a
// ese modelo obligaría a inventar datos; esto no forkea el modelo ni un color.

import '@/app/[locale]/(design)/design/twin.css';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DeviceFrame } from '@/components/design-twin/DeviceFrame';
import type { CommunicationKind } from '@fahybrid/shared/domain/coach-communications';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import type { ZoneComparisonDTO } from '@fahybrid/shared/domain/zone-compare';
import { pintaCamino, type Borrador, type FilaBorrador } from '@/lib/dashboard/v2/del-coach-borrador';
import { pedirCamino, pedirComparativa, pedirZonas } from './api';
import { PantallaDelTipo, TIPO_TWIN } from './previa-pantallas';

/** El bisel del doble: lienzo lógico del iPhone 17 Pro (402×874 pt) + 14 px de
 *  marco por lado (`DeviceFrame`, constante IPHONE). */
const MARCO_ANCHO = 402 + 28;
const MARCO_ALTO = 874 + 28;

/**
 * El móvil, a la altura que le den. El lienzo es 402×874 pt de verdad: lo que
 * aquí desborda desborda también en su mano, en vez de fingir una pantalla más
 * larga de la que tiene.
 *
 * La escala la aplica ESTE envoltorio y no `DeviceFrame`: el suyo escala un hijo
 * que en el layout sigue midiendo 902 px de alto, así que en un hueco más bajo el
 * navegador lo alinea arriba y el móvil aparece 200 px desplazado, medio fuera de
 * su columna (medido). Aquí la caja mide ya lo ESCALADO —así centra de verdad— y
 * dentro se escala desde la esquina. El marco recibe su tamaño natural, de modo
 * que su propia escala se queda en 1 y no hay dos escalados encadenados.
 */
export function PreviaMovil({
  b,
  coachName,
  foco,
  camino,
  zonas,
  comparativas,
}: {
  b: Borrador;
  coachName: string;
  foco: string | null;
  camino: PlanPathDTO | null;
  zonas: Map<string, ZoneChartDTO>;
  comparativas: Map<string, ZoneComparisonDTO>;
}) {
  const hueco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  useEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setEscala(Math.min(1, el.clientWidth / MARCO_ANCHO, el.clientHeight / MARCO_ALTO));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // LA PREVIA TE SIGUE: al tocar un paso o una sección, el móvil se coloca en
  // ella. Sin esto, escribir la quinta sección de una nota obliga a arrastrar
  // dentro del móvil para comprobar lo que acabas de escribir — y a la tercera
  // vez ya no se comprueba.
  //
  // Se mueve SÓLO el scroll de dentro del marco: `scrollIntoView` arrastraría
  // también el diálogo del compositor, y el formulario se iría de sitio bajo el
  // cursor del coach. El desplazamiento se mide con rectángulos (que llegan ya
  // escalados por el `transform` de abajo) y se divide por la escala, porque
  // `scrollTop` va en las unidades sin escalar del propio elemento.
  useEffect(() => {
    if (!foco || escala <= 0) return;
    const raiz = hueco.current;
    if (!raiz) return;
    const scroller = raiz.querySelector<HTMLElement>('.twin-scroll');
    const fila = raiz.querySelector<HTMLElement>(`[data-fila="${CSS.escape(foco)}"]`);
    if (!scroller || !fila) return;

    const caja = scroller.getBoundingClientRect();
    const suya = fila.getBoundingClientRect();
    const centrado = suya.top - caja.top - (caja.height - suya.height) / 2;
    scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + centrado / escala), behavior: 'smooth' });
  }, [foco, escala]);

  return (
    <div ref={hueco} className="relative grid h-full w-full place-items-center">
      <div style={{ width: MARCO_ANCHO * escala, height: MARCO_ALTO * escala }}>
        <div
          style={{
            position: 'relative',
            width: MARCO_ANCHO,
            height: MARCO_ALTO,
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
          }}
        >
          <DeviceFrame device="iphone" orientation="portrait" appearance="dark">
            <div
              className="twin-screen-safe"
              style={{ pointerEvents: 'none' }}
              role="img"
              aria-label={`Previsualización: cómo le queda ${TIPO_TWIN[b.kind]} en su móvil`}
            >
              <PantallaDelTipo
                b={b}
                coachName={coachName}
                foco={foco}
                camino={camino}
                zonas={zonas}
                comparativas={comparativas}
              />
            </div>
          </DeviceFrame>
        </div>
      </div>
    </div>
  );
}

/**
 * La previa en su sitio dentro del compositor: pegada al lado mientras escribes
 * en escritorio, plegada detrás de «Ver cómo le queda» en móvil, donde el
 * formulario manda y la previa se consulta.
 *
 * Vive aquí y no en el compositor porque es DÓNDE se enseña la previa, no cómo se
 * escribe el comunicado: los dos huecos son el mismo componente con distinta
 * altura, y tenerlos separados es lo que hace que uno se quede sin el pie.
 */
export function ColumnaPrevia({
  b,
  coachName,
  foco,
  athleteId,
}: {
  b: Borrador;
  coachName: string;
  foco: string | null;
  /** El destinatario, cuando es UNO. Null escribiendo para varios o para la
   *  biblioteca: ahí no hay un plan que enseñar. */
  athleteId: string | null;
}) {
  const camino = useCaminoDelDestinatario(b, athleteId);
  const zonas = useZonasDelDestinatario(b, athleteId);
  const comparativas = useComparativasDelDestinatario(b, athleteId);

  return (
    <>
      <div className="hidden lg:block lg:sticky lg:top-0">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <span className="v2-micro">Cómo le queda</span>
          <span className="text-label text-[color:var(--v2-muted)]">Su móvil</span>
        </div>
        <div className="h-[min(600px,58vh)]">
          <PreviaMovil
            b={b}
            coachName={coachName}
            foco={foco}
            camino={camino}
            zonas={zonas}
            comparativas={comparativas}
          />
        </div>
        <div className="mt-3">
          <PieDePrevia b={b} />
        </div>
      </div>

      <details className="lg:hidden">
        <summary className="v2-focus cursor-pointer list-none rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-4 py-2.5 text-center text-body font-semibold text-[color:var(--v2-fg)]">
          Ver cómo le queda
        </summary>
        <div className="mt-3 h-[520px]">
          <PreviaMovil
            b={b}
            coachName={coachName}
            foco={foco}
            camino={camino}
            zonas={zonas}
            comparativas={comparativas}
          />
        </div>
        <div className="mt-3">
          <PieDePrevia b={b} />
        </div>
      </details>
    </>
  );
}

/**
 * El camino REAL del destinatario, para que la previa enseñe su plan y no un
 * dibujo de ejemplo. Se pide sólo cuando hace falta: si la nota no lleva sección
 * de camino, o se está escribiendo para varios (ahí no hay UN plan), no se pide
 * nada y la previa dice que cada uno ve el suyo.
 */
function useCaminoDelDestinatario(b: Borrador, athleteId: string | null): PlanPathDTO | null {
  // Se guarda DE QUIÉN es lo cargado, no sólo el camino: sin eso, al cambiar de
  // destinatario la previa pintaría el plan del anterior hasta que contestara la
  // segunda llamada, que es enseñarle a un atleta el plan de otro.
  const [cargado, setCargado] = useState<{ athleteId: string; camino: PlanPathDTO | null } | null>(
    null,
  );
  const haceFalta = pintaCamino(b);

  useEffect(() => {
    if (!haceFalta || !athleteId) return;
    let vigente = true;
    void (async () => {
      const r = await pedirCamino(athleteId);
      // Un fallo deja la previa sin camino, que ya tiene su propia frase. Nunca
      // un dibujo de ejemplo: sería enseñar un plan que no es de nadie.
      if (vigente) setCargado({ athleteId, camino: r.ok ? r.data : null });
    })();
    return () => {
      vigente = false;
    };
  }, [haceFalta, athleteId]);

  if (!haceFalta || !athleteId) return null;
  return cargado?.athleteId === athleteId ? cargado.camino : null;
}

/**
 * Las barras de tiempo en zonas del destinatario, una por sección con gráfica.
 *
 * Se piden por PERIODO y no por sección: dos gráficas de la misma nota que miren
 * lo mismo comparten la respuesta. Se guarda DE QUIÉN es lo cargado por la misma
 * razón que el camino — al cambiar de destinatario, enseñar lo del anterior
 * sería enseñarle a un atleta los datos de otro.
 */
function useZonasDelDestinatario(b: Borrador, athleteId: string | null): Map<string, ZoneChartDTO> {
  const [cargado, setCargado] = useState<{ athleteId: string; porVentana: Map<string, ZoneChartDTO> }>(
    () => ({ athleteId: '', porVentana: new Map() }),
  );

  const secciones = b.kind === 'note' ? b.sections.filter((s) => s.display === 'grafica') : [];
  // La firma de lo pedido: si no cambia, no se vuelve a pedir aunque el coach
  // siga escribiendo el texto de al lado.
  const firma = secciones.map((s) => claveDeVentana(s)).join(';');

  useEffect(() => {
    if (!athleteId || firma.length === 0) return;
    let vigente = true;
    const claves = [...new Set(firma.split(';'))];
    void (async () => {
      const nuevas = new Map<string, ZoneChartDTO>();
      await Promise.all(
        claves.map(async (clave) => {
          const [week_start, weeks, modality] = clave.split('|');
          const r = await pedirZonas(athleteId, {
            week_start: week_start!,
            weeks: Number(weeks),
            modality: modality === '*' ? null : (modality ?? null),
          });
          // Un fallo deja esa gráfica sin barras, y la previa ya tiene su frase.
          // Nunca un dibujo de ejemplo: sería enseñar datos que no son de nadie.
          if (r.ok) nuevas.set(clave, r.data);
        }),
      );
      if (vigente) setCargado({ athleteId, porVentana: nuevas });
    })();
    return () => {
      vigente = false;
    };
  }, [athleteId, firma]);

  const porSeccion = new Map<string, ZoneChartDTO>();
  if (!athleteId || cargado.athleteId !== athleteId) return porSeccion;
  for (const s of secciones) {
    const chart = cargado.porVentana.get(claveDeVentana(s));
    if (chart) porSeccion.set(s.key, chart);
  }
  return porSeccion;
}

/**
 * Los DOS PERIODOS del destinatario, uno por sección con comparativa.
 *
 * El gemelo de `useZonasDelDestinatario`, con las mismas dos reglas: se piden por
 * PAR de periodos y no por sección (dos comparativas iguales comparten
 * respuesta), y se guarda de quién es lo cargado — al cambiar de destinatario,
 * enseñar lo del anterior sería enseñarle a un atleta los datos de otro.
 */
function useComparativasDelDestinatario(
  b: Borrador,
  athleteId: string | null,
): Map<string, ZoneComparisonDTO> {
  const [cargado, setCargado] = useState<{
    athleteId: string;
    porPar: Map<string, ZoneComparisonDTO>;
  }>(() => ({ athleteId: '', porPar: new Map() }));

  const secciones = b.kind === 'note' ? b.sections.filter((s) => s.display === 'comparativa') : [];
  const firma = secciones.map(claveDePar).join(';');

  useEffect(() => {
    if (!athleteId || firma.length === 0) return;
    let vigente = true;
    const claves = [...new Set(firma.split(';'))];
    void (async () => {
      const nuevas = new Map<string, ZoneComparisonDTO>();
      await Promise.all(
        claves.map(async (clave) => {
          const [a_start, b_start, weeks] = clave.split('|');
          const r = await pedirComparativa(athleteId, {
            a_start: a_start!,
            b_start: b_start!,
            weeks: Number(weeks),
          });
          // Un fallo (o dos periodos que se pisan, que el servidor rechaza) deja
          // esa sección sin totales, y la previa ya tiene su frase. Nunca dos
          // barras de ejemplo: sería enseñar datos que no son de nadie.
          if (r.ok && r.data.comparativa) nuevas.set(clave, r.data.comparativa);
        }),
      );
      if (vigente) setCargado({ athleteId, porPar: nuevas });
    })();
    return () => {
      vigente = false;
    };
  }, [athleteId, firma]);

  const porSeccion = new Map<string, ZoneComparisonDTO>();
  if (!athleteId || cargado.athleteId !== athleteId) return porSeccion;
  for (const s of secciones) {
    const suya = cargado.porPar.get(claveDePar(s));
    if (suya) porSeccion.set(s.key, suya);
  }
  return porSeccion;
}

/** Dos secciones que miran el mismo periodo con el mismo filtro son una sola
 *  petición. La misma clave que usa el servidor al resolverlas. */
function claveDeVentana(s: FilaBorrador): string {
  return `${s.grafica.week_start}|${s.grafica.weeks}|${s.grafica.modality ?? '*'}`;
}

/** Y dos que enfrentan los mismos dos periodos, también. */
function claveDePar(s: FilaBorrador): string {
  return `${s.comparativa.a_start}|${s.comparativa.b_start}|${s.comparativa.weeks}`;
}

/** La línea de debajo del móvil: qué está enseñando y qué NO. */
export function PieDePrevia({ b }: { b: Borrador }) {
  // Un protocolo ya no es siempre una lista de casillas: el pie tiene que decir
  // lo que este de aquí le va a pedir, no lo que le pide el tipo.
  const hayCasillas = b.steps.some((s) => s.checkable && s.content.trim().length > 0);

  const texto: Record<CommunicationKind, ReactNode> = {
    protocol: hayCasillas ? (
      <>
        <b>Se marca paso a paso.</b> La acción de abajo no se le enciende hasta que no queda
        ninguna casilla sin marcar, y ahí es cuando lo ves cerrado. Los pasos en solo lectura no
        cuentan: los lee y ya está.
      </>
    ) : (
      <>
        <b>Este no se marca: se lee.</b> Ningún paso lleva casilla, así que no le pide nada más
        que abrirlo. Sabrás si lo ha abierto, y con eso basta.
      </>
    ),
    question: (
      <>
        <b>Las opciones son la respuesta.</b> No hay botón de enviar: toca una y ya está
        contestado, con la consecuencia delante.
      </>
    ),
    task: (
      <>
        <b>Una tarea no abre pantalla.</b> Vive en su bandeja y se cierra con un toque. El día
        que vence sube arriba, en ámbar.
      </>
    ),
    note: (
      <>
        <b>Una nota se lee por capítulos.</b> Cada sección con su cabecera, no todo en el mismo
        párrafo gris.
      </>
    ),
    focus: (
      <>
        <b>El foco tampoco abre pantalla.</b> Se queda fijo arriba de su bandeja, no caduca y no
        le reclama nada: acompaña.
      </>
    ),
  };
  return (
    <p className="text-label leading-relaxed text-[color:var(--v2-muted)] [&_b]:font-semibold [&_b]:text-[color:var(--v2-fg)]">
      {texto[b.kind]}
    </p>
  );
}
