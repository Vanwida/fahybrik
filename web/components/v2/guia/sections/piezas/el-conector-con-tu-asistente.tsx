// Piezas de la guía «el-conector-con-tu-asistente»: los mockups y datos de ejemplo que pinta el
// artículo (../el-conector-con-tu-asistente.tsx). Viven aparte para que el artículo quede en su texto;
// la verificación contra el código está en la cabecera del artículo.

import { AppUrl, ClubMark } from '../../tenant';

/** La dirección del conector: el host público de ESTA app (entorno) + la ruta del MCP. */
export const CONECTOR_URL = <AppUrl path="/api/mcp" />;

export const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

// ── Piezas locales ───────────────────────────────────────────────────────────
// La conversación y la pantalla de ajustes viven en la crema del manual (no en el
// negro de la app): esto no es ni el panel ni el móvil del atleta, es el asistente
// del coach. Por eso NO usan PhoneMockup ni que en esta guía
// significan otra cosa. Todo con tokens v2, que en la crema resuelven en claro.

export const cardBase = {
  background: 'var(--v2-surface)',
  border: '1px solid var(--v2-border)',
  borderRadius: 'var(--v2-r-l)',
  boxShadow: 'var(--v2-shadow-card)',
} as const;

const microLabel = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--v2-muted)',
} as const;

const monoLine = {
  fontFamily: 'var(--v2-font-mono)',
  fontSize: '12.5px',
  color: 'var(--v2-fg)',
  overflowWrap: 'anywhere',
} as const;

/** La pantalla de ajustes del asistente: nombre + dirección + Conectar. */
export function AjustesConector() {
  return (
    <div style={{ ...cardBase, padding: '18px 20px', margin: '18px 0' }}>
      <div style={{ ...microLabel, marginBottom: '3px' }}>Ajustes de tu asistente</div>
      <div
        style={{
          fontFamily: 'var(--v2-font-display)',
          fontSize: '17px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          color: 'var(--v2-fg)',
          marginBottom: '14px',
        }}
      >
        Añadir conector personalizado
      </div>

      {[
        { label: 'Nombre', value: <ClubMark /> },
        { label: 'Dirección', value: CONECTOR_URL },
      ].map((field) => (
        <div key={field.label} style={{ marginBottom: '11px' }}>
          <div style={{ ...microLabel, fontSize: '9px', marginBottom: '5px' }}>{field.label}</div>
          <div
            style={{
              ...monoLine,
              background: 'var(--v2-surface-2)',
              border: '1px solid var(--v2-border)',
              borderRadius: 'var(--v2-r-s)',
              padding: '9px 12px',
            }}
          >
            {field.value}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '15px' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 800,
            padding: '8px 16px',
            borderRadius: 'var(--v2-r-s)',
            background: 'var(--v2-accent)',
            color: 'var(--v2-accent-fg)',
          }}
        >
          Conectar
        </span>
        <span style={{ fontSize: '12.5px', color: 'var(--v2-muted)' }}>
          y entras con tu cuenta del panel
        </span>
      </div>
    </div>
  );
}

/** Un grupo de frases de ejemplo: qué le dices y qué hace con eso. */
export function GrupoFrases({
  titulo,
  frases,
}: {
  titulo: string;
  frases: { dices: string; hace: React.ReactNode }[];
}) {
  return (
    <div style={{ ...cardBase, padding: '16px 18px' }}>
      <div style={{ ...microLabel, color: 'var(--v2-accent-text)', marginBottom: '11px' }}>{titulo}</div>
      {frases.map((f, i) => (
        <div
          key={f.dices}
          style={{
            paddingTop: i === 0 ? 0 : '11px',
            marginTop: i === 0 ? 0 : '11px',
            borderTop: i === 0 ? undefined : '1px solid var(--v2-border)',
          }}
        >
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              fontStyle: 'italic',
              color: 'var(--v2-fg)',
              lineHeight: 1.4,
            }}
          >
            «{f.dices}»
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--v2-muted)', marginTop: '3px', lineHeight: 1.45 }}>
            {f.hace}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Un turno de la conversación. `tu` = lo que dices tú; si no, tu asistente. */
export function Turno({ tu, children }: { tu?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        alignSelf: tu ? 'flex-end' : 'flex-start',
        maxWidth: '84%',
        padding: '9px 13px',
        borderRadius: '14px',
        fontSize: '13.5px',
        lineHeight: 1.5,
        color: 'var(--v2-fg)',
        background: tu ? 'var(--v2-accent-soft)' : 'var(--v2-surface-2)',
        borderBottomRightRadius: tu ? '5px' : '14px',
        borderBottomLeftRadius: tu ? '14px' : '5px',
      }}
    >
      {children}
    </div>
  );
}

/** Lo que el asistente te enseña ANTES de escribir, con los dos botones. */
export function PidePermiso() {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        background: 'var(--v2-surface)',
        border: '1.5px solid var(--v2-accent)',
        borderRadius: '14px',
        padding: '13px 15px',
      }}
    >
      <div style={{ ...microLabel, color: 'var(--v2-accent-text)', marginBottom: '9px' }}>
        Antes de tocar nada
      </div>
      {[
        ['Atleta', 'Marc'],
        ['Día', 'miércoles 13 de agosto'],
        ['Sesión nueva', 'Rodaje suave'],
        ['Dosis', '45:00 en zona 2'],
      ].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '10px', marginBottom: '5px', fontSize: '12.5px' }}>
          <span style={{ color: 'var(--v2-muted)', width: '82px', flexShrink: 0 }}>{k}</span>
          <span style={{ color: 'var(--v2-fg)', fontWeight: 700 }}>{v}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <span
          style={{
            fontSize: '11.5px',
            fontWeight: 800,
            padding: '6px 14px',
            borderRadius: 'var(--v2-r-s)',
            background: 'var(--v2-accent)',
            color: 'var(--v2-accent-fg)',
          }}
        >
          Confirmar
        </span>
        <span
          style={{
            fontSize: '11.5px',
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: 'var(--v2-r-s)',
            border: '1px solid var(--v2-border-strong)',
            color: 'var(--v2-muted)',
          }}
        >
          Cancelar
        </span>
      </div>
    </div>
  );
}

/** La frase que vuelve DESPUÉS de escribir: qué quedó y si el atleta lo ve. */
export function LecturaVuelta({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        ...monoLine,
        fontSize: '12px',
        lineHeight: 1.55,
        background: 'var(--v2-ok-soft)',
        border: '1px solid var(--v2-ok)',
        borderRadius: '12px',
        padding: '10px 13px',
      }}
    >
      {children}
    </div>
  );
}

// Las frases de ejemplo, agrupadas por lo que consigues con ellas. Todas resuelven
// con capacidades que el conector tiene hoy.
export const MIRAR = [
  {
    dices: '¿Cómo va Marc esta semana?',
    hace: <>Cómo llega de fresco, cómo va de constancia, qué ha entrenado y qué le queda por hacer.</>,
  },
  {
    dices: '¿Cómo le fue la sesión de ayer respecto a lo que le puse?',
    hace: <>Lo prescrito contra lo ejecutado, tramo a tramo, con el veredicto de cada uno.</>,
  },
  {
    dices: '¿Qué digo yo del taper de la última semana?',
    hace: <>Busca en tu metodología y te cita lo tuyo, no lo que opine él.</>,
  },
];

export const TOCAR = [
  {
    dices: 'Añádele un rodaje de 45 minutos en Z2 el miércoles',
    hace: <>Crea la sesión ese día con la dosis ya puesta, no con un título vacío.</>,
  },
  {
    dices: 'Cámbiale el 5×5 de sentadilla a 3×5 con 2 de RIR',
    hace: <>Edita ese día: las series y el objetivo de cada una.</>,
  },
  {
    dices: 'Muévele la sesión del jueves al sábado',
    hace: <>La misma sesión, otra fecha. Nada se reescribe.</>,
  },
];

export const DECIR = [
  {
    dices: 'Publica el protocolo de calentamiento a los que corren Valencia',
    hace: <>Un comunicado a los atletas que elijas, con sus pasos y su seguimiento.</>,
  },
  {
    dices: 'Dile que el jueves hacemos la revisión en el box',
    hace: <>Un mensaje en su chat de la app, como si lo escribieras desde el panel.</>,
  },
  {
    dices: 'Apúntame en su ficha que le molesta el aductor al patinar',
    hace: <>Una nota interna tuya. No es una lesión registrada ni la ve el atleta.</>,
  },
];
