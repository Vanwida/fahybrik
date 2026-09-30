//
// La máquina de estados. Único sitio donde se decide qué ve el atleta.
//
//   login en el reloj (Acceso)  →  token de sesión
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

    // El login y la renovación de la sesión.
    var acceso as Acceso;

    function initialize() {
        state = AppState.STATE_BUSY;
        title = "";
        body = "";
        note = "";
        action = "";
        acceso = new Acceso(self);
        filas = [];
        sel = 0;
        sesion = null;
        sinConexion = false;
        edadPlanDias = 0;
        vivo = new Vivo(self);
        recuperacion = null;
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
        if (state == AppState.STATE_RECUPERAR && recuperacion != null) {
            guardarInterrumpida();
            return true;
        }
        return vivo.alBack() ? true : false;
    }

    function onUp() as Lang.Boolean {
        if (vivo.alUp() || acceso.alCambiar()) {
            return true;
        }
        return cambiarSesion(-1);
    }

    function onDown() as Lang.Boolean {
        if (vivo.alDown() || acceso.alCambiar()) {
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

    // Se llama al arrancar y al reintentar. Sin token: login en el reloj. Con token:
    // se renueva la sesión si toca y se sigue con `continuar`.
    // Una sesión interrumpida (checkpoint en Storage): se ofrece seguir o guardar lo hecho.
    var recuperacion as Lang.Dictionary or Null;

    function refresh() as Void {
        if (vivo.enSesion() || state == AppState.STATE_RECUPERAR) {
            return;
        }
        if (!Store.hasToken()) {
            acceso.entrar();
            return;
        }
        acceso.renovar();
    }

    // Con la sesión en regla: lo que quedó sin enviar, la sesión interrumpida y el plan.
    function continuar() as Void {
        // Lo que quedó sin enviar de otras veces se reintenta en cada arranque (sin caducidad).
        Cola.drenar(Store.token(), 0);
        if (offerRecovery()) {
            return;
        }
        syncPlan();
    }

    function offerRecovery() as Lang.Boolean {
        var chk = Store.leer(Config.STORE_CHECKPOINT);
        if (!(chk instanceof Lang.Dictionary) || Json.num(chk, "id", 0) == 0) {
            return false;
        }
        recuperacion = chk;
        state = AppState.STATE_RECUPERAR;
        title = resolve(Rez.Strings.TitleRecuperar);
        body = resolve(Rez.Strings.BodyRecuperarA) + (Json.num(chk, "sesS", 0) / 60) + resolve(Rez.Strings.BodyRecuperarB);
        note = resolve(Rez.Strings.NoteRecuperar);
        action = resolve(Rez.Strings.ActionSeguir);
        WatchUi.requestUpdate();
        return true;
    }

    // BACK en «sesión interrumpida»: lo hecho hasta el checkpoint se guarda como parcial y sube.
    function guardarInterrumpida() as Void {
        var chk = recuperacion as Lang.Dictionary;
        var id = Json.num(chk, "id", 0);
        var b64 = PlanStore.base64De(id);
        var s = b64 == null ? null : Decodificador.decodificar(b64);
        var t = chk.get("tramos");
        var inicio = Json.num(chk, "inicio", 0);
        var it = Resultado.item(s, id, Json.num(chk, "huella", 0), inicio, Json.num(chk, "sesS", 0), false, t instanceof Lang.Array ? t : [] as Lang.Array<Lang.Number>);
        Cola.encolar(it);
        Cola.fijarRpe(inicio, null);
        Store.borrar(Config.STORE_CHECKPOINT);
        recuperacion = null;
        Cola.drenar(Store.token(), 0);
        state = AppState.STATE_ENVIO;
        WatchUi.requestUpdate();
    }

    // START en «sesión interrumpida»: seguir con una grabación nueva de la misma sesión.
    function seguirInterrumpida() as Void {
        var chk = recuperacion as Lang.Dictionary;
        var b64 = PlanStore.base64De(Json.num(chk, "id", 0));
        var s = b64 == null ? null : Decodificador.decodificar(b64);
        if (s == null || s.huella != Json.num(chk, "huella", 0)) {
            // El plan cambió o ya no está: no se puede seguir con el mismo plan (G9). Solo queda guardar lo hecho.
            show(AppState.STATE_RECUPERAR, Rez.Strings.TitleSinDetalle, Rez.Strings.BodyRecuperarSinPlan, "");
            return;
        }
        vivo.seguir(chk, s);
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
        if (acceso.enPantalla()) {
            acceso.alSelect();
            return;
        }
        // El brief: empezar la sesión (llega con el motor).
        if (state == AppState.STATE_BRIEF) {
            vivo.empezar();
            return;
        }
        if (state == AppState.STATE_RECUPERAR) {
            if (recuperacion != null && !action.equals("")) {
                seguirInterrumpida();
            }
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

    // 401 = el token ya no vale (caducado o revocado). Se borra:
    // reintentar con él solo daría 401 en bucle.
    function expireSession() as Void {
        Store.clearToken();
        acceso.email = Store.email();
        acceso.mostrarEntrar(Rez.Strings.BodyExpired);
        title = resolve(Rez.Strings.TitleExpired);
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
