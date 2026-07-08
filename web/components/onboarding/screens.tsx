'use client';

// Screen dispatcher for the onboarding flow. Maps each question kind to its
// renderer (option-based → screens.options, free-input → screens.fields) and
// owns the two centred bookend panels (intro + final). A question screen returns
// the two grid children of `.ob-screen`; intro/final return a centred panel.

import { BookingSlotPicker } from '@/components/citas/BookingSlotPicker';
import { ArrowIcon } from './icons';
import type { ScreenCallbacks, ScreenProps } from './screens.shared';
import {
  Composite2Screen,
  DatosScreen,
  MultiScreen,
  SingleScreen,
} from './screens.options';
import {
  ContactoScreen,
  NumberFieldsScreen,
  TextLikeScreen,
  TextareaScreen,
  TimeScreen,
} from './screens.fields';

export type { AnswerPatch, ScreenCallbacks } from './screens.shared';

// ── Intro / final (centred panels) ───────────────────────────────────────────
export function IntroScreen({ cb }: { cb: ScreenCallbacks }) {
  return (
    <div className="ob-center">
      <div className="ob-wordmark ob-wordmark--intro">
        <span className="ob-f">F</span>AHYBRID
      </div>
      <h1 className="ob-lead">Cuéntanos de ti</h1>
      <p className="ob-sub ob-intro-sub">4 minutos. Con esto Pablo prepara tu llamada y tu plan.</p>
      <button type="button" className="ob-btn ob-btn--intro" onClick={cb.onStart}>
        Empezar <ArrowIcon />
      </button>
    </div>
  );
}

export function FinalScreen({
  nombre,
  email,
  bookingToken,
  waitlisted = false,
  waitlistPosition = null,
}: {
  nombre: string;
  email: string;
  bookingToken?: string | null;
  /** #18: coach at capacity → show the exclusive "lista de espera" state (no slots). */
  waitlisted?: boolean;
  /** The lead's 1-based place in the waitlist (only shown when `waitlisted`). */
  waitlistPosition?: number | null;
}) {
  // Waitlist state — the group is full. Framed as exclusivity, never rejection: a
  // small coached group, a saved spot, and an honest "we'll email you by arrival".
  if (waitlisted) {
    return (
      <div className="ob-center">
        <div className="ob-badge">Lista de espera</div>
        <h1 className="ob-lead ob-final-lead">Ahora mismo no quedan plazas.</h1>
        <p className="ob-sub ob-final-sub">
          Pablo entrena a un grupo reducido para cuidar cada plan al detalle
          {nombre ? `, ${nombre}` : ''} — y justo ahora está completo. Te hemos guardado sitio en
          la lista: en cuanto se libere una plaza te avisamos por email, por orden de llegada.
        </p>
        {waitlistPosition ? (
          <p className="ob-echo-email">
            Eres el <strong>nº {waitlistPosition}</strong> en la lista de espera.
          </p>
        ) : null}
        {email ? (
          <p className="ob-echo-email">
            Te hemos enviado un email a <strong>{email}</strong>.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ob-center">
      <div className="ob-badge">Solicitud recibida</div>
      <h1 className="ob-lead ob-final-lead">Perfecto{nombre ? `, ${nombre}` : ''}.</h1>
      <p className="ob-sub ob-final-sub">
        {bookingToken
          ? 'Ya casi está. Elige el hueco para tu videollamada con Pablo.'
          : 'Te escribimos en breve para agendar tu llamada con Pablo. 30 minutos, sin coste.'}
      </p>
      {email ? (
        <p className="ob-echo-email">
          Te hemos enviado un email a <strong>{email}</strong>.
        </p>
      ) : null}
      {bookingToken ? <BookingSlotPicker token={bookingToken} variant="onboarding" /> : null}
    </div>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
export function QuestionScreen(props: ScreenProps) {
  switch (props.question.kind) {
    case 'single':
      return <SingleScreen {...props} />;
    case 'multi':
      return <MultiScreen {...props} />;
    case 'text':
    case 'email':
      return <TextLikeScreen {...props} />;
    case 'tel':
      return <ContactoScreen {...props} />;
    case 'time':
      return <TimeScreen {...props} />;
    case 'textarea':
      return <TextareaScreen {...props} />;
    case 'numberfields':
      return <NumberFieldsScreen {...props} />;
    case 'composite2':
      return <Composite2Screen {...props} />;
    case 'datos':
      return <DatosScreen {...props} />;
    case 'contacto':
      return <ContactoScreen {...props} />;
    default:
      return null;
  }
}
