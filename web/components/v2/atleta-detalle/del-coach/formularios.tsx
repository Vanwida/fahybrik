'use client';

// LOS CINCO FORMULARIOS. Un protocolo y una pregunta no se escriben igual, así
// que al cambiar de chip cambia el formulario entero — no se enseñan y esconden
// campos de un formulario único, que es como acaban conviviendo una fecha de
// vencimiento y una lista de opciones en el mismo comunicado.
//
// Todo lo que el coach escribe cae en un campo CON NOMBRE (el paso, su marca, la
// opción, su consecuencia, la fecha, el porqué). Cero texto libre: es lo que hace
// que al otro lado se pueda pintar una barra de progreso y decir «respondió
// Sábado 14» en una lista.

import {
  MAX_BODY_CHARS,
  MAX_FINAL_NOTE_CHARS,
  MAX_ITEMS,
  MAX_ITEM_CONSEQUENCE_CHARS,
  MAX_ITEM_CONTENT_CHARS,
  MAX_ITEM_LABEL_CHARS,
  MAX_TITLE_CHARS,
  QUESTION_MAX_OPTIONS,
  QUESTION_MIN_OPTIONS,
} from '@fahybrid/shared/domain/coach-communications';
import {
  filaVacia,
  opcionVacia,
  type Borrador,
  type FilaBorrador,
  type OpcionBorrador,
} from '@/lib/dashboard/v2/del-coach';
import {
  AreaTexto,
  BotonAnadir,
  Campo,
  Entrada,
  ErrorCampo,
  FilasOrdenables,
  Interruptor,
  RotuloFila,
} from './campos';

export interface PropsFormulario {
  b: Borrador;
  set: (patch: Partial<Borrador>) => void;
  errores: Record<string, string>;
  /** Prefijo de los `id` para que dos compositores abiertos no compartan label. */
  idp: string;
}

/** Mover una fila de sitio sin mutar la lista. */
function movida<T>(xs: T[], desde: number, hasta: number): T[] {
  const copia = [...xs];
  const [fila] = copia.splice(desde, 1);
  if (!fila) return xs;
  copia.splice(hasta, 0, fila);
  return copia;
}

function sinLa<T>(xs: T[], index: number): T[] {
  return xs.filter((_, i) => i !== index);
}

/** El error del item `i`, sea del contenido o de la etiqueta. */
function errorItem(errores: Record<string, string>, i: number, campo: string): string | undefined {
  return errores[`items.${i}.${campo}`];
}

/**
 * El ejemplo sólo se pone en la PRIMERA fila. Repetido en todas parece que el
 * formulario ya está relleno con lo mismo dos veces, y una lista de ejemplos
 * clonados no enseña nada que no enseñe uno.
 */
function ejemplo(i: number, texto: string): string | undefined {
  return i === 0 ? texto : undefined;
}

// ---------------------------------------------------------------------------
// Protocolo
// ---------------------------------------------------------------------------

export function FormProtocolo({ b, set, errores, idp }: PropsFormulario) {
  const cambiarPaso = (i: number, patch: Partial<FilaBorrador>) =>
    set({ steps: b.steps.map((s, j) => (i === j ? { ...s, ...patch } : s)) });

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
          placeholder="Calentamiento del día de carrera"
        />
      </Campo>

      <Campo
        etiqueta="Una línea de entrada (opcional)"
        htmlFor={`${idp}-entrada`}
        ayuda="Se lee bajo el título, antes de los pasos. Sirve para decirle cómo se leen."
        error={errores.body}
      >
        <Entrada
          id={`${idp}-entrada`}
          value={b.body}
          maxLength={MAX_BODY_CHARS}
          error={!!errores.body}
          onChange={(v) => set({ body: v })}
          placeholder="Los tiempos cuentan hacia atrás desde tu salida."
        />
      </Campo>

      <Campo
        etiqueta="Los pasos"
        ayuda="Se marcan uno a uno en su móvil. La marca de tiempo es opcional: si la pones, se lee como un reloj."
        error={errores.items}
      >
        <FilasOrdenables
          filas={b.steps}
          minimo={1}
          nombreFila="paso"
          onMover={(d, h) => set({ steps: movida(b.steps, d, h) })}
          onQuitar={(i) => set({ steps: sinLa(b.steps, i) })}
          render={(paso, i) => (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
              <Entrada
                value={paso.label}
                maxLength={MAX_ITEM_LABEL_CHARS}
                error={!!errorItem(errores, i, 'label')}
                ariaLabel={`Marca de tiempo del paso ${i + 1}`}
                onChange={(v) => cambiarPaso(i, { label: v })}
                placeholder={ejemplo(i, "−40'")}
                className="v2-num sm:w-[92px] sm:shrink-0 sm:text-right"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Entrada
                  value={paso.content}
                  maxLength={MAX_ITEM_CONTENT_CHARS}
                  error={!!errorItem(errores, i, 'content')}
                  ariaLabel={`Texto del paso ${i + 1}`}
                  onChange={(v) => cambiarPaso(i, { content: v })}
                  placeholder={ejemplo(i, "Movilidad de cadera y tobillo, 5'.")}
                />
                {errorItem(errores, i, 'content') ? (
                  <ErrorCampo mensaje={errorItem(errores, i, 'content')!} />
                ) : null}
              </div>
            </div>
          )}
        />
        <BotonAnadir
          onClick={() => set({ steps: [...b.steps, filaVacia()] })}
          disabled={b.steps.length >= MAX_ITEMS}
        >
          + Añadir paso
        </BotonAnadir>
      </Campo>

      <Campo etiqueta="Nota final (opcional)" htmlFor={`${idp}-nota`} error={errores.final_note}>
        <AreaTexto
          id={`${idp}-nota`}
          rows={2}
          value={b.final_note}
          maxLength={MAX_FINAL_NOTE_CHARS}
          error={!!errores.final_note}
          onChange={(v) => set({ final_note: v })}
          placeholder="Nada de potenciación pesada: la evidencia no supera el efecto del propio calentamiento."
        />
      </Campo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pregunta
// ---------------------------------------------------------------------------

export function FormPregunta({ b, set, errores, idp }: PropsFormulario) {
  const cambiarOpcion = (i: number, patch: Partial<OpcionBorrador>) =>
    set({ options: b.options.map((o, j) => (i === j ? { ...o, ...patch } : o)) });

  return (
    <>
      <Campo etiqueta="La pregunta" htmlFor={`${idp}-titulo`} error={errores.title}>
        <Entrada
          id={`${idp}-titulo`}
          grande
          value={b.title}
          maxLength={MAX_TITLE_CHARS}
          error={!!errores.title}
          onChange={(v) => set({ title: v })}
          placeholder="¿Tu wave es el jueves o el sábado?"
        />
      </Campo>

      <Campo
        etiqueta="Contexto"
        htmlFor={`${idp}-contexto`}
        ayuda="Por qué se lo preguntas. Sin esto contesta a ciegas."
        error={errores.body}
      >
        <AreaTexto
          id={`${idp}-contexto`}
          rows={2}
          value={b.body}
          maxLength={MAX_BODY_CHARS}
          error={!!errores.body}
          onChange={(v) => set({ body: v })}
          placeholder="El taper está montado contando con el sábado 14."
        />
      </Campo>

      <Campo
        etiqueta="Las opciones"
        ayuda={
          <>
            Entre {QUESTION_MIN_OPTIONS} y {QUESTION_MAX_OPTIONS}. Cada una dice{' '}
            <b className="font-semibold text-[color:var(--v2-fg)]">qué le pasa a su plan</b> si la
            elige, y eso es lo que la separa de una encuesta.
          </>
        }
        error={errores.items}
      >
        <FilasOrdenables
          filas={b.options}
          minimo={QUESTION_MIN_OPTIONS}
          nombreFila="opción"
          onMover={(d, h) => set({ options: movida(b.options, d, h) })}
          onQuitar={(i) => set({ options: sinLa(b.options, i) })}
          render={(opcion, i) => (
            <>
              <div className="flex flex-col gap-1">
                <RotuloFila>Opción</RotuloFila>
                <Entrada
                  value={opcion.content}
                  maxLength={MAX_ITEM_CONTENT_CHARS}
                  error={!!errorItem(errores, i, 'content')}
                  ariaLabel={`Texto de la opción ${i + 1}`}
                  onChange={(v) => cambiarOpcion(i, { content: v })}
                  placeholder={ejemplo(i, 'Sábado 14')}
                />
                {errorItem(errores, i, 'content') ? (
                  <ErrorCampo mensaje={errorItem(errores, i, 'content')!} />
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <RotuloFila>Si la elige</RotuloFila>
                <Entrada
                  value={opcion.consequence}
                  maxLength={MAX_ITEM_CONSEQUENCE_CHARS}
                  error={!!errorItem(errores, i, 'consequence')}
                  ariaLabel={`Consecuencia de la opción ${i + 1}`}
                  onChange={(v) => cambiarOpcion(i, { consequence: v })}
                  placeholder={ejemplo(i, 'El plan se queda como está.')}
                />
              </div>
            </>
          )}
        />
        <BotonAnadir
          onClick={() => set({ options: [...b.options, opcionVacia()] })}
          disabled={b.options.length >= QUESTION_MAX_OPTIONS}
        >
          + Añadir opción
        </BotonAnadir>
      </Campo>

      <Interruptor
        checked={b.blocks}
        onChange={(v) => set({ blocks: v })}
        titulo="Esto bloquea su plan"
        detalle="Mientras no conteste, su plan se queda sin cerrar y se lo decimos en su bandeja."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tarea
// ---------------------------------------------------------------------------

export function FormTarea({ b, set, errores, idp }: PropsFormulario) {
  return (
    <>
      <Campo etiqueta="Qué tiene que hacer" htmlFor={`${idp}-titulo`} error={errores.title}>
        <Entrada
          id={`${idp}-titulo`}
          grande
          value={b.title}
          maxLength={MAX_TITLE_CHARS}
          error={!!errores.title}
          onChange={(v) => set({ title: v })}
          placeholder="Empieza la beta-alanina"
        />
      </Campo>

      <Campo
        etiqueta="Para cuándo"
        htmlFor={`${idp}-fecha`}
        ayuda="Una tarea sin fecha no se cierra nunca. El día que vence sube arriba de su bandeja, en ámbar."
        error={errores.due_date}
      >
        <Entrada
          id={`${idp}-fecha`}
          type="date"
          value={b.due_date}
          error={!!errores.due_date}
          onChange={(v) => set({ due_date: v })}
        />
      </Campo>

      <Campo
        etiqueta="El porqué"
        htmlFor={`${idp}-porque`}
        ayuda="Sin el porqué es un recado, y los recados se posponen."
        error={errores.body}
      >
        <AreaTexto
          id={`${idp}-porque`}
          rows={2}
          value={b.body}
          maxLength={MAX_BODY_CHARS}
          error={!!errores.body}
          onChange={(v) => set({ body: v })}
          placeholder="Necesita 4 a 6 semanas de carga. En septiembre ya no llega útil."
        />
      </Campo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Nota
// ---------------------------------------------------------------------------

export function FormNota({ b, set, errores, idp }: PropsFormulario) {
  const cambiarSeccion = (i: number, patch: Partial<FilaBorrador>) =>
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
        ayuda="Cada sección lleva su cabecera y su cuerpo. En su móvil se leen como capítulos, no como un párrafo largo."
        error={errores.items}
      >
        <FilasOrdenables
          filas={b.sections}
          minimo={1}
          nombreFila="sección"
          onMover={(d, h) => set({ sections: movida(b.sections, d, h) })}
          onQuitar={(i) => set({ sections: sinLa(b.sections, i) })}
          render={(seccion, i) => (
            <div className="flex flex-col gap-2 md:flex-row md:items-start">
              <div className="flex flex-col gap-1 md:w-[160px] md:shrink-0">
                <Entrada
                  value={seccion.label}
                  maxLength={MAX_ITEM_LABEL_CHARS}
                  error={!!errorItem(errores, i, 'label')}
                  ariaLabel={`Cabecera de la sección ${i + 1}`}
                  onChange={(v) => cambiarSeccion(i, { label: v })}
                  placeholder={ejemplo(i, 'Qué ha cambiado')}
                />
                {errorItem(errores, i, 'label') ? (
                  <ErrorCampo mensaje={errorItem(errores, i, 'label')!} />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <AreaTexto
                  rows={3}
                  value={seccion.content}
                  maxLength={MAX_ITEM_CONTENT_CHARS}
                  error={!!errorItem(errores, i, 'content')}
                  ariaLabel={`Cuerpo de la sección ${i + 1}`}
                  onChange={(v) => cambiarSeccion(i, { content: v })}
                  placeholder={ejemplo(i, 'Pasar a Singles Pro rompe 5 de las 6 premisas del plan.')}
                />
                {errorItem(errores, i, 'content') ? (
                  <ErrorCampo mensaje={errorItem(errores, i, 'content')!} />
                ) : null}
              </div>
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

// ---------------------------------------------------------------------------
// Foco
// ---------------------------------------------------------------------------

export function FormFoco({ b, set, errores, idp }: PropsFormulario) {
  return (
    <>
      <Campo
        etiqueta="El foco, en una línea"
        htmlFor={`${idp}-titulo`}
        ayuda="Lo que no se le puede olvidar en semanas. Una cosa, no tres."
        error={errores.title}
      >
        <Entrada
          id={`${idp}-titulo`}
          grande
          value={b.title}
          maxLength={MAX_TITLE_CHARS}
          error={!!errores.title}
          onChange={(v) => set({ title: v })}
          placeholder="Dormir más de 6 horas"
        />
      </Campo>

      <Campo etiqueta="Por qué es el foco" htmlFor={`${idp}-porque`} error={errores.body}>
        <AreaTexto
          id={`${idp}-porque`}
          rows={3}
          value={b.body}
          maxLength={MAX_BODY_CHARS}
          error={!!errores.body}
          onChange={(v) => set({ body: v })}
          placeholder="Sigues por debajo de 6 h desde mayo. Es lo que más minutos puede darte."
        />
      </Campo>
    </>
  );
}

/** El formulario que le toca al tipo elegido. */
export function FormularioDelTipo(props: PropsFormulario) {
  if (props.b.kind === 'protocol') return <FormProtocolo {...props} />;
  if (props.b.kind === 'question') return <FormPregunta {...props} />;
  if (props.b.kind === 'task') return <FormTarea {...props} />;
  if (props.b.kind === 'note') return <FormNota {...props} />;
  return <FormFoco {...props} />;
}
