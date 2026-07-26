//
// Las tres peticiones que hace la app. Aquí se arma la URL, las cabeceras y las
// opciones; la orquestación (qué hacer con la respuesta) vive en Controller.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO ASUMIDO DEL ENDPOINT DEL .FIT  ← RECONCILIAR
// ─────────────────────────────────────────────────────────────────────────────
// Vive en web/app/api/athlete/wearables/garmin/. Esto es lo que
// esta app espera. Si el endpoint acaba distinto, se toca SOLO este bloque.
//
// (1)  GET {API_BASE}/api/athlete/wearables/garmin/today?date=YYYY-MM-DD
//      Cabecera: Authorization: Bearer <session_token de /api/auth/email/verify>
//      La `date` es la fecha LOCAL del reloj (ver DateUtil): el servidor no
//      puede adivinar el huso del atleta.
//
//      200 → application/json, campos en el NIVEL SUPERIOR (jsonOk no envuelve):
//      {
//        "has_session":  true,
//        "exportable":   true,                      // false = existe sesión pero no
//                                                   //   es carrera (fuerza/EMOM/AMRAP):
//                                                   //   ningún formato de reloj la
//                                                   //   representa. Ver
//                                                   //   shared/domain/wearables/watch-workout.ts
//        "reason":       null,                      // p.ej. "strength" cuando exportable=false
//        "workout_name": "25 jul · 8×400",          // ← CLAVE: el nombre EXACTO con el que
//                                                   //   el .FIT se guarda en el reloj. Es el
//                                                   //   único identificador que la app puede
//                                                   //   leer de vuelta (getName()). Debe ser
//                                                   //   único por día y ≤ 40 caracteres
//                                                   //   (STEP_NAME_MAX del modelo neutro).
//        "summary":      "8×400 a 3:35/km · 5,6 km",// una línea para la pantalla
//        "fit_url":      "https://fahybrid.com/api/athlete/wearables/garmin/workout?..."
//      }
//
//      401 → token caducado o revocado (la app borra el token y pide login).
//
// (2)  GET {fit_url}
//      Cabecera: Authorization: Bearer <token>
//      200 con **Content-Type: application/vnd.ant.fit** y el .FIT en el cuerpo.
//
//      OJO, esto es LO MÁS FRÁGIL del contrato: el proxy de Garmin Connect NO
//      mira el contenido, solo la cabecera Content-Type. Si no coincide con el
//      responseType declarado, ni siquiera transmite los bytes al reloj y la
//      descarga falla sin explicación.
//      Ref: https://developer.garmin.com/connect-iq/core-topics/downloading-content/
//
//      La URL debe ser absoluta y https. Puede llevar su propio token firmado en
//      el query string; la app manda igualmente el Bearer, así que sirven las dos.
// ─────────────────────────────────────────────────────────────────────────────
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

    // ── Entreno de hoy ───────────────────────────────────────────────────────

    function fetchToday(token as Lang.String, isoDate as Lang.String, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            Config.API_BASE + Config.PATH_TODAY,
            { "date" => isoDate },
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

    // ── Descarga del .FIT ────────────────────────────────────────────────────

    // Con :responseType => HTTP_RESPONSE_CONTENT_TYPE_FIT la app NUNCA ve los
    // bytes: el sistema descarga el fichero, lo valida y lo persiste él solo. Lo
    // que llega al callback es un PersistedContent.Iterator con lo recién
    // guardado (la firma publicada del callback omite ese tipo — es un fallo
    // conocido del SDK, ver el bug 4.1.6 en el foro de Connect IQ; por eso el
    // callback lleva (:typecheck(false)) en Controller).
    // Ref: https://developer.garmin.com/connect-iq/core-topics/downloading-content/
    function downloadFit(url as Lang.String, token as Lang.String, callback as Lang.Method) as Void {
        Communications.makeWebRequest(
            url,
            null,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => {
                    Config.HEADER_AUTH => Config.BEARER_PREFIX + token
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_FIT
            },
            callback
        );
    }
}
