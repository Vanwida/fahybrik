/**
 * El correo de avisos es del club. Vacío = no se envía.
 * LEADS_NOTIFY_EMAIL / hello@ no son el buzón de nadie.
 */
import { describe, expect, test } from 'vitest';
import { clubSkinPatchSchema } from '@fahybrid/shared/schema/coach-club-skin';
import {
  emailFromSender,
  normalizeClubNotifyEmail,
  validateClubNotifyEmail,
} from '@fahybrid/shared/domain/coach/club-notify';

describe('correo de avisos del club', () => {
  test('se puede vaciar y rechaza basura', () => {
    expect(validateClubNotifyEmail(null)).toEqual([]);
    expect(validateClubNotifyEmail('')).toEqual([]);
    expect(validateClubNotifyEmail('   ')).toEqual([]);
    expect(validateClubNotifyEmail('coach@club.com')).toEqual([]);
    expect(validateClubNotifyEmail('no-es-correo')).toHaveLength(1);
  });

  test('normaliza recortando y en minúsculas; vacío es null', () => {
    expect(normalizeClubNotifyEmail('  Coach@Club.COM  ')).toBe('coach@club.com');
    expect(normalizeClubNotifyEmail('')).toBeNull();
    expect(normalizeClubNotifyEmail(null)).toBeNull();
  });

  test('el From de Resend rinde un correo; basura no', () => {
    expect(emailFromSender('Club <noreply@aistudios.pro>')).toBe('noreply@aistudios.pro');
    expect(emailFromSender('avisos@club.com')).toBe('avisos@club.com');
    expect(emailFromSender('Coach <no-es-correo>')).toBeNull();
    expect(emailFromSender('')).toBeNull();
  });
});

describe('clubSkinPatchSchema · notify_email', () => {
  test('acepta un correo y lo deja en minúsculas', () => {
    const r = clubSkinPatchSchema.safeParse({ notify_email: '  Coach@Club.com  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notify_email).toBe('coach@club.com');
  });

  test('vacío es null — el club no recibe avisos', () => {
    const r = clubSkinPatchSchema.safeParse({ notify_email: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notify_email).toBeNull();
  });

  test('basura no entra', () => {
    expect(clubSkinPatchSchema.safeParse({ notify_email: 'hola' }).success).toBe(false);
  });
});
