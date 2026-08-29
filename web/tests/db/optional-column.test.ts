import { describe, expect, test } from 'vitest';
import {
  assertSqlIdent,
  optionalBooleanColumn,
  optionalBooleanSql,
  optionalTextColumn,
  optionalTextSql,
} from '@/lib/db/optional-column';
import { createFakeSql } from '../utils/fake-sql';

describe('optional-column · clase 42703', () => {
  test('texto: to_jsonb de la fila, no el identificador desnudo', () => {
    expect(optionalTextSql('s', 'block_coach_note')).toBe(
      "(to_jsonb(s)->>'block_coach_note')",
    );
  });

  test('boolean: ausente = el defecto, no un throw', () => {
    expect(optionalBooleanSql('st', 'is_approach', false)).toBe(
      "coalesce((to_jsonb(st)->>'is_approach')::boolean, false)",
    );
    expect(optionalBooleanSql('st', 'is_approach', true)).toBe(
      "coalesce((to_jsonb(st)->>'is_approach')::boolean, true)",
    );
  });

  test('rechaza alias o columna que no son identificadores', () => {
    expect(() => assertSqlIdent('block_coach_note; drop table x')).toThrow(
      /invalid SQL identifier/,
    );
    expect(() => optionalTextSql('s', "x'")).toThrow(/invalid SQL identifier/);
    expect(() => optionalBooleanSql('st;--', 'is_approach', false)).toThrow(
      /invalid SQL identifier/,
    );
  });

  test('el fragmento entra en el SQL via unsafe, no como $1', async () => {
    let seen = '';
    const sql = createFakeSql((text, values) => {
      seen = text;
      expect(values).toEqual([]);
      return [];
    });
    await sql`
      select ${optionalTextColumn(sql, 's', 'block_coach_note')},
             ${optionalBooleanColumn(sql, 'st', 'is_approach', false)}
    `;
    expect(seen).toContain("to_jsonb(s)->>'block_coach_note'");
    expect(seen).toContain("to_jsonb(st)->>'is_approach'");
    expect(seen).not.toContain('$1');
    expect(seen).not.toMatch(/(^|[^>])s\.block_coach_note\b/);
    expect(seen).not.toMatch(/(^|[^>])st\.is_approach\b/);
  });
});
