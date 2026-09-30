//
// La máquina de estados. Único sitio donde se decide qué ve el atleta.
//
//   ajustes del móvil (email + código)  →  token de sesión
//        →  plan de los próximos días  →  brief  →  sesión en curso
//
using Toybox.Communications;
using Toybox.Lang;
using Toybox.Timer;
using Toybox.WatchUi;

class Controller {

    // Lo que pinta la vista. Público a propósito: la vista no decide nada.
    var state as Lang.Number;
    var title as Lang.String;
    var body as Lang.String;
    var note as Lang.String;          // segunda línea, gris (puede ir vacía)
    var action as Lang.String;        // etiqueta del botón (vacía = no hay acción)

    // El plan de hoy: las filas del índice, la elegida y la sesión decodificada.
    var filas as Lang.Array;
    var sel as Lang.Number;
    var sesion as Sesion or Null;
    var sinConexion as Lang.Boolean;
    var edadPlanDias as Lang.Number;

    // La sesión en vivo y el reloj de 1 Hz que la mueve.
    var vivo as Vivo;
    var reloj as Timer.Timer;

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
        filas = [];
        sel = 0;
        sesion = null;
        sinConexion = false;
        edadPlanDias = 0;
        vivo = new Vivo(self);
        reloj = new Timer.Timer();
    }

    // El reloj de 1 Hz (H3: un watch-app solo repinta con requestUpdate; el 1 Hz lo da un Timer).
    function iniciarReloj() as Void {
        reloj.start(method(:onTick), Config.TICK_MS, true);
    }

    function onTick() as Void {
        if (state == AppState.STATE_BRIEF) {
            WatchUi.requestUpdate();     // GPS y pulso del brief
            return;
        }
        vivo.tick();
    }

    // ── teclas (la tabla de §5 vive en Vivo; aquí solo el brief y los estados de texto) ─

    function onSelect() as Lang.Boolean {
        if (vivo.alSelect()) {
            return true;
        }
        primaryAction();
        return true;
    }

    // BACK cierra la app SOLO fuera de la sesión (jamás grabando).
    function onBack() as Lang.Boolean {
        return vivo.alBack() ? true : false;
    }

    function onUp() as Lang.Boolean {
        if (vivo.alUp()) {
            return true;
        }
        return cambiarSesion(-1);
    }

    function onDown() as Lang.Boolean {
        if (vivo.alDown()) {
            return true;
        }
        return cambiarSesion(1);
    }

    function onMenu() as Lang.Boolean {
        return vivo.alMenu();
    }

    // En el brief con varias sesiones el mismo día: UP/DOWN eligen (G03).
    function cambiarSesion(delta as Lang.Number) as Lang.Boolean {
        if (state != AppState.STATE_BRIEF || filas.size() < 2) {
            return false;
        }
        sel = (sel + delta + filas.size()) % filas.size();
        openSession();
        return true;
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
        syncPlan();
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
        syncPlan();
    }

    // ── El plan ──────────────────────────────────────────────────────────────

    // Al abrir con móvil: los próximos días, con la fecha LOCAL del reloj.
    function syncPlan() as Void {
        busy(Rez.Strings.BusySyncing);
        Api.fetchPlan(Store.token(), DateUtil.todayIso(), Config.PLAN_DIAS, method(:onPlan));
    }

    function onPlan(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        if (responseCode == 401) {
            expireSession();
            return;
        }
        if (responseCode != 200) {
            // Sin móvil se sigue con lo guardado si es de hace poco; un 500 no se disfraza de «sin cobertura».
            if (isNetworkError(responseCode)) {
                showToday(true, responseCode);
                return;
            }
            failure(responseCode);
            return;
        }
        var hoy = DateUtil.todayIso();
        var res = PlanStore.guardar(Json.dict(data), hoy);
        if (res == PlanStore.GUARDADO_LLENO) {
            // Sin sitio: se tira lo más viejo de ESTA app y se reintenta una vez.
            PlanStore.liberar();
            res = PlanStore.guardar(Json.dict(data), hoy);
        }
        if (res == PlanStore.GUARDADO_LLENO) {
            show(AppState.STATE_ERROR, Rez.Strings.TitleStorageFull, Rez.Strings.BodyStorageFull, Rez.Strings.ActionRetry);
            return;
        }
        if (res != PlanStore.GUARDADO_OK) {
            show(AppState.STATE_ERROR, Rez.Strings.TitleError, Rez.Strings.BodyPlanBad, Rez.Strings.ActionRetry);
            return;
        }
        showToday(false, 0);
    }

    // Qué se ofrece hoy con el plan que hay en el reloj.
    function showToday(offline as Lang.Boolean, responseCode as Lang.Number) as Void {
        sinConexion = offline;
        var hoy = DateUtil.todayIso();
        var edad = DateUtil.daysBetween(PlanStore.fechaSync(), hoy);
        if (offline && edad == null) {
            failure(responseCode);      // nunca hubo plan: el error de red, tal cual
            return;
        }
        edadPlanDias = edad == null ? 0 : edad;
        if (offline && edadPlanDias > Config.PLAN_EDAD_MAX_DIAS) {
            state = AppState.STATE_PLAN_VIEJO;
            title = resolve(Rez.Strings.TitlePlanViejo);
            body = resolve(Rez.Strings.BodyPlanViejoA) + edadPlanDias + resolve(Rez.Strings.BodyPlanViejoB);
            note = "";
            action = resolve(Rez.Strings.ActionRetry);
            WatchUi.requestUpdate();
            return;
        }
        filas = PlanStore.deFecha(hoy);
        sel = 0;
        if (filas.size() == 0) {
            show(AppState.STATE_NO_PLAN, Rez.Strings.TitleNoSession, Rez.Strings.BodyNoSession, "");
            return;
        }
        openSession();
    }

    // Decodifica SOLO la sesión elegida y muestra su brief, o dice por qué no se puede empezar.
    function openSession() as Void {
        sesion = null;
        var fila = filas[sel];
        if (!fila[PlanStore.IX_SOPORTADA]) {
            show(AppState.STATE_SIN_SOPORTE, Rez.Strings.TitleSinSoporte, Rez.Strings.BodySinSoporte, "");
            return;
        }
        var b64 = PlanStore.base64De(fila[PlanStore.IX_ID]);
        if (b64 == null) {
            show(AppState.STATE_SIN_DETALLE, Rez.Strings.TitleSinDetalle, Rez.Strings.BodySinDetalle, Rez.Strings.ActionRetry);
            return;
        }
        var s = Decodificador.decodificar(b64);
        if (s == null) {
            // Casi siempre es un plan de otra versión: el texto del decodificador lo dice.
            show(AppState.STATE_ERROR, Rez.Strings.TitlePlanIlegible, Decodificador.error, Rez.Strings.ActionRetry);
            return;
        }
        if (!s.soportada()) {
            show(AppState.STATE_SIN_SOPORTE, Rez.Strings.TitleSinSoporte, Rez.Strings.BodySinSoporte, "");
            return;
        }
        sesion = s;
        showBrief();
    }

    function showBrief() as Void {
        var s = sesion as Sesion;
        state = AppState.STATE_BRIEF;
        title = Formato.duracionLarga(s.duracionEstS);
        body = Estructura.lineaBrief(s);
        note = sinConexion && edadPlanDias > 0 ? resolve(Rez.Strings.BodyPlanViejoA) + edadPlanDias + resolve(Rez.Strings.BodyPlanViejoB) : "";
        action = resolve(Rez.Strings.ActionStart);
        vivo.prepararBrief();
        WatchUi.requestUpdate();
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
        // El brief: empezar la sesión (llega con el motor).
        if (state == AppState.STATE_BRIEF) {
            vivo.empezar();
            return;
        }
        if (state == AppState.STATE_ENVIO) {
            vivo.cerrarEnvio();
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
