import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAZONES, escanear, estaAtada, huella, razonDeclarada, tablasDeClub } from './ambito/escaner';
import { TABLAS } from './ambito/tablas';

// El check de ámbito (DECISIONS 2026-09-24): toda consulta que toca datos de un
// club filtra por el coach o declara por qué no hace falta. Los tres agujeros
// entre clubs cerrados en la revisión FLEXR fueron consultas sin ese filtro.
//
// Las que ya existían sin ámbito están en `ambito/sin-ambito.baseline.json`: la
// lista de trabajo antes de RLS. El baseline SOLO ENCOGE — una consulta nueva o
// cambiada sin ámbito falla aquí; se ata al coach o se anota con
// `// tenancy: <razón>` (RAZONES en ambito/escaner.ts). Al atar una del baseline:
//   PODAR_AMBITO=1 pnpm vitest run tests/tenancy/ambito-de-club.test.ts

const WEB = resolve(__dirname, '../..');
const BASELINE = resolve(__dirname, 'ambito/sin-ambito.baseline.json');
const MIGRATIONS = resolve(WEB, '../infra/migrations');

type Entrada = { archivo: string; huella: string; tablas: string[]; veces: number };
type Baseline = { nota: string; consultas: Entrada[] };

const clave = (e: { archivo: string; huella: string }) => `${e.archivo}#${e.huella}`;

/** Una entrada por línea: el diff del baseline se lee en una revisión. */
function serializar(b: Baseline): string {
  const filas = b.consultas.map((e) => '    ' + JSON.stringify(e));
  return `{\n  "nota": ${JSON.stringify(b.nota)},\n  "consultas": [\n${filas.join(',\n')}\n  ]\n}\n`;
}

/** Las tablas vivas según las migraciones: create, drop y rename en orden. */
function tablasDeMigraciones(): Set<string> {
  const tablas = new Set<string>();
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
  const re =
    /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-z_][a-z0-9_]*)|drop\s+table(?:\s+if\s+exists)?\s+([a-z_., \t]+?)(?:\s+(?:cascade|restrict))?\s*;|alter\s+table(?:\s+if\s+exists)?\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+rename\s+to\s+([a-z_][a-z0-9_]*)/gi;
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(re)) {
      if (m[1]) tablas.add(m[1].toLowerCase());
      else if (m[2]) for (const t of m[2].split(',')) tablas.delete(t.trim().replace(/^public\./, '').toLowerCase());
      else if (m[3]) {
        tablas.delete(m[3].toLowerCase());
        tablas.add(m[4].toLowerCase());
      }
    }
  }
  return tablas;
}

describe('ámbito de club', () => {
  const consultas = escanear(WEB, ['lib', 'app']);
  const baseline: Baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

  it('cada tabla de las migraciones está clasificada, y no hay clasificadas que no existan', () => {
    const vivas = tablasDeMigraciones();
    expect([...vivas].filter((t) => !TABLAS[t]).sort(), 'sin clasificar en ambito/tablas.ts').toEqual([]);
    expect(Object.keys(TABLAS).filter((t) => !vivas.has(t)).sort(), 'clasificadas pero ya no existen').toEqual([]);
  });

  it('las razones declaradas son de la lista', () => {
    const malas = consultas
      .filter((c) => c.razon !== null && !(c.razon in RAZONES))
      .map((c) => `${c.archivo}:${c.linea} «${c.razon}»`);
    expect(malas, `razones válidas: ${Object.keys(RAZONES).join(', ')}`).toEqual([]);
  });

  // Cuántas consultas sin ámbito hay hoy por archivo + SQL.
  const sinAmbito = new Map<string, number>();
  for (const c of consultas) {
    if (!c.atada && c.razon === null) sinAmbito.set(clave(c), (sinAmbito.get(clave(c)) ?? 0) + 1);
  }

  it('ninguna consulta nueva o cambiada sin ámbito', () => {
    const permitidas = new Map(baseline.consultas.map((e) => [clave(e), e.veces]));
    const nuevas = consultas
      .filter((c) => !c.atada && c.razon === null && (sinAmbito.get(clave(c)) ?? 0) > (permitidas.get(clave(c)) ?? 0))
      .map((c) => `${c.archivo}:${c.linea} (${c.tablasClub.join(', ')})`);
    expect(
      nuevas,
      'Filtra por coach (`…coach_id = ${coachId}`) o anota encima `// tenancy: <razón>` con una de: ' +
        Object.keys(RAZONES).join(', '),
    ).toEqual([]);
  });

  it('el baseline solo encoge: nada de lo que lista ya está atado o anotado', () => {
    const sobran = baseline.consultas.filter((e) => (sinAmbito.get(clave(e)) ?? 0) < e.veces);
    if (sobran.length > 0 && process.env.PODAR_AMBITO === '1') {
      const quedan = baseline.consultas
        .map((e) => ({ ...e, veces: Math.min(e.veces, sinAmbito.get(clave(e)) ?? 0) }))
        .filter((e) => e.veces > 0);
      writeFileSync(BASELINE, serializar({ ...baseline, consultas: quedan }));
      return;
    }
    expect(
      sobran.map(clave),
      'Ya tienen ámbito (o cambiaron): quítalas con PODAR_AMBITO=1 pnpm vitest run tests/tenancy/ambito-de-club.test.ts',
    ).toEqual([]);
  });
});

describe('la regla', () => {
  const atada = (q: string) => estaAtada(q, tablasDeClub(q));

  it('ata el filtro por coach en where, join, any, using y el insert que lo escribe', () => {
    expect(atada('select * from athletes where coach_id = ${}')).toBe(true);
    expect(atada('select * from races r join athletes a on a.id = r.athlete_id and a.coach_id = ${}')).toBe(true);
    expect(atada('select * from events where created_by_coach_id = ${}')).toBe(true);
    expect(atada('select * from blocks where coach_id = any(${})')).toBe(true);
    expect(atada('select * from leads join appointments using (coach_id) where leads.id = ${}')).toBe(true);
    expect(atada('insert into leads (coach_id, email) values (${}, ${})')).toBe(true);
    expect(atada('select * from exercises where coach_id is null')).toBe(true);
  });

  it('no ata un id que puede venir de la petición', () => {
    expect(atada('update athletes set notes = ${} where id = ${}')).toBe(false);
    expect(atada('select * from workout_executions where athlete_id = ${}')).toBe(false);
    expect(atada('select * from templates where id = ${}')).toBe(false);
    expect(atada('insert into daily_checkins (athlete_id, day) values (${}, ${})')).toBe(false);
  });

  it('coach_id en el select o en el order by no es un filtro', () => {
    expect(atada('select coach_id from athletes where id = ${}')).toBe(false);
    expect(atada('select * from exercises where id = ${} order by (coach_id is null) asc limit 1')).toBe(false);
  });

  it('la identidad de la sesión: el coach por id o user_id; el atleta solo por user_id', () => {
    expect(atada('select * from coaches where id = ${}')).toBe(true);
    expect(atada('select * from coaches where user_id = ${}')).toBe(true);
    expect(atada('select * from athletes where user_id = ${}')).toBe(true);
    expect(atada('select * from athletes where id = ${}')).toBe(false);
  });

  it('las tablas de plataforma y los comentarios no cuentan', () => {
    expect(tablasDeClub('select * from users where id = ${}')).toEqual([]);
    expect(tablasDeClub('select 1 -- from athletes\n from rate_limit_buckets')).toEqual([]);
    expect(tablasDeClub('select extract(epoch from started_at) from workout_executions')).toEqual(['workout_executions']);
  });

  it('la razón va en el bloque de comentarios justo encima, o en la misma línea', () => {
    const lines = ['// tenancy: athlete-session — el id sale de requireAthlete()', 'const r = await sql`…`;'];
    expect(razonDeclarada(lines, 1)).toBe('athlete-session');
    expect(razonDeclarada(['// tenancy: platform', 'foo();', 'const r = await sql`…`;'], 2)).toBeNull();
    expect(razonDeclarada(['const r = await sql`…`; // tenancy: shared-catalog'], 0)).toBe('shared-catalog');
  });

  it('la huella no cambia con espacios ni comentarios, sí con el SQL', () => {
    expect(huella('select *\n  from athletes  where id = ${}')).toBe(huella('select * from athletes where id = ${} -- x'));
    expect(huella('select * from athletes where id = ${}')).not.toBe(huella('select * from athletes where user_id = ${}'));
  });
});
