'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  ClipboardList,
  BookOpen,
  MessageSquare,
  Flag,
  Calendar,
  AlertTriangle,
  ClipboardCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

// Order per UX spec 01-coach-cohort.md §"Sidebar icons".
const NAV: NavItem[] = [
  { href: '/', label: 'Atletas', icon: Users, match: (p) => p === '/' || p.startsWith('/cohort') || p.startsWith('/athletes') },
  { href: '/templates', label: 'Plantillas', icon: ClipboardList, match: (p) => p.startsWith('/templates') },
  { href: '/methodology', label: 'Metodología', icon: BookOpen, match: (p) => p.startsWith('/methodology') || p.startsWith('/methods') },
  { href: '/messages', label: 'Mensajes', icon: MessageSquare, match: (p) => p.startsWith('/messages') || p.startsWith('/chat') },
  { href: '/events', label: 'Eventos', icon: Flag, match: (p) => p.startsWith('/events') },
  { href: '/calendar', label: 'Calendario', icon: Calendar, match: (p) => p.startsWith('/calendar') },
  { href: '/alerts', label: 'Alertas', icon: AlertTriangle, match: (p) => p.startsWith('/alerts') },
  { href: '/review', label: 'Review semanal', icon: ClipboardCheck, match: (p) => p.startsWith('/review') },
  { href: '/settings', label: 'Ajustes', icon: Settings, match: (p) => p.startsWith('/settings') },
];

export function CoachSidebar() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Navegación principal"
      className="group/sidebar sticky top-0 flex h-screen w-12 shrink-0 flex-col items-center gap-0.5 border-r border-[color:var(--hairline)] bg-[color:var(--surface)] py-3 transition-[width] duration-150 hover:w-44 hover:items-stretch hover:px-1.5"
    >
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm transition-colors',
              'group-hover/sidebar:h-9 group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-2 group-hover/sidebar:px-2',
              active
                ? 'bg-[color:var(--surface-elevated)] text-[color:var(--fg)]'
                : 'text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]',
            )}
          >
            <item.icon className="size-[18px] shrink-0" aria-hidden strokeWidth={1.5} />
            <span className="hidden text-sm tracking-wide group-hover/sidebar:inline">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
