import { cn } from '@/lib/utils';
import { Block, Panel } from './parts';

const SURFACES = ['bg', 'surface', 'surface-2', 'elevated', 'select', 'border', 'border-strong'];
const INK = ['fg', 'muted', 'faint'];
const STATUS = ['danger', 'warn', 'ok', 'info'];
const MODS: [string, string][] = [
  ['fuerza', 'Fuerza'],
  ['ergo', 'Ergo'],
  ['carrera', 'Carrera'],
  ['circuito', 'Circuito'],
  ['calentamiento', 'Calentamiento'],
];
const ZONES = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'];

function Swatch({ token, label, fg }: { token: string; label?: string; fg?: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className={cn('h-10 rounded-ctl border border-v2-border', fg && 'flex items-center px-2.5 t-title-sm')}
        style={fg ? { color: `var(--v2-${token})`, background: 'var(--v2-surface)' } : { background: `var(--v2-${token})` }}
      >
        {fg ? 'Aa 42' : null}
      </div>
      <div className="mt-1.5 truncate t-meta text-v2-fg">{label ?? token}</div>
      <div className="truncate [font-family:ui-monospace,SFMono-Regular,Menlo,monospace] text-[12px] text-v2-faint">--v2-{token}</div>
    </div>
  );
}

const SCALE: [string, string, string][] = [
  ['t-num-xl', '40/44 · 600 · tnum', '1:12:48'],
  ['t-num-l', '28/32 · 600 · tnum', '67 %'],
  ['t-title', '20/26 · 600 — título de página', 'Atletas'],
  ['t-title-sm', '16/22 · 600 — tarjeta, nombre', 'Marta Costa'],
  ['t-body', '14/20 · 400 — texto, inputs, botones', 'Readiness 31 · −24 vs su base'],
  ['t-body-sm', '13/18 · 400 — filas densas', '2 de 4 debidas sin hacer (7 d)'],
  ['t-meta', '12/16 · 500 — fechas, secundario', 'hace 2 h · 22 sept'],
  ['t-label', '11/14 · 600 · MAYÚS — cabeceras', 'Readiness 14 d'],
];

export function Foundations() {
  return (
    <>
      <Block id="color" title="Color" note="Cromo neutro. El color lo llevan el estado y los números. El acento (piel del club) solo en el botón primario, el foco y el logo.">
        <Panel className="grid gap-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SURFACES.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {INK.map((t) => (
              <Swatch key={t} token={t} fg />
            ))}
            {STATUS.map((t) => (
              <Swatch key={t} token={t} fg />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 t-label text-v2-faint">Modalidad · categórica</div>
              <div className="flex overflow-hidden rounded-ctl">
                {MODS.map(([t, l]) => (
                  <div key={t} className="flex-1">
                    <div className="h-6" style={{ background: `var(--v2-mod-${t})` }} />
                    <div className="mt-1.5 truncate t-meta text-v2-muted">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 t-label text-v2-faint">Zonas · secuencial</div>
              <div className="flex overflow-hidden rounded-ctl">
                {ZONES.map((z) => (
                  <div key={z} className="flex-1">
                    <div className="h-6" style={{ background: `var(--v2-${z})` }} />
                    <div className="mt-1.5 t-meta text-v2-muted uppercase">{z}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </Block>

      <Block id="tipo" title="Tipo" note="Una familia (Figtree), ocho pasos. Nada por debajo de 12 px salvo la etiqueta en mayúsculas.">
        <Panel>
          {SCALE.map(([cls, spec, sample]) => (
            <div key={cls} className="grid gap-1 border-b border-v2-border py-3 last:border-b-0 sm:grid-cols-[148px_220px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
              <code className="[font-family:ui-monospace,SFMono-Regular,Menlo,monospace] text-[12px] text-v2-fg">{cls}</code>
              <span className="t-meta text-v2-faint">{spec}</span>
              <span className={cn(cls, 'truncate', cls === 't-label' ? 'text-v2-faint' : 'text-v2-fg')}>{sample}</span>
            </div>
          ))}
        </Panel>
      </Block>
    </>
  );
}
