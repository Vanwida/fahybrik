// Un grupo no es una promoción (revisión de producto, ola 4): la página dice si
// van juntos o si cada uno sigue en su semana, y dónde está cada miembro.

import { describe, expect, it } from 'vitest';
import type { GroupMember } from '@fahybrid/shared/schema/groups';
import { groupPaceLine, memberSpot } from '@/components/v2/periodizacion/group-pace';

const prog = { id: '2', name: 'Acumulación', weeks: 4 };
const member = (over: Partial<GroupMember>): GroupMember => ({
  athlete_id: '1',
  name: 'A',
  avatar_url: null,
  level_label: null,
  lifecycle: 'activo',
  position: 1,
  program: prog,
  week: 1,
  program_start: '2026-09-21',
  program_end: '2026-10-18',
  plan_end: '2026-10-18',
  joined_at: '2026-09-01',
  ...over,
});

describe('groupPaceLine', () => {
  it('semanas distintas del mismo programa → «cada atleta sigue en su semana»', () => {
    expect(groupPaceLine([member({ week: 1 }), member({ week: 2 }), member({ week: 3 })])).toBe('cada atleta sigue en su semana');
  });
  it('todos en la misma semana → van juntos, y en cuál', () => {
    expect(groupPaceLine([member({ week: 2 }), member({ week: 2 })])).toBe('van juntos: semana 2 de «Acumulación»');
  });
  it('nadie en marcha, o uno solo → no se dice nada', () => {
    expect(groupPaceLine([member({ week: null })])).toBeNull();
    expect(groupPaceLine([member({ week: 2 })])).toBeNull();
    expect(groupPaceLine([])).toBeNull();
  });
});

describe('memberSpot', () => {
  const today = '2026-09-23';
  it('en marcha → su semana', () => {
    expect(memberSpot(member({ week: 2 }), today)).toBe('Acumulación · semana 2 de 4');
  });
  it('un inicio pasado dice «empezó»; uno futuro, «empieza»', () => {
    expect(memberSpot(member({ week: null, program_start: '2026-09-21' }), today)).toBe('Acumulación · empezó 21 sept');
    expect(memberSpot(member({ week: null, program_start: '2026-09-28' }), today)).toBe('Acumulación · empieza 28 sept');
  });
  it('sin programa', () => {
    expect(memberSpot(member({ program: null }), today)).toBe('Sin programa');
  });
});
