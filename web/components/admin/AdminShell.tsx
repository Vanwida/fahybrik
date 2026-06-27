import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AdminNav } from '@/components/admin/AdminNav';

interface AdminShellProps {
  email: string;
  children: React.ReactNode;
}

// Minimal admin shell — the platform-owner surface. Deliberately separate from
// the coach dashboard shell (V2Shell): different audience, different nav. A slim
// top-bar with the brand, an "Admin" marker, the owner's email, and a link back
// to the coach dashboard.
export function AdminShell({ email, children }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bg)]">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--accent)] text-[color:var(--accent-on)]">
            <MIcon name="shield_person" filled size={20} />
          </span>
          <span className="font-display text-xl italic font-black tracking-tight">
            <span className="text-[color:var(--accent)]">F</span>
            <span className="text-[color:var(--fg)]">AHYBRIK</span>
          </span>
          <span className="rounded-full border border-[color:var(--border-subtle)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-xs font-semibold text-[color:var(--text-muted)] sm:inline">
            {email}
          </span>
          <Link
            href="/hoy"
            className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
          >
            <MIcon name="arrow_back" size={16} />
            <span className="hidden sm:inline">Volver al panel</span>
          </Link>
        </div>
      </header>

      <div className="sticky top-14 z-10 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg)]">
        <AdminNav />
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
