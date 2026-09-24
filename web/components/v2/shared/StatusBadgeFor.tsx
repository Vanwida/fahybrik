'use client';

// El estado de un atleta y sus señales, pintados con el primitivo StatusBadge.
// UNA traducción estado → badge para Hoy, Atletas, Mensajes y la ficha (§4.1):
// ninguna pantalla decide por su cuenta qué tono lleva «Sin plan».
//
//   <StatusBadgeFor status={row.status} />                 «● Vigilar»
//   <StatusBadgeFor status={row.status} withReason />       «● Vigilar · Readiness 52 · −9 vs su base»
//   <SignalBadge signal={row.primary} />                    «● Readiness 31»  (tono por severidad)
//   SIGNAL_ACTION_LABEL[signal.action]                      «Proponer descarga»

import { MessageCircle, PauseCircle, type LucideIcon } from 'lucide-react';
import type {
  AthleteSignal,
  AthleteStatus,
  SignalAction,
  StatusTone,
} from '@fahybrid/shared/domain/coach/athlete-state';
import { StatusBadge } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

/** El verbo de cada acción de señal (botón primario de la fila / del vistazo). */
export const SIGNAL_ACTION_LABEL: Record<SignalAction, string> = {
  responder: 'Responder',
  proponer_descarga: 'Proponer descarga',
  publicar_semana: 'Publicar semana',
  asignar_programa: 'Asignar programa',
  revisar_alta: 'Revisar alta',
  recordar_pago: 'Recordar pago',
  mensaje: 'Mensaje',
  ver_semana: 'Ver semana',
  abrir_ficha: 'Abrir ficha',
};

const SEVERITY_TONE: Record<AthleteSignal['severity'], StatusTone> = {
  critical: 'danger',
  warning: 'warn',
  info: 'info',
};

/** Icono propio para las señales que no son «alarma» (un mensaje no es un aviso). */
function signalIcon(signal: Pick<AthleteSignal, 'kind'>): LucideIcon | undefined {
  if (signal.kind === 'message_unanswered') return MessageCircle;
  return undefined;
}

export function signalTone(signal: Pick<AthleteSignal, 'severity' | 'kind'>): StatusTone {
  // Por responder es información (azul) aunque el motor lo suba a vigilar: no es rojo.
  if (signal.kind === 'message_unanswered') return 'info';
  return SEVERITY_TONE[signal.severity];
}

/** El estado del atleta como badge. `withReason` añade el motivo en gris. */
export function StatusBadgeFor({
  status,
  withReason = false,
  variant = 'text',
  size = 'md',
  className,
}: {
  status: Pick<AthleteStatus, 'key' | 'tone' | 'label' | 'reason'>;
  withReason?: boolean;
  variant?: 'text' | 'soft';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const badge = (
    <StatusBadge
      tone={status.tone}
      label={status.label}
      variant={variant}
      size={size}
      icon={status.key === 'pausado' ? PauseCircle : undefined}
    />
  );
  if (!withReason || !status.reason) return <span className={cn('inline-flex min-w-0', className)}>{badge}</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)} title={status.reason}>
      {badge}
      <span className={cn('min-w-0 truncate text-v2-muted', size === 'sm' ? 't-meta' : 't-body-sm')}>
        {status.reason}
      </span>
    </span>
  );
}

/** Una señal: etiqueta con tono de su severidad y, opcional, su evidencia. */
export function SignalBadge({
  signal,
  withEvidence = false,
  size = 'md',
  className,
}: {
  signal: Pick<AthleteSignal, 'kind' | 'severity' | 'label' | 'evidence'>;
  withEvidence?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const badge = <StatusBadge tone={signalTone(signal)} label={signal.label} icon={signalIcon(signal)} size={size} />;
  if (!withEvidence || !signal.evidence) return <span className={cn('inline-flex min-w-0', className)}>{badge}</span>;
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-2', className)}
      title={`${signal.label} · ${signal.evidence}`}
    >
      {badge}
      <span className={cn('min-w-0 truncate text-v2-muted', size === 'sm' ? 't-meta' : 't-body-sm')}>
        {signal.evidence}
      </span>
    </span>
  );
}
