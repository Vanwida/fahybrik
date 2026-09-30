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

    // Plan de los próximos días (docs/garmin-reloj/servidor.md).
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
    // Properties = editables por el atleta desde Garmin Connect Mobile.
    // Deben coincidir con resources/settings/properties.xml.
    const PROP_EMAIL = "email";
    const PROP_LOGIN_CODE = "loginCode";

    // Storage = SOLO en el reloj, ni se sincroniza ni se enseña en ajustes. Es
    // donde vive el token de sesión: un secreto no se pinta en una pantalla de
    // ajustes del móvil.
    const STORE_TOKEN = "session_token";
    // Email al que pertenece el token. Sin esto, un atleta que cambia el email en
    // los ajustes seguiría viendo el entreno del anterior: el token viejo sigue
    // siendo válido 30 días y nadie se enteraría.
    const STORE_TOKEN_EMAIL = "session_email";

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
    const LOGIN_CODE_TTL_MINUTES = 10;
    const LOGIN_CODE_LENGTH = 6;

    // Un plan sincronizado hace más de estos días se dice viejo y no deja empezar:
    // el coach pudo cambiar la sesión y el reloj no se enteró. Defecto de sistema.
    const PLAN_EDAD_MAX_DIAS = 2;
}
