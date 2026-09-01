// Correo de avisos del club (leads, altas, bajas).
//
// Dato, no env. Vacío = no se envía. Un club nuevo no toca código ni
// LEADS_NOTIFY_EMAIL. hello@ no es el buzón de nadie.

export const CLUB_NOTIFY_EMAIL_MAX = 254;

export interface ClubNotifyIssue {
  path: 'notify_email';
  message: string;
}

function trimOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeClubNotifyEmail(raw: string | null | undefined): string | null {
  const t = trimOrNull(raw);
  return t ? t.toLowerCase() : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateClubNotifyEmail(raw: string | null | undefined): ClubNotifyIssue[] {
  const email = normalizeClubNotifyEmail(raw);
  if (email == null) return [];
  if (email.length > CLUB_NOTIFY_EMAIL_MAX) {
    return [{ path: 'notify_email', message: 'El correo es demasiado largo.' }];
  }
  if (!EMAIL_RE.test(email)) {
    return [{ path: 'notify_email', message: 'Ese correo no vale.' }];
  }
  return [];
}

/** Extrae el correo de un From de Resend (`Nombre <a@b.com>` o `a@b.com`). */
export function emailFromSender(header: string | null | undefined): string | null {
  if (header == null) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const angled = /<([^>]+)>/.exec(trimmed);
  const raw = angled?.[1] ?? trimmed;
  if (validateClubNotifyEmail(raw).length > 0) return null;
  return normalizeClubNotifyEmail(raw);
}
