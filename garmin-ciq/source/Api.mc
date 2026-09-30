//
// Las peticiones que hace la app. Aquí se arma la URL, las cabeceras y las
// opciones; la orquestación (qué hacer con la respuesta) vive en Controller.
//
using Toybox.Communications;
using Toybox.Lang;

module Api {

    // ── Sesión (endpoints ya vivos, compartidos con iOS y Zepp) ──────────────

    // Los cuerpos, aparte de la petición: son el contrato con el servidor y lo que
    // los tests del simulador comprueban sin red.
    function cuerpoPedir(email as Lang.String) as Lang.Dictionary {
        return { "email" => email };
    }

    // El código va como TEXTO de 6 dígitos: como número perdería el cero de la izquierda
    // y fallaría el /^\d{6}$/ del servidor.
    function cuerpoVerificar(email as Lang.String, code as Lang.String) as Lang.Dictionary {
        return { "email" => email, "code" => code };
    }

    // POST /api/auth/email/request { email } → 200 { ok: true } SIEMPRE, exista el
    // atleta o no (el endpoint es a prueba de enumeración a propósito). Por eso un
    // 200 aquí NO significa "te hemos mandado un email": significa "si eres de la
    // casa, mira el correo". El copy lo refleja. 400 = email mal formado; 429 = demasiadas peticiones.
    function requestLoginCode(email as Lang.String, callback as Lang.Method) as Void {
        post(Config.PATH_AUTH_REQUEST, cuerpoPedir(email), null, callback);
    }

    // POST /api/auth/email/verify { email, code } → 200 con `session_token` y `expires_at`
    // en el nivel superior. Mismo bearer que Sign in with Apple: audiencia atleta.
    // 400 = código malo o caducado; 429 = demasiados intentos.
    // Ver web/app/api/auth/email/verify/route.ts.
    function verifyLoginCode(email as Lang.String, code as Lang.String, callback as Lang.Method) as Void {
        post(Config.PATH_AUTH_VERIFY, cuerpoVerificar(email, code), null, callback);
    }

    // POST /api/auth/refresh (sin cuerpo) con el token vigente → 200 { session_token,
    // expires_at }; 401 = ya no vale. El token viejo NO se revoca en el servidor.
    function refreshSession(token as Lang.String, callback as Lang.Method) as Void {
        post(Config.PATH_AUTH_REFRESH, {}, token, callback);
    }

    // POST JSON con el bearer si lo hay.
    function post(path as Lang.String, cuerpo as Lang.Dictionary, token as Lang.String or Null, callback as Lang.Method) as Void {
        var headers = { Config.HEADER_CONTENT_TYPE => Config.CONTENT_TYPE_JSON };
        if (token != null) {
            headers[Config.HEADER_AUTH] = Config.BEARER_PREFIX + token;
        }
        Communications.makeWebRequest(
            Config.API_BASE + path,
            cuerpo,
            {
                :method => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => headers,
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
        post(Config.PATH_EJECUCION, cuerpo, token, callback);
    }
}
