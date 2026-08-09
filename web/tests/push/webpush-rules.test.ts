// Las reglas puras del canal Web Push: a qué pantalla lleva cada aviso y cómo
// se anuncia un adjunto. Si un tipo nuevo cayera en una ruta que no existe, el
// tap del coach abriría un 404 — por eso el mapa se prueba entero.

import { describe, expect, it } from 'vitest';
import { webUrlForNotification, type NotificationType } from '@/lib/notifications/dispatch';
import { attachmentPreview, humanPreview } from '@/lib/chat/schema';
import { vapidKeyToBytes } from '@/lib/push/client';

describe('webUrlForNotification', () => {
  it('un mensaje de chat abre SU conversación', () => {
    expect(webUrlForNotification('chat_message', { thread_id: '42' })).toBe('/mensajes?hilo=42');
  });

  it('un chat sin hilo válido abre la lista, nunca un 404', () => {
    expect(webUrlForNotification('chat_message')).toBe('/mensajes');
    expect(webUrlForNotification('chat_message', { thread_id: 'abc' })).toBe('/mensajes');
    expect(webUrlForNotification('chat_message', { thread_id: '42; drop' })).toBe('/mensajes');
  });

  it('todo tipo conocido cae en una pantalla del dashboard que existe', () => {
    // Espejo de V2_NAV_ITEMS + rutas fijas: si esto falla, hay un aviso cuyo
    // tap aterriza en un 404.
    const validPrefixes = ['/hoy', '/mensajes', '/atletas', '/leads', '/pagos'];
    const allTypes: NotificationType[] = [
      'workout_assigned',
      'workout_edited',
      'chat_message',
      'event_reminder',
      'recovery_alert',
      'milestone',
      'system',
      'plan_published',
      'coach_communication',
      'week_adjustment_pending',
      'monthly_block_pending',
      'intake_pending',
    ];
    for (const type of allTypes) {
      const url = webUrlForNotification(type);
      expect(validPrefixes.some((p) => url === p || url.startsWith(`${p}?`))).toBe(true);
    }
  });
});

describe('previews de adjunto', () => {
  it('cada tipo tiene su etiqueta humana', () => {
    expect(attachmentPreview('image')).toBe('📷 Foto');
    expect(attachmentPreview('video')).toBe('🎥 Vídeo');
    expect(attachmentPreview('voice')).toBe('🎤 Nota de voz');
    expect(attachmentPreview('file')).toBe('📎 Archivo');
    expect(attachmentPreview(null)).toBe('📎 Adjunto');
  });

  it('humanPreview traduce el marcador crudo de la DB y respeta el texto normal', () => {
    expect(humanPreview('[image]')).toBe('📷 Foto');
    expect(humanPreview('[voice]')).toBe('🎤 Nota de voz');
    expect(humanPreview('[attach]')).toBe('📎 Adjunto');
    expect(humanPreview('¿Hacemos [image] mañana?')).toBe('¿Hacemos [image] mañana?');
    expect(humanPreview('Buen trabajo hoy')).toBe('Buen trabajo hoy');
  });
});

describe('vapidKeyToBytes', () => {
  it('decodifica base64url con y sin padding implícito', () => {
    // 'AQID' = bytes [1,2,3]; base64url sin '='.
    expect(Array.from(vapidKeyToBytes('AQID'))).toEqual([1, 2, 3]);
    // Con caracteres propios de base64url (- y _).
    const key = 'BP-_' + 'AAAA';
    const bytes = vapidKeyToBytes(key);
    expect(bytes.length).toBe(6);
    expect(bytes[0]).toBe(0x04);
    expect(bytes[1]).toBe(0xff);
    expect(bytes[2]).toBe(0xbf);
  });
});
