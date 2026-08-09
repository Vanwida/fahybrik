'use client';

// EL COMPOSITOR — escribir un comunicado y ponerlo donde toque.
//
// Cinco chips arriba y el formulario cambia entero debajo, porque un protocolo y
// una pregunta no se escriben igual. A la derecha, siempre, el móvil del atleta
// con lo que acabas de escribir: si la frase se lee rara ahí, se leerá rara en
// el suyo. En 390 la previa se pliega detrás de «Ver cómo le queda» — ahí el
// formulario manda y la previa se consulta, no se vigila.
//
// DOS MODOS, Y NO SON UN MATIZ DE COPIA:
//   · `publicar`  — escribe un comunicado y se lo pone a sus DESTINATARIOS. Uno
//     desde la ficha del atleta (ahí el destinatario ya está resuelto y no se
//     pregunta), varios desde la Biblioteca.
//   · `plantilla` — escribe un MOLDE. No le llega a nadie, así que no hay
//     destinatarios, no hay «Publicar» y no hay interruptor de «guardar en
//     biblioteca»: la plantilla YA es la biblioteca. La base de datos lo respalda
//     (`coach_communications_template_chk` prohíbe una plantilla publicada), y por
//     eso publicar DESDE una plantilla es escribir una copia y publicar la copia.

import { useCallback, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { cn } from '@/lib/utils';
import {
  COMMUNICATION_KINDS,
  type CoachCommunicationDTO,
  type CommunicationKind,
} from '@fahybrid/shared/domain/coach-communications';
import {
  ANCHOR_CHOICES,
  ANCHOR_COACH_LABEL,
  KIND_COACH_ASKS,
  KIND_COACH_LABEL,
  aInput,
  anchorAthleteLabel,
  avisoPublicado,
  borradorVacio,
  conTipo,
  desdeComunicado,
  erroresDe,
  paraQuien,
  type Borrador,
} from '@/lib/dashboard/v2/del-coach';
import { actualizar, crear, publicar } from './api';
import { PanelBiblioteca, useBiblioteca } from './biblioteca';
import { Campo, ChipsUnicos, Interruptor } from './campos';
import { FormularioDelTipo } from './formularios';
import { ColumnaPrevia } from './previa';

/** Qué acto está haciendo el compositor. */
export type ModoCompositor = 'publicar' | 'plantilla';

/** Un destinatario: lo mínimo para publicarle y para nombrarlo en pantalla. */
export interface Destinatario {
  athlete_id: string;
  full_name: string;
}

/**
 * De dónde parte el formulario. `id` es EL COMUNICADO QUE SE ESTÁ ESCRIBIENDO, y
 * por eso su significado lo fija el modo: en `publicar` es el borrador que se
 * reusa (publicarlo NO lo duplica); en `plantilla`, la plantilla que se
 * reescribe. Una PLANTILLA cargada para publicar viaja con `id: null` — es un
 * molde, y de un molde se escribe una copia.
 */
export interface PartidaCompositor {
  b: Borrador;
  id: string | null;
}

/**
 * Qué le pasó a la biblioteca del coach al pasar por aquí. La ficha del atleta no
 * lo mira (se relee entera del servidor); la pestaña de Biblioteca sí, y así
 * refresca su rejilla sin volver a pedir la lista y hacerla parpadear.
 */
export interface CambioEnBiblioteca {
  /** Entra o se actualiza: una plantilla guardada, un borrador guardado, o el
   *  molde que dejó una publicación con «Guardar en biblioteca» marcado. */
  guardado: CoachCommunicationDTO | null;
  /** Dejó de estar sin publicar: sale de la lista de borradores. */
  publicadoId: string | null;
}

/** Qué pasa al publicar, dicho por tipo. Es la frase que evita el «¿y ahora qué?». */
const NOTA_AL_PUBLICAR: Record<CommunicationKind, string> = {
  protocol: 'Le llega el aviso y podrás ver por qué paso va, no sólo si lo ha abierto.',
  question: 'Le sale la primera de su bandeja. Verás su respuesta escrita aquí, sin abrir nada.',
  task: 'No le abre pantalla: la marca con un toque desde su bandeja. Si vence, sube en ámbar.',
  note: 'Una nota no pide acto, pide que la entienda. Sabrás si la ha abierto, y con eso basta.',
  focus: 'El foco no caduca y no le reclama nada. Se queda fijo hasta que tú lo retires.',
};

/** Lo mismo para un molde: lo que NO hace es justo lo que hay que decir. */
const NOTA_AL_GUARDAR =
  'Una plantilla no le llega a nadie. Queda escrita para que la publiques cuando quieras, cambiando sólo lo que cambie.';

/** Retomar un borrador desde la biblioteca no trae destinatarios: ahí sólo se
 *  escribe, y publicar a nadie no es publicar. */
const NOTA_SIN_DESTINATARIOS =
  'Sigue sin publicar. Para mandárselo a alguien, ciérralo y usa «Publicar a…».';

const OPCIONES_TIPO = COMMUNICATION_KINDS.map((k) => ({ value: k, label: KIND_COACH_LABEL[k] }));
const OPCIONES_ANCLA = ANCHOR_CHOICES.map((a) => ({ value: a, label: ANCHOR_COACH_LABEL[a] }));

/** ¿Hay algo escrito que se perdería al cerrar? */
function tieneContenido(b: Borrador): boolean {
  return (
    b.title.trim().length > 0 ||
    b.body.trim().length > 0 ||
    b.final_note.trim().length > 0 ||
    b.due_date.length > 0 ||
    [...b.steps, ...b.sections].some((f) => f.label.trim() || f.content.trim()) ||
    b.options.some((o) => o.content.trim() || o.consequence.trim())
  );
}

export function Compositor({
  modo,
  destinatarios,
  coachName,
  partida,
  onCerrar,
  onHecho,
}: {
  modo: ModoCompositor;
  /** A quién se le publica. Vacío en `plantilla`: un molde no tiene destinatario. */
  destinatarios: Destinatario[];
  /** El nombre con el que el atleta lo verá firmado (el del club). */
  coachName: string;
  /** De dónde parte el formulario. Ausente = en blanco. */
  partida?: PartidaCompositor;
  onCerrar: () => void;
  /** Ha quedado escrito: el aviso para el coach y qué mover en su biblioteca. */
  onHecho: (mensaje: string, cambio: CambioEnBiblioteca) => void;
}) {
  const esPlantilla = modo === 'plantilla';

  const [b, setB] = useState<Borrador>(() => partida?.b ?? borradorVacio('protocol'));
  const [id, setId] = useState<string | null>(partida?.id ?? null);
  const [verBiblioteca, setVerBiblioteca] = useState(false);
  const biblioteca = useBiblioteca();
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [enviando, setEnviando] = useState<'publicar' | 'borrador' | 'plantilla' | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const nombres = useMemo(() => destinatarios.map((d) => d.full_name), [destinatarios]);
  const errores = useMemo(() => erroresDe(b), [b]);
  const hayErrores = Object.keys(errores).length > 0;
  const erroresVisibles = mostrarErrores ? errores : {};

  const set = useCallback((patch: Partial<Borrador>) => {
    setB((prev) => ({ ...prev, ...patch }));
    setFallo(null);
  }, []);

  const cerrar = useCallback(() => {
    if (tieneContenido(b) && !confirmarCierre) {
      setConfirmarCierre(true);
      return;
    }
    onCerrar();
  }, [b, confirmarCierre, onCerrar]);

  const elegirDeBiblioteca = (c: CoachCommunicationDTO, borradorId: string | null) => {
    setB(desdeComunicado(c));
    // Una plantilla es un molde: se escribe un comunicado NUEVO. Un borrador es
    // el mismo comunicado, y publicarlo lo reusa en vez de duplicarlo.
    setId(borradorId);
    setVerBiblioteca(false);
    setMostrarErrores(false);
    setFallo(null);
  };

  /** Escribe el comunicado: reusa el que ya existe si venimos de uno, si no lo crea. */
  const escribir = async () => {
    const input = aInput(b, esPlantilla);
    return id ? actualizar(id, input) : crear(input);
  };

  /** ¿Está todo lo que pide el esquema? Sin esto no se manda nada. */
  const listo = () => {
    setMostrarErrores(true);
    setFallo(null);
    return !hayErrores;
  };

  const guardarPlantilla = async () => {
    if (!listo()) return;
    setEnviando('plantilla');
    const r = await escribir();
    setEnviando(null);
    if (!r.ok) {
      setFallo(r.mensaje);
      return;
    }
    const nueva = id === null;
    // Reescribir la misma la próxima vez, no dejar una segunda igual.
    setId(r.data.id);
    onHecho(
      nueva
        ? 'Plantilla guardada. Ya puedes publicársela a quien quieras.'
        : 'Plantilla actualizada.',
      { guardado: r.data, publicadoId: null },
    );
  };

  const guardarBorrador = async () => {
    if (!listo()) return;
    setEnviando('borrador');
    const r = await escribir();
    setEnviando(null);
    if (!r.ok) {
      setFallo(r.mensaje);
      return;
    }
    setId(r.data.id);
    onHecho('Guardado sin publicar. Lo encontrarás en «Desde biblioteca».', {
      guardado: r.data,
      publicadoId: null,
    });
  };

  const publicarAhora = async () => {
    if (!listo()) return;
    setEnviando('publicar');

    const escrito = await escribir();
    if (!escrito.ok) {
      setEnviando(null);
      setFallo(escrito.mensaje);
      return;
    }

    const pub = await publicar(
      escrito.data.id,
      destinatarios.map((d) => Number(d.athlete_id)),
    );
    if (!pub.ok) {
      setEnviando(null);
      // El comunicado quedó guardado como borrador: decirlo evita que el coach
      // lo reescriba entero y acabe con dos.
      setId(escrito.data.id);
      setFallo(`${pub.mensaje} Se ha guardado sin publicar, no hace falta reescribirlo.`);
      return;
    }

    // El molde va DESPUÉS de publicar: si fuera antes y la publicación fallara,
    // quedaría una plantilla huérfana de algo que el atleta nunca recibió.
    let aviso = avisoPublicado(nombres);
    let molde: CoachCommunicationDTO | null = null;
    if (b.save_to_library) {
      const guardado = await crear(aInput(b, true));
      if (guardado.ok) molde = guardado.data;
      aviso += guardado.ok
        ? ' Guardado también en la biblioteca.'
        : ' No se pudo guardar en la biblioteca: vuelve a marcarlo la próxima vez.';
    }
    setEnviando(null);
    // Si veníamos de un borrador, acaba de dejar de estarlo.
    onHecho(aviso, { guardado: molde, publicadoId: id });
  };

  const ocupado = enviando !== null;
  const titulo = esPlantilla ? (id ? 'Editar plantilla' : 'Nueva plantilla') : 'Nuevo comunicado';

  // La acción principal la decide el acto que se está haciendo. Sin destinatarios
  // NO se ofrece publicar: publicar a nadie no es publicar, y el servidor lo
  // rechazaría después de haberlo prometido.
  const principal = esPlantilla
    ? { texto: 'Guardar plantilla', hacer: guardarPlantilla, clave: 'plantilla' as const }
    : nombres.length > 0
      ? { texto: 'Publicar', hacer: publicarAhora, clave: 'publicar' as const }
      : { texto: 'Guardar sin publicar', hacer: guardarBorrador, clave: 'borrador' as const };

  const subtitulo = esPlantilla
    ? 'Es un molde: no le llega a nadie hasta que lo publiques.'
    : nombres.length > 0
      ? `${paraQuien(nombres)}. Esto no es el chat: se publica y se sigue.`
      : 'Todavía sin destinatarios: aquí sólo lo escribes.';

  const nota = esPlantilla
    ? NOTA_AL_GUARDAR
    : nombres.length > 0
      ? NOTA_AL_PUBLICAR[b.kind]
      : NOTA_SIN_DESTINATARIOS;

  return (
    <ModalPortal onEscape={cerrar} escapeEnabled={!ocupado}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pb-[calc(var(--v2-tabbar-h)+0.75rem)] sm:p-6 sm:pb-[calc(var(--v2-tabbar-h)+1.5rem)] lg:pb-6">
      <button
        type="button"
        aria-label="Cerrar el compositor"
        onClick={cerrar}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="compositor-titulo"
        // `max-h-full` = todo el hueco que deja el envoltorio, que ya descuenta
        // por abajo la barra de pestañas de la app: sin eso el pie del diálogo
        // queda justo detrás de ella (medido a 390 y a 768).
        className="v2-focus relative flex max-h-full w-full max-w-[1180px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        {/* ── Cabecera: quién lo recibe, de qué tipo es y de dónde parte ──── */}
        <div className="flex shrink-0 flex-col gap-3.5 border-b border-[color:var(--v2-border)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="compositor-titulo" className="v2-display text-xl text-[color:var(--v2-fg)]">
                {titulo}
              </h2>
              <p className="text-label text-[color:var(--v2-muted)]">{subtitulo}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Escribiendo un molde no se ofrece: sería la biblioteca dentro de
                  la biblioteca, y cargar otra plantilla encima reescribiría ésta. */}
              {esPlantilla ? null : (
                <button
                  type="button"
                  onClick={() => {
                    // La carga la dispara el click, no un efecto: traer la
                    // biblioteca es una reacción a lo que pide el coach.
                    if (!verBiblioteca) void biblioteca.cargar();
                    setVerBiblioteca((v) => !v);
                  }}
                  aria-expanded={verBiblioteca}
                  className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
                >
                  <MIcon name="inventory_2" size={15} />
                  Desde biblioteca…
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar"
                onClick={cerrar}
                className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="close" size={20} />
              </button>
            </div>
          </div>

          <ChipsUnicos
            opciones={OPCIONES_TIPO}
            valor={b.kind}
            onChange={(k) => {
              setB((prev) => conTipo(prev, k));
              setMostrarErrores(false);
            }}
            ariaLabel="Tipo de comunicado"
          />
          <p className="text-label leading-relaxed text-[color:var(--v2-muted)]">
            Elige por lo que quieres que haga, no por lo que quieres contarle. Este le pide{' '}
            <b className="font-semibold text-[color:var(--v2-fg)]">{KIND_COACH_ASKS[b.kind]}</b>.
          </p>

          {verBiblioteca ? (
            <PanelBiblioteca
              estado={biblioteca}
              onElegir={elegirDeBiblioteca}
              onBorrado={(borrado) => setId((actual) => (actual === borrado ? null : actual))}
              onCerrar={() => setVerBiblioteca(false)}
            />
          ) : null}
        </div>

        {/* ── Cuerpo: el formulario y, al lado, su móvil ────────────────────
             `min-h-0` no es decorativo: sin él un `flex-1` no baja de la altura
             de su contenido, así que con el formulario largo el cuerpo empuja el
             pie fuera del diálogo y «Publicar» se sale por abajo (medido a 390). */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <FormularioDelTipo b={b} set={set} errores={erroresVisibles} idp="comp" />

              <Campo
                etiqueta="Dónde le aparece"
                ayuda={
                  <>
                    Decide en qué pantalla se lo encuentra.
                    {anchorAthleteLabel(b.anchor_kind)
                      ? ` A él le sale rotulado como «${anchorAthleteLabel(b.anchor_kind)}».`
                      : ' Suelto en su bandeja, sin colgar de nada.'}
                  </>
                }
              >
                <ChipsUnicos
                  opciones={OPCIONES_ANCLA}
                  valor={b.anchor_kind}
                  onChange={(a) => set({ anchor_kind: a })}
                  ariaLabel="Dónde le aparece"
                />
              </Campo>

              {esPlantilla ? null : (
                <Interruptor
                  checked={b.save_to_library}
                  onChange={(v) => set({ save_to_library: v })}
                  titulo="Guardar en biblioteca"
                  detalle="Queda como plantilla. La próxima vez la eliges, cambias lo que cambie y publicas."
                />
              )}
            </div>

            {/* Escritorio: pegada mientras escribes. Móvil: plegada. */}
            <ColumnaPrevia b={b} coachName={coachName} />
          </div>
        </div>

        {/* ── Pie: publicar, guardar, y qué va a pasar ────────────────────── */}
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-[color:var(--v2-border)] p-4 sm:p-5">
          {fallo ? (
            <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-label font-medium text-[color:var(--v2-danger)]">
              {fallo}
            </p>
          ) : null}
          {mostrarErrores && hayErrores ? (
            <p className="text-label font-medium text-[color:var(--v2-danger)]">
              Falta algo por rellenar. Los campos en rojo dicen qué.
            </p>
          ) : null}
          {confirmarCierre ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2">
              <span className="text-label font-medium text-[color:var(--v2-fg)]">
                Tienes cosas escritas. Si cierras ahora se pierden.
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmarCierre(false)}
                  className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
                >
                  Seguir escribiendo
                </button>
                <button
                  type="button"
                  onClick={onCerrar}
                  className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 text-label font-semibold text-[color:var(--v2-fg)]"
                >
                  Cerrar y perderlo
                </button>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void principal.hacer()}
              disabled={ocupado}
              className={cn(
                'v2-focus inline-flex h-10 items-center gap-2 rounded-[var(--v2-r-s)] px-5 text-body font-bold transition-opacity',
                'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:opacity-90 disabled:opacity-50',
              )}
            >
              {enviando === principal.clave ? (
                <MIcon name="progress_activity" size={16} className="animate-spin" />
              ) : null}
              {principal.texto}
            </button>
            {principal.clave === 'publicar' ? (
              <button
                type="button"
                onClick={() => void guardarBorrador()}
                disabled={ocupado}
                className="v2-focus inline-flex h-10 items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-4 text-body font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)] disabled:opacity-50"
              >
                {enviando === 'borrador' ? (
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                ) : null}
                Guardar sin publicar
              </button>
            ) : null}
            <span className="min-w-[200px] flex-1 text-label leading-relaxed text-[color:var(--v2-muted)]">
              {nota}
            </span>
          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
