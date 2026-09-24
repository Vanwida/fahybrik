// GUÍA · Readiness y check-in — 0–100 frente a su base de 28 días, con la
// fecha; dónde se ve (Atletas, ficha, Hoy) y cuándo sube a Hoy (umbrales del
// coach en Ajustes › Método). El puente: su check-in de la mañana en el móvil.

import { DocSection, DocNote, MovilBand, PhoneMockup } from '../doc';
import type { GuiaSection } from '../config';


export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cada mañana tu atleta responde un <b>check-in</b> de medio minuto: cómo durmió, cómo tiene
          las piernas, con qué ánimo y energía se levanta. Eso, con lo que mide su reloj, se resume en
          un número de <b>0 a 100</b>: su <b>readiness</b>. Siempre se lee contra <b>su propia base</b>,
          no contra la de otro.
        </>
      }
    >
      <h3>Un número, su base y la fecha</h3>
      <p>
        El readiness combina su check-in con las señales del reloj (variabilidad cardíaca, sueño,
        pulso en reposo). Lo ves sin «%», con la fecha de la lectura y frente a su <b>base de 28
        días</b>: «42 · −15 vs su base · hoy». Mientras no tenga suficientes lecturas para una base, lo
        dice («sin base todavía»). El color sigue tus <b>bandas</b> (bien desde, cautela desde) de{' '}
        <b>Ajustes › Método</b>.
      </p>

      <h3>Dónde lo ves</h3>
      <ul className="clean">
        <li>
          <b>Atletas</b>: la columna <b>Readiness 14 d</b>, con su última lectura y la línea de dos
          semanas.
        </li>
        <li>
          <b>Su ficha</b>: arriba de la columna de su estado, con su base, su sueño, agujetas y
          fatiga, y su último <b>check-in</b> con <b>Responder</b> para contestarle ahí.
        </li>
        <li>
          <b>Hoy</b>: solo cuando algo se sale, con la prueba en la fila.
        </li>
      </ul>

      <h3>Cuándo sube a Hoy</h3>
      <p>
        Un readiness bajo no es una alarma por sí solo. Sube a Hoy si cae por debajo de tu{' '}
        <b>suelo urgente</b>, o si lleva <b>varios días seguidos</b> por debajo de su base. Una lectura
        vieja no cuenta: pasados los días que fijes, ya no describe hoy. Y la falta de check-in solo
        es señal en quien <b>tiene el hábito</b> de hacerlo; a quien nunca lo hace no se le persigue.
        Todos esos números son tuyos, en <b>Ajustes › Método</b>.
      </p>

      <DocNote variant="log" title="Sin datos, no hay número">
        <p>
          Si tu atleta no ha hecho el check-in ni su reloj ha sincronizado, no verás un readiness de
          relleno: verás «sin datos». Un hueco visible es mejor que un número que no se midió.
        </p>
      </DocNote>

      <MovilBand
        title="El check-in de la mañana, en su móvil"
        subtitle={
          <>
            A la izquierda, lo que responde tu atleta en medio minuto. A la derecha, el readiness que
            le devuelve la app, y el mismo número que tú lees en tu panel.
          </>
        }
      >
        {/* PHONE 1: check-in */}
        <PhoneMockup
          caption={
            <>
              <b>Su check-in.</b> Cuatro toques: sueño, piernas, ánimo y energía. Rápido a propósito:
              para que lo haga cada día.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Check-in de hoy
            </div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">Miércoles 14 ene</div>
          <div className="ph-title sm" style={{ marginBottom: '12px' }}>
            ¿Cómo te levantas?
          </div>

          <div className="logcard">
            <div className="lh">¿Cómo dormiste?</div>
            <div className="rpe">
              <span className="r">Mal</span>
              <span className="r">—</span>
              <span className="r sel">Bien</span>
              <span className="r">—</span>
              <span className="r">Genial</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Piernas / agujetas</div>
            <div className="rpe">
              <span className="r">Cargadas</span>
              <span className="r sel">Normal</span>
              <span className="r">Frescas</span>
            </div>
          </div>
          <div className="logcard">
            <div className="lh">Ánimo y energía</div>
            <div className="rpe">
              <span className="r">Bajo</span>
              <span className="r">—</span>
              <span className="r sel">Bien</span>
              <span className="r">—</span>
              <span className="r">Alto</span>
            </div>
          </div>
          <div className="cta">Guardar check-in</div>
        </PhoneMockup>

        {/* PHONE 2: readiness result on Inicio */}
        <PhoneMockup
          caption={
            <>
              <b>Su readiness.</b> El check-in + el reloj se vuelven un número con su lectura clara.
              Es el mismo dato que tú ves de su lado.
            </>
          }
        >
          <div className="kick">Tu mañana</div>
          <div className="ph-title sm" style={{ marginBottom: '14px' }}>
            Hola, Marc
          </div>
          <div className="tiles">
            <div className="tile">
              <span className="lbl">Readiness</span>
              <div className="big num">
                72<small> /100</small>
              </div>
              <div className="read" style={{ color: 'var(--ok)' }}>
                Recuperado y listo
              </div>
            </div>
            <div className="tile">
              <span className="lbl">Sueño</span>
              <div className="big num">
                7,4<small> h</small>
              </div>
              <div className="read">Buena noche</div>
            </div>
          </div>
          <div className="logcard" style={{ marginTop: '2px' }}>
            <div className="lh">Cómo se calcula</div>
            <div className="field">
              <span className="fl">Tu check-in</span>
              <span className="fv num" style={{ fontSize: '12px', color: 'var(--ok)' }}>
                Bien
              </span>
            </div>
            <div className="field">
              <span className="fl">Variabilidad (VFC)</span>
              <span className="fv num" style={{ fontSize: '12px' }}>
                +6%
              </span>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="fl">FC en reposo</span>
              <span className="fv num" style={{ fontSize: '12px' }}>
                48 ppm
              </span>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>
    </DocSection>
  );
}
