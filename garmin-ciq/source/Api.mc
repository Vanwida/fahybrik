//
// Las peticiones que hace la app. Aquí se arma la URL, las cabeceras y las
// opciones; la orquestación (qué hacer con la respuesta) vive en Controller.
//
using Toybox.Communications;
using Toybox.Lang;

module Api {

    // ── Login (endpoints ya vivos, compartidos con iOS y Zepp) ───────────────

    // POST /api/auth/email/request { email } → 200 { ok: true } SIEMPRE, exista
    // el atleta o no (el endpoint es a prueba de enumeración a propósito). Por
    // eso un 200 aquí NO significa "te hemos mandado un email": significa "si
    // eres de la casa, mira el correo". El copy lo refleja.
    function requestLoginCode(email as Lang.String, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            Config.API_BASE + Config.PATH_AUTH_REQUEST,
            { "email" => email },
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => {
                    Config.HEADER_CONTENT_TYPE => Config.CONTENT_TYPE_JSON
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            callback
        );
    }

    // POST /api/auth/email/verify { email, code } → 200 con `session_token` en el
    // nivel superior. Mismo bearer que Sign in with Apple: audiencia atleta, 30
    // días. Ver web/app/api/auth/email/verify/route.ts.
    function verifyLoginCode(email as Lang.String, code as Lang.String, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            Config.API_BASE + Config.PATH_AUTH_VERIFY,
            { "email" => email, "code" => code },
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => {
                    Config.HEADER_CONTENT_TYPE => Config.CONTENT_TYPE_JSON
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            callback
        );
    }

    // ── Plan ─────────────────────────────────────────────────────────────────

    // GET /api/athlete/wearables/garmin/plan?from=YYYY-MM-DD&days=7  (fecha LOCAL del reloj)
    function fetchPlan(token as Lang.String, fromIso as Lang.String, days as Lang.Number, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            Config.API_BASE + Config.PATH_PLAN,
            { "from" => fromIso, "days" => days },
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => {
                    Config.HEADER_AUTH => Config.BEARER_PREFIX + token,
                    Config.HEADER_ACCEPT => Config.CONTENT_TYPE_JSON
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            callback
        );
    }

    // ── Resultado ────────────────────────────────────────────────────────────

    // POST /api/sync/workout-execution con el cuerpo de Resultado.cuerpo. Un 2xx es el acuse.
    function enviarResultado(token as Lang.String, cuerpo as Lang.Dictionary, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            Config.API_BASE + Config.PATH_EJECUCION,
            cuerpo,
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => {
                    Config.HEADER_AUTH => Config.BEARER_PREFIX + token,
                    Config.HEADER_CONTENT_TYPE => Config.CONTENT_TYPE_JSON
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            callback
        );
    }
}
