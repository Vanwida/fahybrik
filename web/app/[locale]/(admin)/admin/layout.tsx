import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-session';
import { AdminShell } from '@/components/admin/AdminShell';

// Admin surface layout (multi-role RBAC, migration 0041).
//
// HARD SERVER-SIDE GATE: the whole /admin subtree is admin-only. A non-admin
// session (coach/athlete, or no session) is redirected away before any admin
// markup is rendered — the page bodies are never reached, so nothing leaks.
// This is the single gate for the surface; the per-page bodies trust it.
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getAdminSession();
  if (!session) {
    // Not an admin: send to the coach dashboard root rather than disclosing the
    // admin surface. The coach root itself redirects unauthenticated users to
    // sign-in.
    redirect('/');
  }

  return <AdminShell email={session.email}>{children}</AdminShell>;
}
