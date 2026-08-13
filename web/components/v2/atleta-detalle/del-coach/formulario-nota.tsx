'use client';

// EL FORMULARIO DE LA NOTA — el único de los cinco cuyas secciones tienen FORMA.
//
// Vive aparte de los otros cuatro (`formularios.tsx`) porque es el que creció:
// una sección puede ser un párrafo, una cifra, un reparto o el camino, y cada
// forma pide campos distintos. Enseñarlos todos y esconder los que no tocan es
// exactamente cómo se acaba guardando una cifra con segmentos.
//
// Cero texto libre, también aquí: una cifra es un campo de cifra y un reparto
// son pares valor+etiqueta. Es lo que permite que al otro lado salga un número
// grande en mono y una barra de proporción, en vez de un párrafo gris más.

import {
  MAX_BODY_CHARS,
  MAX_FIGURE_CHARS,
  MAX_ITEMS,
  MAX_ITEM_CONTENT_CHARS,
  MAX_ITEM_LABEL_CHARS,
  MAX_SEGMENT_LABEL_CHARS,
  MAX_TITLE_CHARS,
  REPARTO_MAX_SEGMENTS,
  REPARTO_MIN_SEGMENTS,
  type CommunicationDisplay,
} from '@fahybrid/shared/domain/coach-communications';
import { MIcon } from '@/components/ui/MIcon';
import {
  anclaSirveParaCamino,
  anclaSirveParaComparativa,
  anclaSirveParaGrafica,
  filaVacia,
  segmentoVacio,
  type FilaBorrador,
  type GraficaBorrador,
  type SegmentoBorrador,
} from '@/lib/dashboard/v2/del-coach-borrador';
import type { ParDePeriodos } from '@/lib/zones/comparativa';
import { SeccionComparativa } from './formulario-comparativa';
import { SeccionGrafica } from './formulario-grafica';
import {
  AreaTexto,
  AvisoFila,
  BotonAnadir,
  Campo,
  ChipsUnicos,
  Entrada,
  ErrorCampo,
  FilasOrdenables,
  LineaDeEmbed,
  RotuloFila,
} from './campos';
import type { PropsFormulario } from './formularios';

/** Cómo se llama cada forma para el coach. Las tres últimas se nombran distinto
 *  a propósito: no son formatos de texto como las tres primeras, son cosas que se
 *  dibujan solas con los datos del atleta. */
const FORMAS: ReadonlyArray<{ value: CommunicationDisplay; label: string }> = [
  { value: 'texto', label: 'Texto' },
  { value: 'cifra', label: 'Cifra' },
  { value: 'reparto', label: 'Reparto' },
  { value: 'camino', label: 'El camino' },
  { value: 'grafica', label: 'Sus zonas' },
  { value: 'comparativa', label: 'Antes y ahora' },
  { value: 'test_result', label: 'Este test' },
];

/** Qué es esta sección, en una línea, debajo del selector. */
const QUE_ES: Record<CommunicationDisplay, string> = {
  texto: 'Un capítulo con su cabecera. Lo que se lee de corrido.',
  cifra: 'El número que viene a buscar, en grande. Debajo, el matiz.',
  reparto: 'Una proporción. Se lee de un vistazo en una barra, sin contar.',
  camino: 'Sus semanas como camino, con dónde está hoy y lo que rompe la rutina.',
  grafica: 'Su tiempo en zonas de un periodo, con los rangos que tú marques.',
  comparativa: 'Dos periodos enfrentados: las horas de cada uno y qué ha cambiado.',
  test_result: 'El informe de ESA ocurrencia. Se dibuja solo con el resultado; tú escribes lo que ves.',
};

function sinLa<T>(xs: T[], index: number): T[] {
  return xs.filter((_, i) => i !== index);
}

function movida<T>(xs: T[], desde: number, hasta: number): T[] {
  const copia = [...xs];
  const [fila] = copia.splice(desde, 1);
  if (!fila) return xs;
  copia.splice(hasta, 0, fila);
  return copia;
}

export function FormNota({ b, set, errores, idp, onFoco }: PropsFormulario) {
  const cambiar = (i: number, patch: Partial<FilaBorrador>) =>
    set({ sections: b.sections.map((s, j) => (i === j ? { ...s, ...patch } : s)) });

  return (
    <>
      <Campo etiqueta="Título" htmlFor={`${idp}-titulo`} error={errores.title}>
        <Entrada
          id={`${idp}-titulo`}
          grande
          value={b.title}
          maxLength={MAX_TITLE_CHARS}
          error={!!errores.title}
          onChange={(v) => set({ title: v })}
          placeholder="Tu plan, rehecho para Singles Pro"
        />
      </Campo>

      <Campo
        etiqueta="Una línea de entrada (opcional)"
        htmlFor={`${idp}-entrada`}
        ayuda="Lo que se lee bajo el título, antes del primer capítulo."
        error={errores.body}
      >
        <Entrada
          id={`${idp}-entrada`}
          value={b.body}
          maxLength={MAX_BODY_CHARS}
          error={!!errores.body}
          onChange={(v) => set({ body: v })}
          placeholder="Por qué el objetivo son 1:15 a 1:18."
        />
      </Campo>

      <Campo
        etiqueta="Las secciones"
        ayuda="Cada una elige su forma. En su móvil se leen como capítulos, y la cifra, el reparto y el camino se encuentran sin releer los demás."
        error={errores.items}
      >
        <FilasOrdenables
          filas={b.sections}
          minimo={1}
          nombreFila="sección"
          onMover={(d, h) => set({ sections: movida(b.sections, d, h) })}
          onQuitar={(i) => set({ sections: sinLa(b.sections, i) })}
          render={(seccion, i) => (
            <div
              className="flex flex-col gap-2"
              onFocusCapture={() => onFoco(seccion.key)}
              onBlurCapture={() => onFoco(null)}
            >
              <ChipsUnicos
                compacto
                opciones={FORMAS}
                valor={seccion.display}
                onChange={(display) => cambiar(i, { display })}
                ariaLabel={`Forma de la sección ${i + 1}`}
              />
              <span className="text-label text-[color:var(--v2-faint)]">
                {QUE_ES[seccion.display]}
              </span>
              <Seccion
                seccion={seccion}
                indice={i}
                errores={errores}
                anclaSirve={anclaSirveParaCamino(b)}
                anclaSirveGrafica={anclaSirveParaGrafica(b)}
                anclaSirveComparativa={anclaSirveParaComparativa(b)}
                onCambiar={(patch) => cambiar(i, patch)}
              />
            </div>
          )}
        />
        <BotonAnadir
          onClick={() => set({ sections: [...b.sections, filaVacia()] })}
          disabled={b.sections.length >= MAX_ITEMS}
        >
          + Añadir sección
        </BotonAnadir>
      </Campo>
    </>
  );
}

function Seccion({
  seccion,
  indice,
  errores,
  anclaSirve,
  anclaSirveGrafica,
  anclaSirveComparativa,
  onCambiar,
}: {
  seccion: FilaBorrador;
  indice: number;
  errores: Record<string, string>;
  anclaSirve: boolean;
  anclaSirveGrafica: boolean;
  anclaSirveComparativa: boolean;
  onCambiar: (patch: Partial<FilaBorrador>) => void;
}) {
  const err = (campo: string) => errores[`items.${indice}.${campo}`];

  if (seccion.display === 'test_result') {
    return (
      <div className="flex flex-col gap-2">
        <Cabecera
          valor={seccion.label}
          indice={indice}
          error={err('label')}
          ejemplo="Perfil de salto"
          onChange={(v) => onCambiar({ label: v })}
        />
        <LineaDeEmbed>
          Se dibuja solo con el informe de esa ocurrencia. Tú escribes lo que ves, debajo.
        </LineaDeEmbed>
      </div>
    );
  }

  if (seccion.display === 'comparativa') {
    return (
      <div className="flex flex-col gap-2">
        <Cabecera
          valor={seccion.label}
          indice={indice}
          error={err('label')}
          ejemplo="Antes y ahora, 3 meses contra 3"
          onChange={(v) => onCambiar({ label: v })}
        />
        <SeccionComparativa
          comparativa={seccion.comparativa}
          indice={indice}
          anclaSirve={anclaSirveComparativa}
          onCambiar={(comparativa: ParDePeriodos) => onCambiar({ comparativa })}
        />
      </div>
    );
  }

  if (seccion.display === 'grafica') {
    return (
      <div className="flex flex-col gap-2">
        <Cabecera
          valor={seccion.label}
          indice={indice}
          error={err('label')}
          ejemplo="Tus últimos 6 meses en zonas"
          onChange={(v) => onCambiar({ label: v })}
        />
        <SeccionGrafica
          grafica={seccion.grafica}
          indice={indice}
          anclaSirve={anclaSirveGrafica}
          onCambiar={(patch: Partial<GraficaBorrador>) =>
            onCambiar({ grafica: { ...seccion.grafica, ...patch } })
          }
        />
      </div>
    );
  }

  if (seccion.display === 'camino') {
    return (
      <div className="flex flex-col gap-2">
        <Cabecera
          valor={seccion.label}
          indice={indice}
          error={err('label')}
          ejemplo="La estructura"
          onChange={(v) => onCambiar({ label: v })}
        />
        <LineaDeEmbed>
          Se dibuja solo con su plan: sus microciclos en orden, dónde está hoy y las semanas que
          llevan simulacro o tests. Si le cambias el plan, el dibujo cambia con él.
        </LineaDeEmbed>
        {anclaSirve ? null : (
          <AvisoFila>
            Para que se dibuje, esto tiene que colgar de <b className="font-semibold">su plan</b> o
            de <b className="font-semibold">esta semana</b>. Cámbialo abajo, en «Dónde le aparece».
          </AvisoFila>
        )}
      </div>
    );
  }

  if (seccion.display === 'reparto') {
    return (
      <div className="flex flex-col gap-2">
        <Cabecera
          valor={seccion.label}
          indice={indice}
          error={err('label')}
          ejemplo="6 sesiones sí, 6 a tope no"
          onChange={(v) => onCambiar({ label: v })}
        />
        <Segmentos
          segmentos={seccion.segments}
          indice={indice}
          errores={errores}
          onCambiar={(segments) => onCambiar({ segments })}
        />
      </div>
    );
  }

  if (seccion.display === 'cifra') {
    return (
      <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <div className="flex flex-col gap-1 md:w-[190px] md:shrink-0">
          <RotuloFila>La cifra</RotuloFila>
          <Entrada
            value={seccion.content}
            maxLength={MAX_FIGURE_CHARS}
            error={!!err('content')}
            ariaLabel={`La cifra de la sección ${indice + 1}`}
            onChange={(v) => onCambiar({ content: v })}
            placeholder="1:15 a 1:18"
            className="v2-num text-base font-bold"
          />
          {err('content') ? <ErrorCampo mensaje={err('content')!} /> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <RotuloFila>El pie (opcional)</RotuloFila>
          <Entrada
            value={seccion.label}
            maxLength={MAX_ITEM_LABEL_CHARS}
            error={!!err('label')}
            ariaLabel={`El pie de la cifra ${indice + 1}`}
            onChange={(v) => onCambiar({ label: v })}
            placeholder="La banda se cierra con los tests de la semana 1."
          />
          {err('label') ? <ErrorCampo mensaje={err('label')!} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start">
      <div className="flex flex-col gap-1 md:w-[160px] md:shrink-0">
        <Entrada
          value={seccion.label}
          maxLength={MAX_ITEM_LABEL_CHARS}
          error={!!err('label')}
          ariaLabel={`Cabecera de la sección ${indice + 1}`}
          onChange={(v) => onCambiar({ label: v })}
          placeholder="Qué ha cambiado"
        />
        {err('label') ? <ErrorCampo mensaje={err('label')!} /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AreaTexto
          rows={3}
          value={seccion.content}
          maxLength={MAX_ITEM_CONTENT_CHARS}
          error={!!err('content')}
          ariaLabel={`Cuerpo de la sección ${indice + 1}`}
          onChange={(v) => onCambiar({ content: v })}
          placeholder="Pasar a Singles Pro rompe 5 de las 6 premisas del plan."
        />
        {err('content') ? <ErrorCampo mensaje={err('content')!} /> : null}
      </div>
    </div>
  );
}

/** La cabecera de una sección, que es la misma en las tres formas que la llevan. */
function Cabecera({
  valor,
  indice,
  error,
  ejemplo,
  onChange,
}: {
  valor: string;
  indice: number;
  error?: string;
  ejemplo: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Entrada
        value={valor}
        maxLength={MAX_ITEM_LABEL_CHARS}
        error={!!error}
        ariaLabel={`Cabecera de la sección ${indice + 1}`}
        onChange={onChange}
        placeholder={ejemplo}
      />
      {error ? <ErrorCampo mensaje={error} /> : null}
    </div>
  );
}

/**
 * Los trozos de un reparto. No se arrastran como las secciones: son dos a seis
 * campos cortos, y meter un asa de arrastre dentro de otra hace que ninguna de
 * las dos se agarre bien.
 */
function Segmentos({
  segmentos,
  indice,
  errores,
  onCambiar,
}: {
  segmentos: SegmentoBorrador[];
  indice: number;
  errores: Record<string, string>;
  onCambiar: (segments: SegmentoBorrador[]) => void;
}) {
  const cambiar = (i: number, patch: Partial<SegmentoBorrador>) =>
    onCambiar(segmentos.map((s, j) => (i === j ? { ...s, ...patch } : s)));

  const errorDe = (i: number, campo: string) => errores[`items.${indice}.segments.${i}.${campo}`];

  return (
    <div className="flex flex-col gap-2">
      {segmentos.map((seg, i) => (
        <div key={seg.key} className="flex items-start gap-2">
          <div className="flex w-[84px] shrink-0 flex-col gap-1">
            <Entrada
              value={seg.value}
              error={!!errorDe(i, 'value_num')}
              ariaLabel={`Cuánto pesa el trozo ${i + 1}`}
              onChange={(v) => cambiar(i, { value: v })}
              placeholder={i === 0 ? '3' : undefined}
              className="v2-num text-right"
            />
            {errorDe(i, 'value_num') ? <ErrorCampo mensaje="Escribe un número." /> : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Entrada
              value={seg.label}
              maxLength={MAX_SEGMENT_LABEL_CHARS}
              error={!!errorDe(i, 'label')}
              ariaLabel={`Cómo se llama el trozo ${i + 1}`}
              onChange={(v) => cambiar(i, { label: v })}
              placeholder={i === 0 ? 'duras' : undefined}
            />
            {errorDe(i, 'label') ? <ErrorCampo mensaje={errorDe(i, 'label')!} /> : null}
          </div>
          <button
            type="button"
            onClick={() => onCambiar(sinLa(segmentos, i))}
            disabled={segmentos.length <= REPARTO_MIN_SEGMENTS}
            aria-label={`Quitar el trozo ${i + 1}`}
            className="v2-focus mt-1 shrink-0 rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MIcon name="close" size={16} />
          </button>
        </div>
      ))}
      <BotonAnadir
        onClick={() => onCambiar([...segmentos, segmentoVacio()])}
        disabled={segmentos.length >= REPARTO_MAX_SEGMENTS}
      >
        + Añadir trozo
      </BotonAnadir>
    </div>
  );
}
