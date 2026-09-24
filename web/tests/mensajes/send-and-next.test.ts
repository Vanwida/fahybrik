// «Enviar y siguiente»: qué hilo se abre después de contestar en «Por responder».
import { describe, expect, it } from 'vitest';
import { nextAfterSend } from '@/components/v2/mensajes/send-and-next';

const t = (id: string) => ({ athlete_id: id });

describe('nextAfterSend', () => {
  it('abre el de debajo', () => {
    expect(nextAfterSend([t('1'), t('2'), t('3')], '2')).toEqual(t('3'));
  });
  it('si era el último, el de encima', () => {
    expect(nextAfterSend([t('1'), t('2'), t('3')], '3')).toEqual(t('2'));
  });
  it('si era el único, nadie', () => {
    expect(nextAfterSend([t('1')], '1')).toBeNull();
  });
  it('si el abierto no estaba en la lista (enlace directo), el primero que espera', () => {
    expect(nextAfterSend([t('1'), t('2')], '9')).toEqual(t('1'));
    expect(nextAfterSend([], '9')).toBeNull();
  });
});
