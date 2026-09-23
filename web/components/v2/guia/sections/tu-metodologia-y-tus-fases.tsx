// GUÍA · Tu método — Ajustes › Método: la entrevista «Cómo entrenas» y su
// párrafo, el nombre de la clasificación, los pasos de «Progresar», los marcadores
// clave, las bandas de readiness y los umbrales de los avisos (todo dato del
// coach con su valor por defecto). El puente: el nombre del programa es su fase.

import { DocSection, Principle, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';

const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
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
          Aquí no hay un método impuesto. En <b>Ajustes › Método</b> cuentas cómo entrenas, cómo
          llamas a tu clasificación de atletas, cuánto sube «Progresar», qué marcadores quieres ver
          en cada ficha y qué te tiene que avisar. Todo trae un valor por defecto a la vista; si no
          tocas nada, funciona igual.
        </>
      }
    >
      <Principle>
        <p>
          <b>Nosotros damos la palanca, tú pones el método.</b> Si periodizas por «Acumulación ·
          Transformación · Realización», escribes eso en el nombre de tus programas. Si usas otro
          lenguaje, el tuyo. No hay fases prefijadas ni jerga obligatoria.
        </p>
      </Principle>

      <h3>Cómo entrenas, en un párrafo</h3>
      <p>
        Siete capítulos de casillas: a qué te dedicas, cómo partes el tiempo, la semana, qué se ve en
        una sesión, de dónde salen los números, cómo avanza y cómo se lo dices. Cada respuesta
        reescribe el párrafo de arriba (<b>Tu sistema, en un párrafo</b>), y tú lo corriges a mano si
        algo no suena a ti. Ese párrafo es lo que leen la IA del plan, el chat y el conector cuando
        te ayudan.
      </p>

      <h3>Cómo agrupas a tus atletas</h3>
      <p>
        Si los clasificas por nivel, objetivo o turno, el nombre de esa clasificación es tuyo (por
        defecto, «Nivel») y aparece así en Atletas, en los filtros y en los grupos.
      </p>

      <h3>Progresar, marcadores y bandas</h3>
      <ul className="clean">
        <li>
          <b>Progresar en el editor de programas</b>: cuánto sube la carga por semana, cuántas series
          añade y cuánto baja el volumen una descarga. Son los valores con los que se abre «Progresar
          selección».
        </li>
        <li>
          <b>Marcadores clave en la ficha</b>: los tests y marcas que quieres ver junto a cada atleta,
          en tu orden (hasta seis).
        </li>
        <li>
          <b>Bandas de readiness</b>: desde qué número pintas «bien» y desde cuál «cautela».
        </li>
      </ul>

      <h3>Qué te tiene que avisar</h3>
      <p>
        Los avisos de Hoy son números tuyos: el readiness por debajo del cual es urgente, cuánto
        tiene que caer frente a su base y cuántos días seguidos, cuánto vale una lectura, cuántos
        entrenos sin hacer en 7 días, desde qué RPE un entreno es duro, cuántas horas puede esperar
        un mensaje antes de pasar a <b>Por responder</b>… Cada fila dice su valor por defecto, y{' '}
        <b>Restaurar valores por defecto</b> lo deja todo como venía (con deshacer).
      </p>

      <DocNote variant="log" title="Tu fase es el nombre de tu programa">
        <p>
          No existe una «fase» aparte: el nombre que le pones a cada programa es lo que tu atleta lee
          como su fase, y el orden de los programas en un grupo es tu periodización (ver{' '}
          <b>Grupos</b>).
        </p>
      </DocNote>

      <MovilBand
        title="Tu fase, en su teléfono"
        subtitle={
          <>
            El nombre que le diste al programa encabeza la semana del atleta como su <b>fase</b>.
            Lo que escribes es exactamente lo que él lee.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Su semana.</b> La fase es lo primero que ve: el nombre de tu programa, tal cual lo
              escribiste.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '6px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tu semana
            </div>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M8 6h12M8 12h12M8 18h12" />
              </svg>
            </div>
          </div>

          {/* Phase banner — the programa name */}
          <div
            style={{
              background: 'var(--accSoft)',
              border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc)' }}>
              Fase
            </div>
            <div className="ph-title sm" style={{ margin: '2px 0 0' }}>
              Acumulación
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Semana 2 de 5
            </div>
          </div>

          <div className="foco-strip">
            <span className="l">FOCO</span>
            <span className="v">Base aeróbica</span>
          </div>

          <div className="day today">
            <span className="dl">LUN</span>
            <span className="mdot" style={{ background: MOD.carrera }} />
            <span className="dt">Tirada larga Z2</span>
            <span className="stg done">✓</span>
          </div>
          <div className="day">
            <span className="dl">MAR</span>
            <span className="mdot" style={{ background: MOD.fuerza }} />
            <span className="dt">Fuerza · tren inferior</span>
            <span className="stg pend">›</span>
          </div>
          <div className="day">
            <span className="dl">MIÉ</span>
            <span className="mdot" style={{ background: MOD.ergo }} />
            <span className="dt">Remo Z2</span>
            <span className="stg pend">›</span>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
