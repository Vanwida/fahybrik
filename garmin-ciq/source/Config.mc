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

    // ── Reglas de negocio ────────────────────────────────────────────────────
    // El código de acceso caduca en 10 min en el servidor
    // (AUTH_CONFIG.emailLoginCodeTtlSeconds). El copy lo dice tal cual: prometer
    // otra cosa sería mentir al atleta.
    const LOGIN_CODE_TTL_MINUTES = 10;
    const LOGIN_CODE_LENGTH = 6;
}
