import { expect, test } from 'vitest';
import { athleteStructureHref } from '@/components/v2/planes/program-context-link';

test('regresa a la misma ficha, semana, zoom, filtro y origen, y abre estructura', () => {
  expect(athleteStructureHref('12', '/es/atletas/12?semana=2026-10-05&zoom=4&filtro=pendientes&desde=hoy#plan', 'es'))
    .toBe('/atletas/12?semana=2026-10-05&zoom=4&filtro=pendientes&desde=hoy&plan_estructura=1#plan');
});

test.each(['/es/atletas/13?semana=vieja', '/es/programar/grupos/12', 'https://externo.test/es/atletas/12', '//externo.test/es/atletas/12'])('otro destino no contamina el contexto personal: %s', (origin) => {
  expect(athleteStructureHref('12', origin, 'es')).toBe('/atletas/12?plan_estructura=1');
});

test('el enlace i18n no repite el locale inglés', () => {
  expect(athleteStructureHref('12', '/en/atletas/12?week=2026-10-05', 'en')).toBe('/atletas/12?week=2026-10-05&plan_estructura=1');
});
