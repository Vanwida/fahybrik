'use client';

// BorrarEjercicioDialog — el "lo creé sin querer" de un ejercicio PROPIO.
//
// SÓLO SE PREGUNTA LO QUE PUEDE PASAR. El botón que abre esto sólo existe en las
// filas propias (EjercicioRow), así que aquí no hay caso "de la base": ese 409 no se
// gana ofreciendo una acción y negándola después.
//
// LAS DOS RESPUESTAS DEL SERVIDOR NO SE PARECEN EN NADA, y por eso hay dos estados:
//   • BORRADO — no estaba usado en ningún sitio. Era un typo, no historia.
//   • NEGADO (409 `in_use`) — está en sesiones, en bloques o ya lo han entrenado. El
//     servidor no dice "no": dice DÓNDE ("Lo estás usando en 3 sesiones y 1 bloque…").
//     Eso es lo único accionable que hay, así que se enseña VERBATIM y el diálogo se
//     queda en un estado sin "Borrar": reintentar daría exactamente lo mismo hasta
//     que el coach lo quite de donde está. Ver lib/dashboard/exercises/delete-exercise.ts.
//
// Se monta sobre el Dialog del panel (Escape, trampa de foco, portal al tema).

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Dialog } from '@/components/v2/ui';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';

export function BorrarEjercicioDialog({
  ex,
  onClose,
  onDeleted,
}: {
  ex: CoachExerciseRow;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // El "no" razonado del servidor (409 / 404). Mientras esté puesto no hay botón de
  // borrar: no es un fallo que reintentar, es una respuesta.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Lo que sí se reintenta: red caída o un 500. Aquí NO se enseña el mensaje del
  // servidor — un `internal_error` trae el error crudo dentro y eso no es para el coach.
  const [retryable, setRetryable] = useState(false);

  const remove = async () => {
    setBusy(true);
    setRetryable(false);
    try {
      const res = await fetch(`/api/exercises/${ex.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        onDeleted(ex.id);
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message;
      // 409 / 404 son respuestas PENSADAS y ya redactadas para el coach (nombran
      // dónde se usa, o que ya no existe): se enseñan tal cual. Cualquier otra cosa
      // es un fallo nuestro y se dice en corto.
      if ((res.status === 409 || res.status === 404) && message) setRefusal(message);
      else setRetryable(true);
      setBusy(false);
    } catch {
      setRetryable(true);
      setBusy(false);
    }
  };

  const denied = refusal !== null;

  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={denied ? 'Este no se puede borrar' : 'Borrar ejercicio'}
      footer={
        denied ? (
          <Button variant="primary" onClick={onClose}>
            Entendido
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" icon={Trash2} loading={busy} onClick={remove}>
              Borrar
            </Button>
          </>
        )
      }
    >
      {denied ? (
        // VERBATIM. El servidor cuenta las sesiones y los bloques de verdad y los
        // nombra; cambiarlo por un "está en uso" sería borrar la única parte útil.
        <p className="t-body text-v2-fg">{refusal}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="t-body text-v2-muted">
            Vas a borrar «<span className="font-medium text-v2-fg">{ex.name}</span>» de tu catálogo. No se puede
            deshacer.
          </p>
          <p className="t-body-sm text-v2-faint">Si está puesto en algún entreno o bloque, te lo diremos y no se borrará.</p>
        </div>
      )}
      {retryable ? (
        <p role="alert" className="mt-3 t-body-sm font-medium text-v2-danger">
          No se pudo borrar. Reinténtalo.
        </p>
      ) : null}
    </Dialog>
  );
}
