// GUÍA · 24 Pagos: cobro por Stripe — área "Tu negocio". El precio nace en el
// alta (acordado en la llamada, variable por atleta, mensual) y EL PAGO ACTIVA EL
// ACCESO — nadie entra sin pagar, salvo cortesía. El panel muestra estados reales
// (vencidos primero), el MRR y la señal "Cobro en riesgo" en Hoy. Bridge: el atleta
// recibe el email de aceptación con su precio y paga por Stripe Checkout.

import {
  DocSection,
  QCWTriad,
  DocFlow,
  DocNote,
  MovilBand,
  PhoneMockup,
} from '../doc';
import type { GuiaSection } from '../config';
import { ClubMark } from '../tenant';

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Cobro serio, por <b>Stripe</b>. El precio no lo inventa el sistema: <b>nace en el alta</b>,
          con el importe que acordaste con cada atleta en la llamada, mensual y distinto por persona.
          Y algo clave: <b>el pago activa el acceso</b>. Nadie entra en la app sin pagar, salvo que lo
          marques como <em className="em">cortesía</em>.
        </>
      }
    >
      <DocFlow
        steps={[
          { label: 'Fijas el precio en el alta' },
          { label: 'El atleta paga (Stripe Checkout)', app: true },
          { label: 'El pago activa su acceso' },
          { label: 'En Cobros, solo lo que pide acción' },
        ]}
      />

      <QCWTriad
        que={
          <>
            Una <b>suscripción mensual</b> por atleta, de importe variable, cobrada por Stripe. En tu
            panel, <b>Negocio › Cobros</b>: lo que entra al mes y solo quién necesita algo (vencidos,
            sin pagar, bajas y renovaciones de la semana).
          </>
        }
        como={
          <>
            Al convertir un lead en atleta escribes el <b>precio €/mes</b> (viene pre-rellenado del parte de la
            llamada) o marcas <b>cortesía</b>. El atleta recibe un email con su precio y un botón de
            pago; al pagar, se activa solo.
          </>
        }
        porque={
          <>
            Porque cobrar no debería costarte perseguir transferencias ni precios perdidos en un
            Excel. El cobro y el acceso son <b>la misma acción</b>.
          </>
        }
      />

      {/* The single most important honesty note for a coach reading today. */}
      <DocNote variant="bad" title="Se activa próximamente">
        <p>
          Mientras las claves de Stripe no estén configuradas en este entorno, el alta de pago te
          avisa (<span className="k"> «El cobro por Stripe está pendiente de configurar. De momento
          el alta se hace como cortesía; el cobro se activará cuando esté listo.»</span>) y solo deja
          dar de alta como <b>cortesía</b>. Nunca lanza un error ni crea un atleta a medias: en cuanto
          las claves estén puestas, el cobro funciona sin tocar nada más.
        </p>
      </DocNote>

      <h3>1 · El precio nace en el alta</h3>
      <p>
        Al <b>Convertir en atleta</b> (desde el panel del lead) hay un bloque <b>Cobro</b>: escribes el{' '}
        <b>precio acordado €/mes</b> (pre-rellenado <em className="em">del parte de la llamada</em>)
        o marcas <b>Cortesía (sin cobro)</b>. Ese número es la cuota real de ese atleta; no hay tarifas
        fijas ni planes cerrados.
      </p>

      <h3>2 · El pago activa el acceso</h3>
      <p>
        Al confirmar con un precio, el atleta recibe un <b>email de aceptación</b> con su precio y un
        botón que abre <b>Stripe Checkout</b> (suscripción mensual de importe variable). Su acceso a la
        app <b>no se abre hasta que Stripe confirma el pago</b>: solo entonces le llega el enlace para
        entrar. En cortesía, el acceso es inmediato y no se abre ningún cobro.
      </p>

      <h3>3 · Los estados, con los vencidos primero</h3>
      <p>
        <b>Cobros</b> enseña solo a quién atender: <b>vencidos arriba</b>, luego quien aún no ha
        pagado, quien se da de baja a fin de periodo y quien renueva esta semana. Cada fila tiene su
        acción: <b>Recordar pago</b> (un mensaje tuyo en su chat, que ves y editas antes de
        enviar), <b>Abrir en Stripe</b> y <b>Marcar cobrado</b> si te pagó por otra vía (la factura
        queda pagada en Stripe sin cargar su tarjeta). Los que están al día, plegados. Un impago
        además sube a <b>Hoy</b>.
      </p>

      <DocNote variant="cue" title="Las reglas del cobro">
        <ul>
          <li>
            <b>Pausa</b> → pausa el cobro (Stripe deja de facturar; el atleta no paga mientras está en
            pausa).
          </li>
          <li>
            <b>Baja</b> → cancela la suscripción <b>a fin de periodo</b> (mantiene el acceso hasta que
            se agote lo ya pagado).
          </li>
          <li>
            <b>Dobles</b> → un solo cobro por pareja: la fila se muestra una vez, marcada{' '}
            <span className="k">compartida con…</span>.
          </li>
          <li>
            La <b>firma de Stripe se verifica siempre</b> y el procesamiento es <b>idempotente</b>: un
            webhook nunca cobra ni activa dos veces.
          </li>
        </ul>
      </DocNote>

      <MovilBand
        title="Cómo paga tu atleta"
        subtitle={
          <>
            Recibe un email de aceptación con <b>su precio</b> y un botón de pago. Paga con tarjeta por
            Stripe, la renovación es mensual y automática, y en cuanto el pago se confirma, se activa
            su acceso a la app.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>El email de aceptación.</b> Su cuota mensual y un botón que abre Stripe Checkout. El
              enlace para entrar en la app llega <b>después</b>, cuando el pago se confirma.
            </>
          }
        >
          <div className="ph-hd" style={{ paddingBottom: '8px' }}>
            <div className="ico-btn">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16v12H4z" />
                <path d="M4 7l8 6 8-6" />
              </svg>
            </div>
            <div className="ph-mark"><ClubMark /></div>
            <div className="avatar">M</div>
          </div>
          <div className="kick">
            Bienvenido/a a <ClubMark />
          </div>
          <div className="ph-title">Activa tu plan</div>
          <div
            style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}
          >
            Hola, Marc. Tu entrenador ha preparado tu plan personalizado.
          </div>

          <div className="hero">
            <div className="row">
              <span className="slot">CUOTA</span>
              <span className="hk">renovación mensual automática</span>
            </div>
            <div className="ht num">90 €/mes</div>
            <div className="meta">Pago seguro por Stripe · cancela cuando quieras</div>
            <div className="cta">Pagar y activar</div>
          </div>

          <div className="row-card">
            <div className="ca">✓</div>
            <div className="tx">
              <div className="e">Tras el pago</div>
              <div className="m">Te enviamos el enlace para entrar en la app</div>
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <p style={{ marginTop: '18px' }}>
        Así el dinero deja de ser un cabo suelto: el precio que acordaste viaja del alta al cobro sin
        re-teclear, el acceso premia al que paga, y tú ves de un vistazo quién está al día y quién se
        te escapa, con los vencidos siempre delante.
      </p>
    </DocSection>
  );
}
