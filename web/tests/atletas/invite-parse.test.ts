import { describe, expect, test } from 'vitest';
import { invitable, linksText, parseInviteList } from '@/components/v2/atletas/invite-parse';

describe('parseInviteList', () => {
  test('formatos habituales, en cualquier orden', () => {
    const lines = parseInviteList(
      [
        'Marta Ruiz, marta@correo.com',
        'joan@correo.com; Joan Ortega',
        'Berta García\tberta@correo.com\t600000000',
        '"Font, Pau" <pau@correo.com>',
        'Aina Roig <AINA@Correo.com>',
      ].join('\n'),
    );
    expect(lines.map((l) => [l.name, l.email, l.issue])).toEqual([
      ['Marta Ruiz', 'marta@correo.com', null],
      ['Joan Ortega', 'joan@correo.com', null],
      ['Berta García', 'berta@correo.com', null],
      ['Font, Pau', 'pau@correo.com', null],
      ['Aina Roig', 'aina@correo.com', null],
    ]);
  });

  test('salta la cabecera y las líneas vacías; cuenta la línea real', () => {
    const lines = parseInviteList('nombre,email\n\nMarta, marta@correo.com\n');
    expect(lines).toEqual([{ line: 3, name: 'Marta', email: 'marta@correo.com', issue: null }]);
  });

  test('comillas con coma dentro (CSV)', () => {
    expect(parseInviteList('"Ruiz, Marta",marta@correo.com')[0]).toMatchObject({ name: 'Ruiz, Marta', issue: null });
  });

  test('cada problema con su motivo', () => {
    const lines = parseInviteList(
      ['Solo Nombre', 'Mal, mal@correo', 'marta@correo.com', 'Marta, marta@correo.com', 'Otra, MARTA@correo.com', 'Ya, ya@club.com'].join('\n'),
      ['ya@club.com'],
    );
    expect(lines.map((l) => l.issue)).toEqual([
      'sin_email',
      'email_no_valido',
      'sin_nombre',
      null,
      'repetido',
      'ya_en_tu_lista',
    ]);
    expect(invitable(lines).map((l) => l.line)).toEqual([4]);
  });

  test('enlaces para copiar', () => {
    expect(
      linksText([
        { name: 'Marta', invite_url: 'https://x/invite/1' },
        { name: 'Joan', invite_url: null },
      ]),
    ).toBe('Marta: https://x/invite/1');
  });
});
