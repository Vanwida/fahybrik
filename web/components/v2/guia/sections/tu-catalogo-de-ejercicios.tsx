// GUÍA · Tus ejercicios — Programar › Biblioteca › Ejercicios: Base /
// Personalizado / Mío, tu versión (vídeo, claves, descripción) y el enlace
// automático desde la línea rápida. El puente: el detalle del ejercicio en su app.

import { DocSection, DocNote, MovilBand, PhoneMockup, PanelFigure, Chips } from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cada línea de un entreno apunta a un <b>ejercicio</b> de tu catálogo: un movimiento con su
          nombre, su modalidad y, si quieres, tu <b>vídeo</b> y tus <b>claves</b>. No se escriben
          nombres sueltos: por eso tu atleta puede abrirlo en el móvil y ver cómo lo quieres hecho, y
          por eso la app puede sumar su volumen.
        </>
      }
    >
      <PanelFigure>
        <Chips
          items={[
            { label: 'Todos', count: 77, active: true },
            { label: 'Mío', count: 0 },
            { label: 'Personalizado', count: 0 },
            { label: 'Base', count: 77 },
          ]}
        />
      </PanelFigure>

      <h3>Biblioteca › Ejercicios</h3>
      <p>
        Una tabla con el nombre, el nombre en inglés, la modalidad y su origen: <b>Base</b> (vienen
        con la app), <b>Personalizado</b> (uno de la base con tu versión) o <b>Mío</b> (lo creaste
        tú). El buscador entiende castellano e inglés. <b>Nuevo ejercicio</b> crea uno; el{' '}
        <b>···</b> de cada fila, <b>Editar</b> (y <b>Borrar…</b> si es tuyo).
      </p>

      <h3>Tu versión: vídeo, claves y descripción</h3>
      <p>
        En cualquiera puedes poner tu <b>vídeo</b> (lo subes o pegas un enlace, y se reproduce en el
        propio campo), tus <b>claves</b> («pecho arriba, rodilla fuera») y una <b>descripción</b>. Si
        el ejercicio es de la base, lo que escribas se guarda <b>solo para ti</b> y es lo que verán
        tus atletas; lo que dejes vacío sigue heredando lo de la base, nunca un hueco.
      </p>

      <h3>Enlazado solo, al escribir</h3>
      <p>
        En la línea rápida de un programa o de la biblioteca escribes el nombre como te sale
        («sentadilla», «back squat», «wallballs») y se enlaza al ejercicio de tu catálogo; si hay
        varios parecidos te los ofrece, y cuando eliges uno lo recuerda para la próxima vez. Si no
        existe, la línea te lo dice: créalo aquí y vuelve.
      </p>

      <DocNote variant="log" title="La modalidad viene con el ejercicio">
        <p>
          Cada ejercicio trae su modalidad (fuerza, carrera, ergómetro…), así que al elegirlo el
          entreno ya sabe qué tipo de trabajo es y lo pinta con su color, en tu panel y en su móvil.
        </p>
      </DocNote>

      <MovilBand
        title="El ejercicio, en su teléfono"
        subtitle={
          <>
            Cuando tu atleta abre un ejercicio del entreno, ve tu <b>vídeo</b> de demostración y tus{' '}
            <b>claves</b>. Cero ambigüedad sobre cómo lo quieres hecho.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Detalle del ejercicio.</b> Tu vídeo arriba, tus claves debajo. Lo que escribiste en el
              panel aterriza aquí tal cual.
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
              Ejercicio
            </div>
            <div style={{ width: '30px' }} />
          </div>

          {/* Video card */}
          <div
            style={{
              position: 'relative',
              height: '128px',
              borderRadius: '14px',
              background: 'var(--elev)',
              border: '1px solid var(--hair)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '8px',
                left: '10px',
                fontSize: '8px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
              }}
            >
              Demostración
            </span>
            <span
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--acc)',
                color: 'var(--accOn)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                paddingLeft: '3px',
              }}
            >
              ▶
            </span>
          </div>

          <div className="ph-title sm" style={{ marginBottom: '4px' }}>
            Sentadilla trasera
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <span className="slot" style={{ background: 'var(--v2-mod-fuerza-soft)', color: MOD.fuerza }}>
              Fuerza
            </span>
            <span className="slot" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              Barra
            </span>
          </div>

          <div className="logcard">
            <div className="lh">Indicaciones de tu coach</div>
            <div style={{ fontSize: '12px', color: 'var(--fg)', lineHeight: 1.55 }}>
              · Pecho alto, mirada al frente.
              <br />· Baja controlado hasta romper paralelo.
              <br />· Empuja con el suelo, rodillas hacia fuera.
            </div>
          </div>
          <div className="logcard" style={{ marginBottom: 0 }}>
            <div className="lh">Descripción</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
              Patrón base de tren inferior. Si dudas del peso, quédate corto y sube la próxima.
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
