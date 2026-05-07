'use client';

import { CalendarPlus, ClipboardList, MessageSquare, RefreshCw } from 'lucide-react';

interface DeepDiveActionBarProps {
  athlete_id: string;
  athlete_name: string;
}

export function DeepDiveActionBar({ athlete_id, athlete_name }: DeepDiveActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={`Acciones para ${athlete_name}`}
      className="sticky bottom-3 z-10 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)]/95 px-3 py-2 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          label="Asignar workout"
          shortcut="A"
          icon={CalendarPlus}
          href={`/athletes/${athlete_id}/plan?action=assign`}
          primary
        />
        <ActionButton
          label="Reasignar template"
          shortcut="R"
          icon={ClipboardList}
          href={`/athletes/${athlete_id}/plan?action=reassign`}
        />
        <ActionButton
          label="Override día"
          shortcut="O"
          icon={RefreshCw}
          href={`/athletes/${athlete_id}/plan?action=override`}
        />
      </div>
      <ActionButton
        label={`Hablar con ${athlete_name.split(' ')[0]}`}
        shortcut="M"
        icon={MessageSquare}
        href={`/messages?athlete=${athlete_id}`}
      />
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  href: string;
  primary?: boolean;
}

function ActionButton({ label, shortcut, icon: Icon, href, primary }: ActionButtonProps) {
  return (
    <a
      href={href}
      title={`${label} · ${shortcut}`}
      className={`group inline-flex items-center gap-1.5 rounded-[var(--r-s)] px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
        primary
          ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]'
          : 'border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]/80'
      }`}
    >
      <Icon className="size-3.5" aria-hidden strokeWidth={1.5} />
      <span>{label}</span>
      <span
        aria-hidden
        className={`ml-1 hidden rounded-[2px] border px-1 text-[9px] uppercase tracking-[0.12em] ${
          primary ? 'border-[color:var(--accent-on)]/40 text-[color:var(--accent-on)]/70' : 'border-[color:var(--hairline)] text-[color:var(--muted)]'
        } group-hover:inline-block`}
      >
        {shortcut}
      </span>
    </a>
  );
}
