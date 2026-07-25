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

    // Entreno del día para reloj Garmin. CONTRATO ASUMIDO — lo construye otro
    // agente bajo web/app/api/wearables/garmin-ciq/. Ver CONTRATO en Api.mc.
    const PATH_TODAY = "/api/wearables/garmin-ciq/today";

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
    const STORE_WORKOUT_NAME = "last_workout_name";
    const STORE_WORKOUT_DATE = "last_workout_date";

    // ── Reglas de negocio ────────────────────────────────────────────────────
    // El código de acceso caduca en 10 min en el servidor
    // (AUTH_CONFIG.emailLoginCodeTtlSeconds). El copy lo dice tal cual: prometer
    // otra cosa sería mentir al atleta.
    const LOGIN_CODE_TTL_MINUTES = 10;
    const LOGIN_CODE_LENGTH = 6;

    // Techo defensivo al limpiar entrenos viejos nuestros: si por lo que sea el
    // iterador no terminase, no nos quedamos colgados dentro del bucle.
    const MAX_APP_WORKOUTS_SCAN = 64;
}
