'use client';

import { useEffect, useState } from 'react';
import { Archive, Check, Circle, Link2 } from 'lucide-react';
import type { CoachAthleteCommunicationDTO } from '@fahybrid/shared/domain/coach-communications';
import { Button, Dialog, ErrorState, Sheet, SkeletonRows, StatusBadge, Tag } from '@/components/v2/ui';
import { ANCHOR_COACH_LABEL, KIND_COACH_LABEL, opcionElegida, seguimiento } from '@/lib/dashboard/v2/del-coach';
import { relativeDayLabel } from '@/components/v2/shared/format';
import { borrarOArchivar, detalleDeAtleta } from './api';
import { SeccionesDeNota } from './detalle-nota';
import { duracionCorta } from './audio';

/** Una entrega: contenido completo y acciones de ESE atleta, sin perder el historial. */
export function ComunicadoDetalle({ id, athleteId, athleteName, today, onCerrar, onRetirado }: {
  id: string;
  athleteId: string;
  athleteName: string;
  today: string;
  onCerrar: () => void;
  onRetirado: () => void;
}) {
  const [communication, setCommunication] = useState<CoachAthleteCommunicationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void detalleDeAtleta(id, athleteId).then((r) => {
      if (!alive) return;
      if (r.ok) { setCommunication(r.data); setError(null); }
      else setError(r.mensaje);
    });
    return () => { alive = false; };
  }, [id, athleteId, retry]);

  const retirar = async () => {
    setError(null);
    setRetirando(true);
    const r = await borrarOArchivar(id);
    setRetirando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    setCommunication((c) => c ? { ...c, status: 'archived' } : c);
    setConfirmar(false);
    onRetirado();
  };
  const c = communication;
  const status = c ? seguimiento(c, today) : null;
  const elegida = c ? opcionElegida(c) : null;
  const recipients = c?.tracking.recipients ?? 0;
  return <>
    <Sheet open onOpenChange={(open) => { if (!open && !retirando) onCerrar(); }} size="lg"
      title={c?.title ?? 'Comunicado'} description={`Entrega a ${athleteName}`}
      footer={c && c.status !== 'archived' ? <Button icon={Archive} onClick={() => setConfirmar(true)}>Retirar comunicado…</Button> : undefined}>
      <div className="flex flex-col gap-5">
        {error ? <ErrorState title={error} onRetry={() => { setError(null); setRetry((r) => r + 1); }} /> : null}
        {!c && !error ? <SkeletonRows rows={4} /> : null}
        {c && status ? <>
          <div className="flex flex-wrap gap-2">
            <Tag>{KIND_COACH_LABEL[c.kind]}</Tag><Tag>{ANCHOR_COACH_LABEL[c.anchor_kind]}</Tag>
            <StatusBadge tone={status.tono === 'ok' ? 'ok' : status.tono === 'warn' ? 'warn' : 'neutral'} label={status.titular} />
          </div>
          {c.published_at ? <p className="t-meta text-v2-muted">Publicado {relativeDayLabel(c.published_at.slice(0, 10), today).toLowerCase()} · {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(c.published_at))}</p> : null}
          {status.nota ? <p className="t-body-sm text-v2-muted">{status.nota}</p> : null}
          {c.due_date ? <p className="t-body-sm text-v2-muted">Fecha límite: {c.due_date}</p> : null}
          {c.body ? <p className="whitespace-pre-line t-body text-v2-fg">{c.body}</p> : null}
          {c.kind === 'note' ? <SeccionesDeNota items={c.items} /> : null}
          {c.kind === 'protocol' ? <ol className="flex flex-col gap-3">{c.items.map((item, index) => {
            const marked = c.athlete_state.marked_item_ids.includes(item.id);
            return <li key={item.id} className="flex gap-3 rounded-panel border border-v2-border p-3">
              <span className="shrink-0 t-meta text-v2-muted">{index + 1}.</span>
              <div className="min-w-0 flex-1">{item.label ? <p className="t-meta text-v2-muted">{item.label}</p> : null}<p className="whitespace-pre-line t-body text-v2-fg">{item.content}</p>
                {item.checkable ? <StatusBadge tone={marked ? 'ok' : 'neutral'} icon={marked ? Check : Circle} label={marked ? 'Marcado por el atleta' : 'Pendiente de marcar'} /> : null}
              </div>
            </li>;
          })}</ol> : null}
          {c.kind === 'question' ? <div className="flex flex-col gap-3">
            <h3 className="t-label text-v2-muted">{elegida ? 'Respuesta del atleta' : 'Opciones · todavía sin respuesta'}</h3>
            {c.items.map((item) => <div key={item.id} className="rounded-panel border border-v2-border p-3">
              {elegida?.id === item.id ? <StatusBadge tone="ok" label="Opción escogida" /> : null}
              <p className="whitespace-pre-line t-body text-v2-fg">{item.content}</p>
              {item.consequence ? <p className="mt-1 whitespace-pre-line t-body-sm text-v2-muted">{item.consequence}</p> : null}
            </div>)}
          </div> : null}
          {c.final_note ? <p className="whitespace-pre-line t-body-sm text-v2-muted">{c.final_note}</p> : null}
          {c.audio_url ? <div className="flex flex-col gap-2">
            <h3 className="t-label text-v2-muted">Nota de voz{c.audio_seconds ? ` · ${duracionCorta(c.audio_seconds)}` : ''}</h3>
            <audio key={audioAttempt} aria-label={`Nota de voz de ${c.title}`} controls preload="none" src={c.audio_url} className="w-full" onError={() => setAudioError(true)} />
            {audioError ? <ErrorState title="No se ha podido reproducir el audio." onRetry={() => { setAudioError(false); setAudioAttempt((a) => a + 1); }} /> : null}
          </div> : null}
          {c.linked ? <div className="rounded-panel border border-v2-border p-3">
            <Tag icon={Link2}>Relacionado · {KIND_COACH_LABEL[c.linked.kind]}</Tag>
            <p className="mt-2 t-body text-v2-fg">{c.linked.title}</p>
          </div> : null}
          <div className="border-t border-v2-border pt-3 t-body-sm text-v2-muted">
            <p>{c.athlete_state.seen_at ? 'El atleta lo ha abierto.' : 'El atleta todavía no lo ha abierto.'}</p>
            {c.athlete_state.done_at ? <p>Lo ha marcado como hecho.</p> : null}
            {c.athlete_state.answered_at ? <p>Respuesta registrada.</p> : null}
            {c.status === 'archived' ? <p>Retirado de la bandeja; el contenido y sus respuestas se conservan aquí.</p> : null}
          </div>
        </> : null}
      </div>
    </Sheet>
    <Dialog open={confirmar} onOpenChange={(open) => { if (!retirando) setConfirmar(open); }} title="Retirar comunicado"
      description={recipients > 1 ? `Se retira de la bandeja de sus ${recipients} destinatarios. El contenido, los pasos y las respuestas se conservan en el historial.` : `Se retira de la bandeja de ${athleteName}. El contenido, los pasos y las respuestas se conservan en el historial.`}
      footer={<><Button disabled={retirando} onClick={() => setConfirmar(false)}>Cancelar</Button><Button variant="destructive" loading={retirando} onClick={() => void retirar()}>Retirar</Button></>}>
      {error ? <ErrorState title={error} /> : null}
    </Dialog>
  </>;
}
