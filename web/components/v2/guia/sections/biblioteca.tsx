// GUÍA · Tu biblioteca — Programar › Biblioteca: Entrenos · Bloques ·
// Ejercicios en tabla, Listos / Por revisar / Posibles duplicados, el editor de
// una pieza (bloques A/B/C, línea rápida, etiquetas), la cola de revisión con el
// texto original al lado y los tipos de trabajo. El puente: cada tipo tiene su
// forma y su color en el entreno del atleta.

import { DocSection, MovilBand, PhoneMockup, PanelFigure, Chips } from '../doc';
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
          La biblioteca guarda lo que reutilizas: <b>entrenos</b> completos, <b>bloques</b> sueltos y
          tus <b>ejercicios</b>. Lo que está aquí lo arrastras a un programa, lo añades a la semana de
          un atleta con el <b>+</b> de su calendario o lo buscas con <b>⌘K</b>.
        </>
      }
    >
      <PanelFigure caption={<>Por defecto ves lo que está <b>Listo</b> para usar. Lo importado como texto espera en <b>Por revisar</b>.</>}>
        <Chips
          items={[
            { label: 'Listos', count: 24, active: true },
            { label: 'Por revisar', count: 97 },
            { label: 'Posibles duplicados', count: 9 },
          ]}
        />
      </PanelFigure>

      <h3>Una tabla por tipo</h3>
      <p>
        En <b>Programar › Biblioteca</b> eliges <b>Entrenos</b>, <b>Bloques</b> o <b>Ejercicios</b>.
        Cada fila dice su contenido, <b>en cuántos sitios se usa</b>, cuándo se editó y su estado; al
        pasar por una, la vista previa sale a la derecha. El buscador entiende también los nombres en
        inglés. Con varias seleccionadas: <b>Etiquetar…</b> o <b>Archivar</b> (lo archivado se
        recupera en su filtro). <b>+ Nuevo</b> crea un entreno, un bloque o un ejercicio.
      </p>

      <h3>Editar un entreno o un bloque</h3>
      <p>
        Arriba, el nombre (se edita en el sitio). Debajo, sus bloques <b>A, B, C…</b>, cada uno con
        el compositor completo. Para añadir, escribe en la línea rápida como en un programa (
        <code>sentadilla 5x5 @75% r120 · 8x400m r1&apos; z4</code>) o crea un <b>Bloque vacío</b>.
        Las <b>etiquetas</b> sirven para buscar y filtrar. <b>Guardar</b> lo deja listo para usar.
      </p>

      <h3>Por revisar: lo que llegó como texto</h3>
      <p>
        Lo que importaste de un documento o un Excel sin poder tiparlo entero se queda{' '}
        <b>Por revisar</b>. Al abrirlo, el <b>texto original</b> está al lado del editor para que lo
        pases a bloques deprisa. <b>Revisar en fila</b> te lleva de uno al siguiente: al guardar,{' '}
        <b>Siguiente por revisar</b>. <b>Posibles duplicados</b> junta los que se llaman casi igual.
      </p>

      <h3>Los tipos de trabajo</h3>
      <p>
        Cuando añades un bloque desde el entreno de un atleta o montas un test, primero eliges{' '}
        <b>qué tipo de trabajo es</b>: calentamiento, vuelta a la calma, carrera continua, series,
        fuerza, superserie, simulación, circuito, WOD, fuerza-potencia / EMOM, test o activación. El
        formulario llega ya hecho para ese tipo (una tabla de series para la fuerza, N × distancia con
        su descanso para unas series, movimientos y tope de tiempo para un WOD), con valores de
        partida que ajustas.
      </p>
      <p>Cada tipo pertenece a una <b>modalidad</b>, con un color que verás en todo el plan:</p>
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
          <b style={{ color: MOD.circuito }}>Circuito</b>: WOD, metcon, core y la simulación.
        </li>
        <li>
          <b style={{ color: MOD.calent }}>Calentamiento</b>: movimientos al entrar o al cerrar, sin reloj.
        </li>
      </ul>

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
