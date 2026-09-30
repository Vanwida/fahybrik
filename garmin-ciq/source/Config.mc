//
// Constantes del proyecto. Fuente única: ni una URL, ni una clave de ajuste ni un
// umbral suelto por el resto del código.
//
using Toybox.Lang;

module Config {
    // ── Backend ──────────────────────────────────────────────────────────────
    // HTTPS obligatorio: Garmin rechaza http:// en makeWebRequest.
    const API_BASE = "https://fahybrid.com";

    // Login del atleta — endpoints YA VIVOS, los mismos que usan iOS y la
    // mini-app de Zepp (ver zepp/setting/index.js). No inventamos nada aquí.
    const PATH_AUTH_REQUEST = "/api/auth/email/request";
    const PATH_AUTH_VERIFY = "/api/auth/email/verify";
    // Renueva la sesión con el token vigente (web/app/api/auth/refresh/route.ts).
    const PATH_AUTH_REFRESH = "/api/auth/refresh";

    // Plan de los próximos días (docs/garmin-reloj/servidor.md).
    // El resultado de la sesión: el MISMO endpoint que ya usa el móvil.
    const PATH_EJECUCION = "/api/sync/workout-execution";
    const PATH_PLAN = "/api/athlete/wearables/garmin/plan";
    // El reloj de la sesión: 1 Hz.
    const TICK_MS = 1000;

    // Cuántos días de plan se piden al abrir con móvil.
    const PLAN_DIAS = 7;

    const HEADER_AUTH = "Authorization";
    const HEADER_CONTENT_TYPE = "Content-Type";
    const HEADER_ACCEPT = "Accept";
    const CONTENT_TYPE_JSON = "application/json";
    const BEARER_PREFIX = "Bearer ";

    // ── Claves de almacenamiento ─────────────────────────────────────────────
    // Todo vive en Storage: SOLO en el reloj, ni se sincroniza ni se enseña en
    // ningún ajuste. El login se hace en el propio reloj: una app copiada por USB
    // no aparece en Garmin Connect Mobile, así que no puede depender de sus ajustes.
    const STORE_TOKEN = "session_token";
    // Cuándo caduca el token (epoch, segundos; lo dice el servidor) y cuándo se
    // renovó por última vez (epoch). Sin la primera no se puede saber que ya murió
    // sin gastar una petición; sin la segunda se renovaría en cada apertura.
    const STORE_TOKEN_EXP = "session_exp";
    const STORE_TOKEN_RENOVADO = "session_renovado";
    // El último email con el que entró: teclear un email en un reloj cuesta, no se pide dos veces.
    const STORE_EMAIL = "login_email";
    // Cuándo se pidió el último código (epoch). Si el atleta cierra la app para ir a
    // mirar el correo, al volver se le sigue esperando el código en vez de mandarle otro.
    const STORE_CODIGO_PEDIDO = "login_pedido";

    // Plan en Storage: una clave por sesión + el índice + la fecha de la última sincronía.
    const STORE_PLAN_PREFIJO = "plan_";
    const STORE_PLAN_INDICE = "plan_ix";
    const STORE_PLAN_SYNC = "plan_sync";
    // El checkpoint de la sesión en curso (G10) y la cola de resultados por enviar (G8).
    const STORE_CHECKPOINT = "checkpoint";
    const STORE_COLA = "cola";
    // Una clave de Storage admite 8 KB: un plan de más no se guarda (y se dice).
    const STORE_CLAVE_MAX_CARACTERES = 8192;

    // ── Reglas de negocio ────────────────────────────────────────────────────
    // El código de acceso caduca en 10 min en el servidor
    // (AUTH_CONFIG.emailLoginCodeTtlSeconds). El copy lo dice tal cual: prometer
    // otra cosa sería mentir al atleta.
    const LOGIN_CODE_TTL_S = 600;
    const LOGIN_CODE_LENGTH = 6;
    // Tope del email del esquema del servidor (z.string().email() admite más, pero
    // el campo de un reloj no).
    const EMAIL_MAX_LENGTH = 120;

    // La sesión se renueva al abrir con móvil, a lo sumo una vez al día (el
    // servidor lo pide así: una renovación de más solo gasta cupo).
    const RENOVAR_CADA_S = 86400;

    // Un plan sincronizado hace más de estos días se dice viejo y no deja empezar:
    // el coach pudo cambiar la sesión y el reloj no se enteró. Defecto de sistema.
    const PLAN_EDAD_MAX_DIAS = 2;
}
