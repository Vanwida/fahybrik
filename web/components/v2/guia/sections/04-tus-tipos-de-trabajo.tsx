// GUÍA · 04 Tus tipos de trabajo — área "Tu biblioteca". BUILT.
// Real flow: ArchetypePicker ("¿Qué tipo de trabajo es?") → arquetipos (calentamiento,
// carrera continua, series, fuerza, simulación HYROX, circuito, WOD/metcon, EMOM, test,
// activación, vuelta). Cada tipo FIJA modalidad × cómo se mide × contra qué objetivo y
// abre un formulario ya hecho (no toggles vacíos). 4 colores de modalidad.
// Doc kit en '../doc'; hues canónicos var(--v2-mod-*).

import {
  DocSection,
  QCWTriad,
  DocNote,
  MovilBand,
  PhoneMockup,
  DashboardMockup,
} from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
  calent: 'var(--v2-mod-calentamiento)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Una sesión se monta con <b>bloques</b>, y cada bloque es de un <b>tipo de trabajo</b>: una
          carrera continua, unas series, una tabla de fuerza, un metcon, una simulación de carrera, un
          test… Eliges el tipo y el panel te abre el formulario ya hecho para ese tipo: no toggles
          vacíos que rellenar.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Un conjunto de <b>formatos</b> listos: el vocabulario de tu deporte. Cada tipo decide cómo
            se mide el trabajo (distancia, tiempo, reps, calorías) y contra qué objetivo (ritmo, zona,
            RPE, %máx…).
          </>
        }
        como={
          <>
            Al añadir un bloque, eliges <em className="em">¿Qué tipo de trabajo es?</em> y tocas la
            tarjeta. El formulario llega <b>ya preparado</b> para ese tipo, con valores de partida
            sensatos que tú ajustas.
          </>
        }
        porque={
          <>
            Porque un entrenador piensa en “una serie” o “un metcon”, no en ejes abstractos. Cada
            formato guarda el dato de forma que la app lo entiende y tu atleta lo lee claro.
          </>
        }
      />

      <h3>1 · Eliges el tipo, no rellenas casillas vacías</h3>
      <p>
        Al añadir un bloque, el panel pregunta <code>¿Qué tipo de trabajo es?</code> y te muestra los
        tipos como tarjetas. Tocas una y aparece el formulario tallado para ese tipo: una{' '}
        <b>tabla de series</b> para la fuerza, un <b>N × distancia @ ritmo + descanso</b> para las
        series, una <b>lista de movimientos + cap</b> para un metcon. Nada de empezar de cero.
      </p>

      <h3>2 · Cada tipo viene con su color y su forma</h3>
      <p>
        Los tipos se agrupan por <b>modalidad</b>, y cada modalidad tiene un color que verás en todo
        el plan, tuyo y de tu atleta:
      </p>
      <ul className="clean">
        <li>
          <b style={{ color: MOD.carrera }}>Carrera</b>: rodajes, tempos, series e intervalos.
        </li>
        <li>
          <b style={{ color: MOD.ergo }}>Ergómetro</b>: remo, SkiErg, bici.
        </li>
        <li>
          <b style={{ color: MOD.fuerza }}>Fuerza</b>: tablas de series, fuerza-potencia, EMOM.
        </li>
        <li>
          <b style={{ color: MOD.circuito }}>Circuito</b>: WOD, metcon, core y la simulación HYROX.
        </li>
        <li>
          <b style={{ color: MOD.calent }}>Calentamiento</b>: lista de movimientos al entrar o al
          cerrar, sin reloj.
        </li>
      </ul>

      {/* Dashboard mockup: the archetype picker grid */}
      <DashboardMockup url="tu-panel / sesión / añadir bloque">
        <div className="wk-title" style={{ fontSize: '15px', marginBottom: '2px' }}>
          ¿Qué tipo de trabajo es?
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' }}>
          Elige el formato. El formulario llega ya hecho para ese tipo.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px' }}>
          <TypeTile color={MOD.calent} icon="◎" name="Calentamiento" />
          <TypeTile color={MOD.carrera} icon="🏃" name="Carrera continua / Z2" />
          <TypeTile color={MOD.carrera} icon="↻" name="Series / Intervalos" />
          <TypeTile color={MOD.fuerza} icon="⌗" name="Fuerza" />
          <TypeTile color={MOD.circuito} icon="◇" name="Simulación HYROX" />
          <TypeTile color={MOD.circuito} icon="▦" name="Circuito / Core" />
          <TypeTile color={MOD.circuito} icon="⏱" name="WOD / Metcon" />
          <TypeTile color={MOD.fuerza} icon="⚡" name="Fuerza-potencia / EMOM" />
          <TypeTile color={MOD.ergo} icon="⏲" name="Test" />
          <TypeTile color={MOD.calent} icon="❋" name="Activación / Tapering" />
          <TypeTile color={MOD.calent} icon="○" name="Vuelta a la calma" />
        </div>
      </DashboardMockup>

      <DocNote variant="cue" title="El tipo decide cómo se mide y contra qué">
        <ul>
          <li>
            Una <span className="k">Fuerza</span> se mide en reps y va contra un %máx, kg o RIR, y
            trae su tabla de series.
          </li>
          <li>
            Unas <span className="k">Series</span> se miden en distancia o tiempo y van contra ritmo
            o RPE, con su descanso.
          </li>
          <li>
            Un <span className="k">Test</span> guarda el resultado y alimenta los ritmos y zonas del
            atleta: el plan se ajusta a su nivel real.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Cada tipo, en su teléfono"
        subtitle={
          <>
            El tipo que eliges decide cómo se ve el bloque en el móvil: una tabla de series para la
            fuerza, una lista de tramos para las series, su color de modalidad siempre delante.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>La sesión.</b> Cada bloque con su color y su forma propia. El atleta entiende de un
              vistazo qué tipo de trabajo le toca.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </div>
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Entreno de hoy
            </div>
            <div style={{ width: '30px' }} />
          </div>
          <div className="ph-title sm" style={{ marginBottom: '12px' }}>
            Fuerza + Metcon
          </div>

          {/* Block 1 — Fuerza (sets table) */}
          <div style={blockStyle(MOD.fuerza)}>
            <div style={blockEyebrow(MOD.fuerza)}>Fuerza</div>
            <div style={blockTitle}>Sentadilla trasera</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <SetLine s="Serie 1" m="5 reps" t="70%" />
              <SetLine s="Serie 2" m="5 reps" t="75%" />
              <SetLine s="Serie 3" m="3 reps" t="80%" />
            </div>
          </div>

          {/* Block 2 — Series (intervals) */}
          <div style={blockStyle(MOD.carrera)}>
            <div style={blockEyebrow(MOD.carrera)}>Series · Intervalos</div>
            <div style={blockTitle}>6 × 800 m</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
              @ Z4 · descanso 90&quot;
            </div>
          </div>

          {/* Block 3 — Metcon (components) */}
          <div style={{ ...blockStyle(MOD.circuito), marginBottom: 0 }}>
            <div style={blockEyebrow(MOD.circuito)}>WOD · For Time</div>
            <div style={blockTitle}>3 rondas · cap 12&apos;</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
              15 wall ball · 12 burpees · 200 m remo
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}

// ── Mock helpers ─────────────────────────────────────────────────────────────
function TypeTile({ color, icon, name }: { color: string; icon: string; name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        border: '1px solid var(--hair)',
        background: 'var(--surface)',
        borderRadius: '10px',
        padding: '10px',
      }}
    >
      <span
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '7px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.2, color: 'var(--fg)' }}>
        {name}
      </span>
    </div>
  );
}

const blockStyle = (color: string): React.CSSProperties => ({
  background: 'var(--surface)',
  border: '1px solid var(--hair)',
  borderLeft: `3px solid ${color}`,
  borderRadius: '12px',
  padding: '12px 13px',
  marginBottom: '9px',
});

const blockEyebrow = (color: string): React.CSSProperties => ({
  fontSize: '8.5px',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color,
  marginBottom: '4px',
});

const blockTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 800,
  color: 'var(--fg)',
  marginBottom: '6px',
};

function SetLine({ s, m, t }: { s: string; m: string; t: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11.5px',
        color: 'var(--muted)',
        borderTop: '1px solid var(--hair)',
        paddingTop: '3px',
      }}
    >
      <span>{s}</span>
      <span style={{ fontFamily: 'var(--v2-font-mono)', color: 'var(--fg)' }}>
        {m} · {t}
      </span>
    </div>
  );
}
