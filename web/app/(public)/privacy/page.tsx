import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de privacidad — FAHYBRIK',
  description:
    'Política de privacidad de FAHYBRIK, plataforma de coaching HYROX operada por Vanwida (España). Cumplimiento RGPD.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '8 de mayo de 2026';
const VERSION = '1.0';

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

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 font-display italic font-black text-[color:var(--fg)] text-base tracking-tight">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-7 text-[color:var(--fg)]/90 mb-4">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-6 mb-4 space-y-1.5 text-[15px] leading-7 text-[color:var(--fg)]/90 marker:text-[color:var(--muted)]">
      {children}
    </ul>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[color:var(--fg)]">{children}</strong>;
}

export default function PrivacyPage() {
  return (
    <article>
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)] mb-3">
          Documento legal · Versión {VERSION}
        </p>
        <h1 className="font-display italic font-black text-[color:var(--fg)] text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Política de privacidad
        </h1>
        <p className="mt-4 text-sm text-[color:var(--muted)]">
          Última actualización: {LAST_UPDATED}
        </p>
      </header>

      <section
        aria-label="English summary for partner reviewers"
        className="mb-10 rounded-[14px] border border-[color:var(--outline)] bg-[color:var(--surface)] p-5"
      >
        <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)] mb-2">
          English summary
        </p>
        <p className="text-[14px] leading-6 text-[color:var(--fg)]/90">
          FAHYBRIK is a coaching platform operated by Vanwida (Spain, EU). We process
          health, training, and biometric data — including data sourced from{' '}
          <Term>Garmin Connect (Health &amp; Activity APIs)</Term>,{' '}
          <Term>Apple HealthKit</Term>, and <Term>Concept2 PM5</Term> — under{' '}
          <Term>Art. 6(1)(a) and Art. 9(2)(a) GDPR (explicit consent)</Term> for the sole
          purpose of athletic coaching. Data is stored encrypted in the EU (Neon Postgres,
          Frankfurt). Users can revoke consent and request erasure at any time at{' '}
          <a
            href="mailto:privacy@vanwida.pro"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            privacy@vanwida.pro
          </a>
          . Garmin disconnections are honoured within 30 days; OAuth tokens are destroyed
          immediately upon deregistration. Full policy below in Spanish.
        </p>
      </section>

      <P>
        En FAHYBRIK tomamos en serio tu privacidad. Esta política explica qué datos
        recogemos, por qué los recogemos, cómo los protegemos y los derechos que tienes
        sobre ellos. Está redactada para que la entiendas — si algo no te queda claro,
        escríbenos a{' '}
        <a
          href="mailto:privacy@vanwida.pro"
          className="text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          privacy@vanwida.pro
        </a>
        .
      </P>

      <H2 id="responsable">1. Quién es el responsable</H2>
      <P>
        El responsable del tratamiento de tus datos es <Term>Vanwida</Term>, sociedad
        legalmente establecida en España, operadora del producto FAHYBRIK. Tu entrenador
        de referencia dentro de la plataforma es <Term>Pablo (Fabrik Training Club, Barcelona)</Term>,
        que actúa como destinatario de los datos que tú decides compartir con él para tu
        coaching.
      </P>
      <P>Datos de contacto:</P>
      <UL>
        <li>
          Privacidad y RGPD:{' '}
          <a
            href="mailto:privacy@vanwida.pro"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            privacy@vanwida.pro
          </a>
        </li>
        <li>
          Asuntos legales:{' '}
          <a
            href="mailto:legal@vanwida.pro"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            legal@vanwida.pro
          </a>
        </li>
        <li>Jurisdicción: España. Legislación aplicable: RGPD (UE 2016/679) y LOPDGDD.</li>
      </UL>

      <H2 id="datos">2. Qué datos recogemos</H2>
      <P>
        Solo recogemos lo necesario para tu coaching. Nada de scraping de tu vida digital,
        nada de scopes especulativos. Concretamente:
      </P>

      <H3>2.1 Datos personales básicos</H3>
      <UL>
        <li>Nombre y apellidos.</li>
        <li>Correo electrónico (Apple ID privado relay aceptado).</li>
        <li>Fecha de nacimiento.</li>
        <li>Sexo biológico (relevante para la prescripción de entrenamiento y umbrales fisiológicos).</li>
        <li>Altura y peso (medida y actualizable por ti).</li>
        <li>Idioma e idioma preferido para la app.</li>
      </UL>

      <H3>2.2 Datos atléticos y de rendimiento</H3>
      <UL>
        <li>Marcas personales (1RM en sentadilla, peso muerto, press, etc.).</li>
        <li>Tiempos de carrera por distancias (1km, 5km, 10km, half, marathon, etc.).</li>
        <li>Historial HYROX (estaciones, splits, posición, evento).</li>
        <li>VO₂máx, umbrales de lactato, FTP cuando los aportas o se calculan.</li>
        <li>Tests específicos del coach (carga máxima en sled, tiempos en wall balls, etc.).</li>
      </UL>

      <H3>2.3 Datos biométricos y de recuperación (categoría especial — Art. 9 RGPD)</H3>
      <P>
        Solo se procesan con tu <Term>consentimiento explícito</Term> activo, que puedes
        retirar en cualquier momento. Incluyen:
      </P>
      <UL>
        <li>Frecuencia cardíaca en reposo y durante esfuerzo.</li>
        <li>Variabilidad de la frecuencia cardíaca (HRV) y su tendencia respecto a tu baseline.</li>
        <li>Datos de sueño (duración, fases, calidad).</li>
        <li>Body Battery / nivel de recuperación, Training Load, Training Status, HRV Status (cuando provienen de Garmin).</li>
        <li>VO₂máx estimado por el dispositivo.</li>
        <li>Saturación de oxígeno (SpO₂) y temperatura cuando el dispositivo las reporta.</li>
        <li>Peso, masa magra y composición corporal cuando la sincronizas.</li>
      </UL>

      <H3>2.4 Datos de entrenamiento</H3>
      <UL>
        <li>Sesiones completadas: ejercicios, series, repeticiones, kilos, tiempos.</li>
        <li>Datos de actividad importados (FIT, TCX, GPX): GPS, ritmo, cadencia, potencia, vueltas (laps).</li>
        <li>RPE (esfuerzo percibido) y notas que tú escribes.</li>
        <li>Check-in matutino: sueño percibido, energía, dolor, estado emocional.</li>
        <li>Datos de remo Concept2 PM5 cuando lo conectas (cuando esté disponible).</li>
      </UL>

      <H3>2.5 Comunicaciones</H3>
      <UL>
        <li>Mensajes que intercambias con Pablo en el chat de la app.</li>
        <li>Notas que el coach añade sobre ti (visibles para él, también para ti).</li>
        <li>Correos transaccionales (verificación, recordatorios, alertas).</li>
      </UL>

      <H3>2.6 Datos técnicos del dispositivo</H3>
      <UL>
        <li>Modelo de iPhone, versión de iOS, idioma del sistema.</li>
        <li>Modelo del wearable conectado (Garmin Forerunner / Fenix / Epix, Apple Watch).</li>
        <li>Identificadores opacos de sesión (no compartidos con redes publicitarias).</li>
        <li>Logs técnicos de errores (sin contenido personal).</li>
      </UL>

      <H2 id="finalidad">3. Para qué los usamos</H2>
      <P>Cada dato se procesa con una finalidad concreta y verificable:</P>
      <UL>
        <li>
          <Term>Prescripción y adaptación del entrenamiento.</Term> Pablo y el motor ATR
          (Acumulación / Transformación / Realización) usan tus datos para periodizar tus
          bloques de entrenamiento.
        </li>
        <li>
          <Term>Detección temprana de fatiga acumulada.</Term> Body Battery, HRV Status,
          Training Status y check-in matutino alimentan un modelo que avisa al coach antes
          de que un sobreentrenamiento se convierta en lesión.
        </li>
        <li>
          <Term>Análisis de competición HYROX.</Term> Los splits por estación se mapean a
          tus laps de Garmin para calcular fatiga por estación (sled push, burpee broad
          jump, wall balls, etc.).
        </li>
        <li>
          <Term>Comunicación contigo.</Term> Mensajería con tu coach, recordatorios de
          sesión, notificaciones de cambio de plan.
        </li>
        <li>
          <Term>Seguridad y operación de la plataforma.</Term> Detectar fraude, abuso,
          accesos no autorizados.
        </li>
      </UL>
      <P>
        <Term>Lo que NO hacemos:</Term> no vendemos datos, no los cedemos a redes
        publicitarias, no los usamos para entrenar modelos de IA ajenos a tu coaching, no
        creamos perfiles comerciales con ellos.
      </P>

      <H2 id="base-legal">4. Base legal del tratamiento</H2>
      <UL>
        <li>
          <Term>Consentimiento explícito (Art. 6(1)(a) y Art. 9(2)(a) RGPD)</Term> para
          datos de salud, biométricos y recuperación. Lo otorgas en onboarding y al
          conectar Garmin / Apple Health, y puedes retirarlo en cualquier momento.
        </li>
        <li>
          <Term>Ejecución del contrato (Art. 6(1)(b) RGPD)</Term> para los datos
          necesarios para prestarte el servicio de coaching (perfil, sesiones, mensajes).
        </li>
        <li>
          <Term>Obligación legal (Art. 6(1)(c) RGPD)</Term> para conservación contable y
          fiscal de pagos.
        </li>
        <li>
          <Term>Interés legítimo (Art. 6(1)(f) RGPD)</Term> para seguridad de la
          plataforma y prevención de fraude, siempre proporcionado y revisable.
        </li>
      </UL>

      <H2 id="encargados">5. Encargados del tratamiento (proveedores)</H2>
      <P>
        Trabajamos con un número reducido de proveedores de infraestructura, todos con
        contrato DPA firmado y, salvo casos justificados, con datos en la UE:
      </P>
      <UL>
        <li>
          <Term>Neon (base de datos Postgres).</Term> Región{' '}
          <span className="font-mono text-[13px]">aws-eu-central-1</span> (Frankfurt,
          Alemania). Cifrado en reposo por defecto. Aquí vive todo tu perfil, sesiones y
          métricas normalizadas.
        </li>
        <li>
          <Term>Vercel (hosting de la app web y funciones serverless).</Term> Funciones
          desplegadas en región europea. Variables de entorno cifradas. No persisten datos
          personales en disco.
        </li>
        <li>
          <Term>Resend (envío de email transaccional).</Term> Verificación de cuenta y
          alertas. Acceso solo al email y al contenido del correo enviado.
        </li>
        <li>
          <Term>Garmin Connect Developer Program (Health &amp; Activity APIs).</Term>{' '}
          Cuando conectas Garmin, autorizas que Vanwida reciba tus datos de Garmin Connect
          mediante OAuth 2.0 con PKCE. Garmin actúa como fuente de origen; Vanwida los
          almacena cifrados en la UE. Puedes revocar la conexión desde Garmin Connect o
          desde la app — tus datos derivados de Garmin se eliminan en un máximo de 30
          días tras la deregistración.
        </li>
        <li>
          <Term>Apple HealthKit.</Term> Apple HealthKit funciona en tu propio iPhone:
          Vanwida solo recibe los datos que tú apruebas explícitamente sincronizar. Apple
          no actúa como encargado externo en el sentido tradicional — controla tu
          dispositivo, tú controlas la sincronización.
        </li>
        <li>
          <Term>Anthropic (Claude) y/o OpenAI / OpenRouter (LLM).</Term> Algunas funciones
          internas del coach pueden usar modelos de lenguaje para resumir notas o redactar
          borradores. Cuando esto ocurre, los datos enviados al modelo son los
          estrictamente necesarios y nunca se usan para entrenar modelos de terceros (los
          proveedores ofrecen rutas de API con esa garantía contractual). El proveedor LLM
          definitivo se confirmará antes de la activación del coaching.
        </li>
      </UL>
      <P>
        No compartimos tus datos con anunciantes, redes sociales, brokers de datos ni con
        terceros fuera de esta lista.
      </P>

      <H2 id="seguridad">6. Cómo los protegemos</H2>
      <UL>
        <li>
          <Term>Cifrado en tránsito:</Term> TLS 1.2+ en todas las conexiones cliente ↔
          servidor y servidor ↔ proveedores.
        </li>
        <li>
          <Term>Cifrado en reposo:</Term> Neon Postgres con cifrado AES-256 gestionado.
          Tokens OAuth (Garmin, Apple) cifrados a nivel de columna con AES-256-GCM y clave
          gestionada por entorno.
        </li>
        <li>
          <Term>Aislamiento de entornos:</Term> producción separada de desarrollo, sin
          datos reales en entornos no productivos.
        </li>
        <li>
          <Term>Control de acceso:</Term> el equipo técnico de Vanwida accede vía SSO con
          MFA y registro de auditoría. Pablo solo ve datos de atletas que han consentido
          compartir con él.
        </li>
        <li>
          <Term>Sin secretos en logs.</Term> No registramos contenido personal, mensajes
          ni tokens en logs.
        </li>
        <li>
          <Term>Webhooks de Garmin verificados</Term> y procesados con idempotencia para
          evitar duplicados y replay.
        </li>
      </UL>
      <P>
        Si detectamos una brecha de seguridad que afecte a tus datos personales, te
        notificaremos sin demora indebida y, en cualquier caso, dentro de las 72 horas
        siguientes a su confirmación, conforme al Art. 34 RGPD.
      </P>

      <H2 id="retencion">7. Cuánto tiempo conservamos tus datos</H2>
      <UL>
        <li>
          <Term>Mientras seas atleta activo:</Term> conservamos tu historial completo de
          entrenamiento y biométrico para que el plan tenga continuidad.
        </li>
        <li>
          <Term>12 meses tras dar de baja la suscripción:</Term> conservamos los datos en
          modo archivado por si decides reactivar; siguen cifrados y sin uso activo.
        </li>
        <li>
          <Term>Tras 12 meses de baja:</Term> eliminamos tus datos personales y de salud
          de forma permanente, salvo que nos pidas expresamente borrarlos antes (en cuyo
          caso lo hacemos en un máximo de 30 días).
        </li>
        <li>
          <Term>Datos derivados de Garmin tras desconexión:</Term> eliminados en un máximo
          de 30 días tras recibir el evento de deregistración. Los tokens OAuth se
          destruyen inmediatamente.
        </li>
        <li>
          <Term>Datos contables (facturas, pagos):</Term> conservados durante el período
          legalmente exigido en España (hasta 6 años para libros y registros mercantiles,
          Art. 30 Código de Comercio).
        </li>
      </UL>

      <H2 id="derechos">8. Tus derechos (RGPD)</H2>
      <P>Tienes derecho a:</P>
      <UL>
        <li>
          <Term>Acceso (Art. 15):</Term> obtener confirmación de qué datos tuyos
          tratamos y una copia.
        </li>
        <li>
          <Term>Rectificación (Art. 16):</Term> corregir datos inexactos.
        </li>
        <li>
          <Term>Supresión (Art. 17):</Term> pedir el borrado de tus datos cuando ya no
          sean necesarios o retires el consentimiento.
        </li>
        <li>
          <Term>Limitación del tratamiento (Art. 18):</Term> pedir que pausemos el uso
          mientras se resuelve una disputa.
        </li>
        <li>
          <Term>Portabilidad (Art. 20):</Term> recibir tus datos en formato estructurado y
          legible por máquina (JSON / CSV).
        </li>
        <li>
          <Term>Oposición (Art. 21):</Term> oponerte al tratamiento basado en interés
          legítimo.
        </li>
        <li>
          <Term>Retirada del consentimiento (Art. 7.3):</Term> retirar el consentimiento
          en cualquier momento, sin afectar la legalidad del tratamiento previo.
        </li>
      </UL>
      <P>
        Para ejercer cualquiera de estos derechos, escríbenos a{' '}
        <a
          href="mailto:privacy@vanwida.pro"
          className="text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          privacy@vanwida.pro
        </a>
        . Responderemos en un máximo de 30 días.
      </P>
      <P>
        También tienes derecho a presentar una reclamación ante la{' '}
        <Term>Agencia Española de Protección de Datos (AEPD)</Term> si crees que hemos
        tratado tus datos incorrectamente:{' '}
        <a
          href="https://www.aepd.es"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--accent)] underline-offset-4 hover:underline"
        >
          www.aepd.es
        </a>
        .
      </P>

      <H2 id="cookies">9. Cookies y almacenamiento local</H2>
      <P>
        FAHYBRIK no usa cookies de seguimiento ni de publicidad. Solo usamos cookies
        técnicas estrictamente necesarias para la sesión:
      </P>
      <UL>
        <li>
          Cookie de sesión del coach (dashboard web): <Term>HttpOnly, Secure, SameSite=Lax</Term>,
          duración limitada a la sesión activa.
        </li>
        <li>
          En la app iOS, los tokens de sesión se guardan en el <Term>Keychain</Term> del
          sistema operativo, cifrados por iOS.
        </li>
      </UL>
      <P>
        No usamos Google Analytics, Meta Pixel ni ninguna herramienta publicitaria de
        terceros.
      </P>

      <H2 id="menores">10. Menores</H2>
      <P>
        FAHYBRIK está diseñada para atletas <Term>mayores de 16 años</Term>. Si tienes
        entre 14 y 16 años, necesitamos el consentimiento expreso de uno de tus
        progenitores o tutores legales (Art. 8 RGPD y Art. 7 LOPDGDD). No procesamos datos
        de menores de 14 años bajo ninguna circunstancia. Si descubrimos que hemos
        recogido datos de un menor sin el consentimiento adecuado, los eliminaremos
        inmediatamente.
      </P>

      <H2 id="transferencias">11. Transferencias internacionales</H2>
      <P>
        Tus datos se almacenan principalmente en la UE (Frankfurt). Algunos proveedores
        (proveedor LLM, Resend) pueden procesar datos en EE. UU. En esos casos, las
        transferencias se amparan en{' '}
        <Term>Cláusulas Contractuales Tipo (SCCs)</Term> aprobadas por la Comisión Europea
        y, cuando procede, en el <Term>EU-US Data Privacy Framework</Term>. Puedes pedirnos
        copia de las garantías aplicables.
      </P>

      <H2 id="cambios">12. Cambios en esta política</H2>
      <P>
        Si introducimos cambios materiales (nuevos proveedores, nuevas finalidades,
        cambios en la base legal), te avisaremos con al menos <Term>30 días de antelación</Term>
        por email y dentro de la app antes de que entren en vigor. Los cambios menores de
        redacción o aclaraciones se publicarán aquí con la fecha actualizada.
      </P>

      <H2 id="contacto">13. Contacto</H2>
      <P>
        Si tienes cualquier pregunta sobre esta política o sobre cómo tratamos tus datos,
        escríbenos:
      </P>
      <UL>
        <li>
          Privacidad y derechos RGPD:{' '}
          <a
            href="mailto:privacy@vanwida.pro"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            privacy@vanwida.pro
          </a>
        </li>
        <li>
          Asuntos legales generales:{' '}
          <a
            href="mailto:legal@vanwida.pro"
            className="text-[color:var(--accent)] underline-offset-4 hover:underline"
          >
            legal@vanwida.pro
          </a>
        </li>
      </UL>

      <p className="mt-12 text-[12px] text-[color:var(--muted)]">
        Versión {VERSION} · Publicada el {LAST_UPDATED}.
      </p>
    </article>
  );
}
