//
// La máquina de estados. Único sitio donde se decide qué ve el atleta.
//
//   ajustes del móvil (email + código)  →  token de sesión
//        →  plan de los próximos días  →  brief  →  sesión en curso
//
using Toybox.Communications;
using Toybox.Lang;
using Toybox.WatchUi;

class Controller {

    // Lo que pinta la vista. Público a propósito: la vista no decide nada.
    var state as Lang.Number;
    var title as Lang.String;
    var body as Lang.String;
    var note as Lang.String;          // segunda línea, gris (puede ir vacía)
    var action as Lang.String;        // etiqueta del botón (vacía = no hay acción)

    // Ya hemos pedido un código en esta sesión de app. Sirve para no volver a
    // mandar otro cada vez que el atleta pulsa mientras espera al email.
    var codeRequested as Lang.Boolean;

    function initialize() {
        state = AppState.STATE_BUSY;
        title = "";
        body = "";
        note = "";
        action = "";
        codeRequested = false;
    }

    // ── Entrada única ────────────────────────────────────────────────────────

    // Se llama al arrancar y cada vez que cambian los ajustes desde el móvil.
    function refresh() as Void {
        // Token de otro email = el atleta ha cambiado de cuenta en los ajustes.
        // Se tira: enseñarle el entreno del anterior sería peor que pedirle login.
        if (Store.hasToken() && !Store.tokenMatchesEmail()) {
            Store.clearToken();
            codeRequested = false;
        }
        if (!Store.hasToken()) {
            resumeLogin();
            return;
        }
        loadToday();
    }

    // ── Vinculación de la cuenta ─────────────────────────────────────────────
    //
    // Los ajustes de Garmin son XML declarativo: no hay botones que llamen a una
    // API desde el móvil (a diferencia de Zepp, donde la pantalla de ajustes es
    // JavaScript). Así que las dos llamadas HTTP las hace el RELOJ, y el móvil
    // solo aporta el teclado: el atleta escribe el email, el reloj pide el
    // código, el atleta escribe el código, el reloj lo canjea.

    function resumeLogin() as Void {
        var email = Store.email();
        if (email.equals("")) {
            show(AppState.STATE_NEEDS_EMAIL, Rez.Strings.TitleLogin, Rez.Strings.BodyNeedsEmail, "");
            return;
        }
        var code = Store.loginCode();
        if (code.length() == Config.LOGIN_CODE_LENGTH) {
            verifyCode(email, code);
            return;
        }
        // Hay un código escrito pero no tiene 6 dígitos: mejor decirlo que
        // mandarlo y comerse un 400 sin explicación.
        if (!code.equals("")) {
            show(AppState.STATE_NEEDS_CODE, Rez.Strings.TitleCode, Rez.Strings.BodyCodeLength, Rez.Strings.ActionSendCode);
            return;
        }
        // Ya pedimos código y aún no ha bajado del móvil: se queda esperando en
        // vez de retroceder a "Pedir código", que mandaría un segundo email e
        // invalidaría el primero justo cuando el atleta lo está tecleando.
        if (codeRequested) {
            show(AppState.STATE_CODE_SENT, Rez.Strings.TitleCode, Rez.Strings.BodyCodeSent, Rez.Strings.ActionCheckCode);
            return;
        }
        show(AppState.STATE_NEEDS_CODE, Rez.Strings.TitleCode, Rez.Strings.BodyNeedsCode, Rez.Strings.ActionSendCode);
    }

    function sendLoginCode() as Void {
        var email = Store.email();
        if (email.equals("")) {
            resumeLogin();
            return;
        }
        busy(Rez.Strings.BusySendingCode);
        Api.requestLoginCode(email, method(:onLoginCodeSent));
    }

    function onLoginCodeSent(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        if (responseCode != 200) {
            failure(responseCode);
            return;
        }
        // El endpoint responde 200 { ok: true } exista el atleta o no (es a
        // prueba de enumeración a propósito): un 200 aquí NO prueba que el email
        // sea de un atleta nuestro, solo que la petición se cursó.
        codeRequested = true;
        show(AppState.STATE_CODE_SENT, Rez.Strings.TitleCode, Rez.Strings.BodyCodeSent, Rez.Strings.ActionCheckCode);
    }

    function verifyCode(email as Lang.String, code as Lang.String) as Void {
        busy(Rez.Strings.BusyVerifying);
        Api.verifyLoginCode(email, code, method(:onCodeVerified));
    }

    function onCodeVerified(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        // El código es de un solo uso: se limpia SIEMPRE, salga bien o mal, para
        // que no quede escrito en los ajustes del móvil ni se reintente en bucle.
        Store.clearLoginCode();

        if (responseCode == 400 || responseCode == 429) {
            // 400 = código malo o caducado; 429 = demasiados intentos. En los dos
            // casos el camino es el mismo: pedir uno nuevo.
            codeRequested = false;
            show(AppState.STATE_NEEDS_CODE, Rez.Strings.TitleCode, Rez.Strings.ErrBadCode, Rez.Strings.ActionSendCode);
            return;
        }
        if (responseCode != 200) {
            failure(responseCode);
            return;
        }

        // /api/auth/email/verify devuelve `session_token` en el NIVEL SUPERIOR
        // (jsonOk no envuelve en { data }). Mismo bearer que Sign in with Apple.
        var token = Json.str(Json.dict(data), "session_token");
        if (token.equals("")) {
            codeRequested = false;
            show(AppState.STATE_NEEDS_CODE, Rez.Strings.TitleCode, Rez.Strings.ErrBadCode, Rez.Strings.ActionSendCode);
            return;
        }
        Store.saveToken(token, Store.email());
        codeRequested = false;
        loadToday();
    }

    // ── Sesión iniciada ──────────────────────────────────────────────────────

    function loadToday() as Void {
        show(AppState.STATE_NO_SESSION, Rez.Strings.TitleLinked, Rez.Strings.BodyLinked, "");
    }

    // ── Acción del botón, según estado ───────────────────────────────────────

    function primaryAction() as Void {
        if (state == AppState.STATE_NEEDS_CODE || state == AppState.STATE_CODE_SENT) {
            if (state == AppState.STATE_CODE_SENT) {
                refresh();      // el atleta dice que ya lo ha escrito en el móvil
            } else {
                sendLoginCode();
            }
            return;
        }
        // Error, "hoy no toca", "esto va en la app", falta el email: en todos, lo
        // único que puede ayudar es volver a preguntar. Estos estados no pintan
        // botón, pero el START físico sigue sirviendo para reintentar.
        // STATE_BUSY cae aquí también y no hace nada: es el guardarraíl contra el
        // doble pulsado mientras hay una petición en vuelo.
        if (state != AppState.STATE_BUSY) {
            refresh();
        }
    }

    // ── Helpers de estado ────────────────────────────────────────────────────

    // makeWebRequest necesita el móvil por Bluetooth o WiFi ya conectado. Sin
    // eso, -104 (BLE_CONNECTION_UNAVAILABLE). Es la causa nº1 de "no me
    // funciona", y la única en la que tiene sentido tirar de lo ya descargado.
    function isNetworkError(responseCode as Lang.Number) as Lang.Boolean {
        return responseCode == Communications.BLE_CONNECTION_UNAVAILABLE ||
               responseCode == Communications.BLE_HOST_TIMEOUT ||
               responseCode == Communications.BLE_SERVER_TIMEOUT ||
               responseCode == Communications.BLE_ERROR ||
               responseCode == Communications.NETWORK_REQUEST_TIMED_OUT;
    }

    // 401 = el token ya no vale (caducado a los 30 días, o revocado). Se borra:
    // reintentar con él solo daría 401 en bucle.
    function expireSession() as Void {
        Store.clearToken();
        codeRequested = false;
        if (Store.email().equals("")) {
            show(AppState.STATE_NEEDS_EMAIL, Rez.Strings.TitleExpired, Rez.Strings.BodyNeedsEmail, "");
            return;
        }
        show(AppState.STATE_NEEDS_CODE, Rez.Strings.TitleExpired, Rez.Strings.BodyExpired, Rez.Strings.ActionSendCode);
    }

    function failure(responseCode as Lang.Number) as Void {
        if (isNetworkError(responseCode)) {
            show(AppState.STATE_ERROR, Rez.Strings.TitleNoConnection, Rez.Strings.BodyNoConnection, Rez.Strings.ActionRetry);
            return;
        }
        // El código crudo va en pantalla a propósito: es lo único que permite a
        // Pablo o a nosotros diagnosticar por teléfono qué le pasa al atleta.
        state = AppState.STATE_ERROR;
        title = resolve(Rez.Strings.TitleError);
        body = resolve(Rez.Strings.BodyErrorCode) + " " + responseCode.toString();
        note = "";
        action = resolve(Rez.Strings.ActionRetry);
        WatchUi.requestUpdate();
    }

    function busy(messageId) as Void {
        state = AppState.STATE_BUSY;
        title = "";
        body = resolve(messageId);
        note = "";
        action = "";
        WatchUi.requestUpdate();
    }

    // `titleValue` y `bodyValue` aceptan tanto un id de recurso como texto ya
    // resuelto (el nombre del entreno viene del servidor, no de strings.xml).
    function show(newState as Lang.Number, titleValue, bodyValue, actionValue) as Void {
        state = newState;
        title = resolve(titleValue);
        body = resolve(bodyValue);
        note = "";
        action = resolve(actionValue);
        WatchUi.requestUpdate();
    }

    function resolve(value) as Lang.String {
        if (value instanceof Lang.String) {
            return value;
        }
        if (value == null) {
            return "";
        }
        return WatchUi.loadResource(value).toString();
    }
}
