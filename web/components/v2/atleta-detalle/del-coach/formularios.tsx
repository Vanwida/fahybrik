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
  indicesEnviados,
  opcionVacia,
  type Borrador,
  type FilaBorrador,
  type OpcionBorrador,
} from '@/lib/dashboard/v2/del-coach-borrador';
import {
  AlternadorCasilla,
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
  /**
   * La fila que el coach está tocando, por su clave — o null al soltarla. Es lo
   * que hace que la previa se coloque en lo que estás escribiendo en vez de
   * obligarte a buscarlo dentro del móvil.
   */
  onFoco: (key: string | null) => void;
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

export function FormProtocolo({ b, set, errores, idp, onFoco }: PropsFormulario) {
  const cambiarPaso = (i: number, patch: Partial<FilaBorrador>) =>
    set({ steps: b.steps.map((s, j) => (i === j ? { ...s, ...patch } : s)) });

  // Las filas en blanco no viajan, así que el error de zod llega indexado sobre
  // lo enviado: sin este mapa una fila vacía por delante movería el error rojo a
  // la fila de al lado.
  const enviados = indicesEnviados(b.steps);

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
        ayuda="Se lee bajo el título, antes de los pasos. Si no pones ningún paso, es lo único que lee."
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
        ayuda="Cada paso decide si lleva casilla. Con casilla lo marca al hacerlo; en solo lectura es una línea que lee, como el agua o la comida. La marca de tiempo es opcional: si la pones, se lee como un reloj."
        error={errores.items}
      >
        <FilasOrdenables
          filas={b.steps}
          minimo={0}
          nombreFila="paso"
          onMover={(d, h) => set({ steps: movida(b.steps, d, h) })}
          onQuitar={(i) => set({ steps: sinLa(b.steps, i) })}
          render={(paso, i) => {
            // La fila que no viaja no puede tener error: no se ha enviado.
            const enviado = enviados.get(paso.key) ?? -1;
            const errorContenido = errorItem(errores, enviado, 'content');
            return (
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2"
                onFocusCapture={() => onFoco(paso.key)}
                onBlurCapture={() => onFoco(null)}
              >
                <Entrada
                  value={paso.label}
                  maxLength={MAX_ITEM_LABEL_CHARS}
                  error={!!errorItem(errores, enviado, 'label')}
                  ariaLabel={`Marca de tiempo del paso ${i + 1}`}
                  onChange={(v) => cambiarPaso(i, { label: v })}
                  placeholder={ejemplo(i, "−40'")}
                  className="v2-num sm:w-[92px] sm:shrink-0 sm:text-right"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Entrada
                    value={paso.content}
                    maxLength={MAX_ITEM_CONTENT_CHARS}
                    error={!!errorContenido}
                    ariaLabel={`Texto del paso ${i + 1}`}
                    onChange={(v) => cambiarPaso(i, { content: v })}
                    placeholder={ejemplo(i, "Movilidad de cadera y tobillo, 5'.")}
                  />
                  {errorContenido ? <ErrorCampo mensaje={errorContenido} /> : null}
                </div>
                <AlternadorCasilla
                  checkable={paso.checkable}
                  indice={i + 1}
                  onChange={(v) => cambiarPaso(i, { checkable: v })}
                />
              </div>
            );
          }}
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

export function FormPregunta({ b, set, errores, idp, onFoco }: PropsFormulario) {
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
            <div
              className="flex flex-col gap-2"
              onFocusCapture={() => onFoco(opcion.key)}
              onBlurCapture={() => onFoco(null)}
            >
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
            </div>
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

/**
 * El formulario que le toca al tipo elegido, menos la NOTA: la suya vive en
 * `formulario-nota.tsx` y pide dos cosas que sólo el compositor tiene (los
 * candidatos a enlazar y a quién avisar del foco), así que la enruta él. Un
 * enrutador que fingiera saberlo obligaría a pasarle esas dos props a los cinco.
 */
export function FormularioDelTipo(props: PropsFormulario) {
  if (props.b.kind === 'protocol') return <FormProtocolo {...props} />;
  if (props.b.kind === 'question') return <FormPregunta {...props} />;
  if (props.b.kind === 'task') return <FormTarea {...props} />;
  return <FormFoco {...props} />;
}
