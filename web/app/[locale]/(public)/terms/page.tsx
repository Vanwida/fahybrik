import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Términos de servicio — FAHYBRID',
  description:
    'Términos y condiciones de uso de FAHYBRID, plataforma de coaching élite HYROX operada por el equipo de FAHYBRID.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '22 de junio de 2026';
const VERSION = '1.1';

function H2({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2
      id={id}
      className="mt-12 mb-4 font-display italic font-black text-[color:var(--fg)] text-2xl tracking-tight scroll-mt-20"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-reading leading-7 text-[color:var(--fg)]/90 mb-4">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-6 mb-4 space-y-1.5 text-reading leading-7 text-[color:var(--fg)]/90 marker:text-[color:var(--muted)]">
      {children}
    </ul>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[color:var(--fg)]">{children}</strong>;
}

export default function TermsPage() {
  return (
    <article>
      <header className="mb-10">
        <p className="text-label uppercase tracking-[0.16em] text-[color:var(--muted)] mb-3">
          Documento legal · Versión {VERSION}
        </p>
        <h1 className="font-display italic font-black text-[color:var(--fg)] text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Términos de servicio
        </h1>
        <p className="mt-4 text-sm text-[color:var(--muted)]">
          Última actualización: {LAST_UPDATED}
        </p>
      </header>

      <P>
        Bienvenido a FAHYBRID. Al usar la app, aceptas los términos descritos a
        continuación. Léelos con atención — si no estás de acuerdo con alguno de ellos,
        no uses el servicio. Esta es la versión castellana, gobierna por defecto.
      </P>

      <H2 id="servicio">1. Descripción del servicio</H2>
      <P>
        <Term>FAHYBRID</Term> es una plataforma de <Term>coaching élite HYROX e
        híbrido</Term> operada por la entidad responsable de FAHYBRID (razón social
        pendiente de constitución). El servicio se compone de:
      </P>
      <UL>
        <li>Una aplicación nativa para iOS dirigida al atleta.</li>
        <li>Un panel web (dashboard) usado por el coach.</li>
        <li>
          Un único entrenador,{' '}
          <Term>Pablo (Fabrik Training Club, Barcelona)</Term>, responsable de todo el
          coaching técnico que recibes a través de la plataforma.
        </li>
        <li>
          Un motor interno de planificación que ayuda a Pablo a planificar y adaptar tus
          planes en función de tus datos de entrenamiento y recuperación.
        </li>
      </UL>
      <P>
        FAHYBRID no es una app de entrenamiento generalista, ni un marketplace de
        entrenadores, ni un servicio médico. Es una herramienta de coaching élite con un
        coach único.
      </P>

      <H2 id="cuenta">2. Creación de cuenta y elegibilidad</H2>
      <UL>
        <li>
          Debes tener al menos <Term>16 años</Term> para crear una cuenta. Entre 14 y 16
          años, se requiere el consentimiento explícito de un progenitor o tutor legal.
        </li>
        <li>
          Te registras con <Term>Sign in with Apple</Term>. Aceptamos el relay privado de
          Apple sin penalización en el servicio.
        </li>
        <li>
          La información que aportas (nombre, fecha de nacimiento, peso, altura, marcas)
          debe ser veraz. La precisión de tu plan depende directamente de la veracidad de
          tus datos.
        </li>
        <li>
          Eres responsable de mantener la seguridad de tu dispositivo y de tu sesión. Si
          sospechas que alguien ha accedido a tu cuenta, escríbenos a{' '}
          <a
            href="mailto:hello@fahybrid.com"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            hello@fahybrid.com
          </a>
          .
        </li>
      </UL>

      <H2 id="uso">3. Uso aceptable</H2>
      <P>Al usar FAHYBRID, te comprometes a:</P>
      <UL>
        <li>
          <Term>No compartir tu cuenta</Term> con terceros. Una cuenta = un atleta.
        </li>
        <li>
          <Term>No hacer scraping</Term>, ingeniería inversa ni acceso automatizado al
          servicio fuera de las APIs públicas autorizadas.
        </li>
        <li>
          <Term>No reproducir, distribuir ni publicar</Term> contenido de la app
          (plantillas, programas, metodología) fuera del uso personal contemplado en el
          contrato.
        </li>
        <li>
          <Term>No usar lenguaje abusivo, amenazante u ofensivo</Term> contra el coach ni
          contra el equipo de soporte. El chat es una herramienta profesional.
        </li>
        <li>
          <Term>No subir contenido ilegal</Term>, fraudulento o que vulnere derechos de
          terceros.
        </li>
        <li>
          <Term>No interferir con la integridad técnica</Term> de la plataforma (intentos
          de DoS, inyección, etc.).
        </li>
      </UL>

      <H2 id="salud">4. Disclaimer médico y de salud</H2>
      <P>
        <Term>FAHYBRID no es un servicio médico ni sustituye al consejo de un profesional
        sanitario.</Term> Los planes que recibes son recomendaciones de entrenamiento
        deportivo elaboradas por un coach especializado, no diagnósticos ni prescripciones
        médicas.
      </P>
      <UL>
        <li>
          <Term>Consulta a tu médico</Term> antes de empezar cualquier plan de
          entrenamiento intenso, especialmente si tienes patología cardiovascular,
          metabólica, articular o cualquier condición que pueda agravarse con esfuerzo
          físico.
        </li>
        <li>
          La app <Term>no diagnostica lesiones</Term>. Las alertas de fatiga / sobrecarga
          son señales informativas, no decisiones clínicas.
        </li>
        <li>
          Los datos biométricos provenientes de wearables (Garmin, COROS, WHOOP, Amazfit, Apple Watch, Concept2)
          son <Term>datos de consumo</Term>, no datos médicos certificados. Su precisión
          depende del fabricante y del uso correcto del dispositivo.
        </li>
        <li>
          <Term>Entrenas bajo tu propia responsabilidad.</Term> En caso de dolor agudo,
          mareo, palpitaciones anómalas u otros síntomas durante una sesión, detente
          inmediatamente y busca atención médica.
        </li>
      </UL>
      <P>
        FAHYBRID no se hace responsable de lesiones, accidentes o daños derivados del
        seguimiento de planes de entrenamiento, ni del uso indebido de wearables o equipos
        deportivos.
      </P>

      <H2 id="ip">5. Propiedad intelectual</H2>
      <P>
        Toda la <Term>metodología, plantillas, programas y documentación</Term> de
        FAHYBRID — incluida la metodología de Pablo, las plantillas de sesión, la
        biblioteca de ejercicios y el material editorial — son propiedad intelectual de
        FAHYBRID y/o de Pablo, según corresponda.
      </P>
      <UL>
        <li>
          Mientras tu suscripción esté activa, te concedemos una <Term>licencia
          personal, no exclusiva, no transferible y revocable</Term> para usar el
          contenido en tu propio entrenamiento.
        </li>
        <li>
          Esta licencia <Term>no incluye</Term> redistribución, reventa, publicación,
          impartición a terceros ni adaptación con fines comerciales.
        </li>
        <li>
          La licencia termina automáticamente al cancelar la suscripción. Tus datos
          personales y de entrenamiento siguen las reglas de la{' '}
          <Link
            href="/privacy"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            Política de privacidad
          </Link>
          .
        </li>
        <li>
          Las marcas <Term>FAHYBRID</Term> y <Term>Fabrik Training Club</Term>, junto con
          sus logotipos asociados, son marcas de sus respectivos titulares.
        </li>
      </UL>
      <P>
        Tú conservas la propiedad de los datos personales y atléticos que aportas. Nos
        concedes una licencia técnica limitada para procesarlos en el contexto del
        servicio (ver Política de privacidad).
      </P>
      <P>
        Los datos sincronizados desde tu wearable (Garmin, COROS, WHOOP, Amazfit) se usan
        únicamente dentro del servicio para tu coaching y <Term>no se redistribuyen,
        revenden ni ceden a terceros</Term>. Conforme a los términos de cada fabricante, los
        datos de WHOOP no se conservan de forma permanente.
      </P>

      <H2 id="suscripcion">6. Suscripción y pagos</H2>
      <UL>
        <li>
          FAHYBRID funciona bajo modelo de <Term>suscripción</Term>. La estructura y
          precio concretos se comunican antes de la contratación y pueden variar entre
          grupos de atletas.
        </li>
        <li>
          La facturación es mensual por defecto. Otras periodicidades pueden ofrecerse
          puntualmente.
        </li>
        <li>
          Puedes <Term>cancelar en cualquier momento</Term>. La cancelación es efectiva al
          final del periodo ya pagado; no se prorratean reembolsos parciales por meses ya
          iniciados, salvo lo previsto por la legislación de consumidores española y
          europea.
        </li>
        <li>
          Los impuestos aplicables (IVA en España / OSS para el resto de la UE) se añaden
          al precio mostrado o se incluyen explícitamente, según corresponda.
        </li>
        <li>
          Si la pasarela de pago rechaza un cargo recurrente, te avisaremos y, tras un
          periodo de gracia razonable, suspenderemos el acceso al coaching activo hasta
          que se resuelva.
        </li>
      </UL>
      <P>
        Si eres consumidor en la UE, tienes <Term>derecho de desistimiento de 14 días</Term>{' '}
        desde la contratación, salvo que hayas iniciado expresamente el servicio antes del
        vencimiento de ese plazo (en cuyo caso pierdes el derecho de desistimiento por la
        prestación efectivamente consumida, conforme al Art. 16(a) de la Directiva
        2011/83/UE y su transposición española).
      </P>

      <H2 id="terminacion">7. Suspensión y terminación</H2>
      <UL>
        <li>
          Puedes <Term>cancelar tu cuenta en cualquier momento</Term> desde la app o
          escribiendo a{' '}
          <a
            href="mailto:hello@fahybrid.com"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            hello@fahybrid.com
          </a>
          .
        </li>
        <li>
          FAHYBRID puede <Term>suspender o terminar</Term> tu cuenta si:
          <ul className="list-[circle] pl-6 mt-1.5 space-y-1">
            <li>
              Incumples los términos de uso aceptable (especialmente abuso al coach o
              fraude).
            </li>
            <li>Hay impagos reiterados que no se resuelven.</li>
            <li>Hay un riesgo de seguridad o legal que requiera acción inmediata.</li>
          </ul>
        </li>
        <li>
          En caso de terminación por nuestra parte por causa justificada, podrás solicitar
          la portabilidad de tus datos en los 30 días siguientes a la baja antes de su
          eliminación, según la Política de privacidad.
        </li>
      </UL>

      <H2 id="responsabilidad">8. Limitación de responsabilidad</H2>
      <P>
        El servicio se ofrece <Term>&ldquo;tal cual&rdquo;</Term> y{' '}
        <Term>&ldquo;según disponibilidad&rdquo;</Term>.
        Aunque hacemos todo lo razonable para mantener la app operativa, no garantizamos
        que esté libre de errores, interrupciones o pérdidas puntuales de datos.
      </P>
      <P>
        En la medida máxima permitida por la legislación aplicable, la responsabilidad
        agregada de FAHYBRID frente a ti, por cualquier reclamación derivada del uso del
        servicio, queda limitada al{' '}
        <Term>importe total efectivamente pagado por ti durante los 12 meses anteriores
        al hecho generador de la reclamación</Term>.
      </P>
      <P>
        Esta limitación <Term>no se aplica</Term>:
      </P>
      <UL>
        <li>A daños causados por dolo o negligencia grave de FAHYBRID.</li>
        <li>
          A daños a la vida, a la integridad física o a la salud directamente imputables a
          FAHYBRID.
        </li>
        <li>
          A derechos de los consumidores que no puedan limitarse contractualmente conforme
          a la legislación española y europea.
        </li>
      </UL>

      <H2 id="modificaciones">9. Modificaciones del servicio y de los términos</H2>
      <P>
        Podemos actualizar el servicio (añadir funciones, retirar otras, ajustar la
        infraestructura) y estos términos cuando sea razonablemente necesario. Si los
        cambios son materiales, te avisaremos con al menos <Term>30 días de antelación</Term>{' '}
        por email y desde la app antes de su entrada en vigor. Si no estás de acuerdo,
        puedes cancelar la suscripción antes de la fecha de aplicación.
      </P>

      <H2 id="ley">10. Legislación aplicable y jurisdicción</H2>
      <P>
        Estos términos se rigen por la <Term>legislación española</Term> y, en lo
        aplicable, por la normativa de la Unión Europea (especialmente RGPD y normativa de
        consumidores).
      </P>
      <P>
        Para cualquier disputa, las partes intentarán primero una resolución amistosa
        contactando con{' '}
        <a
          href="mailto:hello@fahybrid.com"
          className="text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          hello@fahybrid.com
        </a>
        . Si no se alcanza acuerdo, serán competentes los <Term>juzgados y tribunales de
        Barcelona</Term>, sin perjuicio del fuero del consumidor que la ley reconozca a tu
        favor cuando seas consumidor en la UE.
      </P>
      <P>
        Como consumidor europeo, también puedes acudir a la plataforma de Resolución de
        Litigios en Línea de la Comisión Europea:{' '}
        <a
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          ec.europa.eu/consumers/odr
        </a>
        .
      </P>

      <H2 id="contacto">11. Contacto</H2>
      <UL>
        <li>
          Asuntos legales y contractuales:{' '}
          <a
            href="mailto:hello@fahybrid.com"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            hello@fahybrid.com
          </a>
        </li>
        <li>
          Privacidad y datos personales:{' '}
          <a
            href="mailto:hello@fahybrid.com"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            hello@fahybrid.com
          </a>
        </li>
      </UL>

      <p className="mt-12 text-xs text-[color:var(--muted)]">
        Versión {VERSION} · Publicada el {LAST_UPDATED}.
      </p>
    </article>
  );
}
