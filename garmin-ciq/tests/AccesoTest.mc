//
// El login en el reloj y la renovación de la sesión, sin red: las respuestas del
// servidor se inyectan llamando a los callbacks, y `continuar` (que pide el plan
// por la red) se sustituye por una marca. Corre contra el Storage real del simulador.
//
// NO prueba los teclados (TextPicker / Picker): son del firmware. Sí prueba lo que
// se hace con lo que devuelven.
//
using Toybox.Communications;
using Toybox.Lang;
using Toybox.Test;
using Toybox.Time;

(:test)
module AccesoTest {

    // Un Controller que no llama al plan: anota que se le pidió seguir.
    class ControladorPrueba extends Controller {
        var continuado as Lang.Boolean;

        function initialize() {
            Controller.initialize();
            continuado = false;
        }

        function continuar() as Void {
            continuado = true;
        }
    }

    const EXP_ISO = "2026-10-30T12:34:56.789Z";
    const EXP_EPOCH = 1793363696;

    // Storage limpio del login y un controlador nuevo.
    function nuevo() as ControladorPrueba {
        Store.clearToken();
        Store.borrar(Config.STORE_EMAIL);
        Store.borrarCodigoPedido();
        return new ControladorPrueba();
    }

    function respuestaToken(token as Lang.String) as Lang.Dictionary {
        return { "session_token" => token, "expires_at" => EXP_ISO, "email" => "a@b.co" };
    }
}

(:test)
function emailValidoSoloAceptaLaFormaMinima(logger as Test.Logger) as Lang.Boolean {
    var a = AccesoTest.nuevo().acceso;
    var buenos = ["ana@fahybrid.com", "a.b+c@sub.dominio.es", "x@y.zz"];
    var malos = ["", "ana", "ana@", "@fahybrid.com", "ana@fahybrid", "ana@.com", "ana@com.", "ana@@fahybrid.com", "ana @fahybrid.com", "a@b@c.com"];
    for (var i = 0; i < buenos.size(); i++) {
        if (!a.emailValido(buenos[i])) {
            logger.debug("debería valer: " + buenos[i]);
            return false;
        }
    }
    for (var i = 0; i < malos.size(); i++) {
        if (a.emailValido(malos[i])) {
            logger.debug("no debería valer: " + malos[i]);
            return false;
        }
    }
    var largo = "";
    for (var i = 0; i < Config.EMAIL_MAX_LENGTH; i++) {
        largo += "a";
    }
    return !a.emailValido(largo + "@b.co");
}

(:test)
function cuerposDeLasPeticionesDeLogin(logger as Test.Logger) as Lang.Boolean {
    var pedir = Api.cuerpoPedir("ana@fahybrid.com");
    if (pedir.size() != 1 || !"ana@fahybrid.com".equals(pedir.get("email"))) {
        logger.debug("cuerpo de /email/request mal");
        return false;
    }
    // Los 6 dígitos de las columnas del Picker, con el cero inicial, como TEXTO.
    var code = CodigoDelegate.aTexto([0, 1, 2, 3, 4, 5]);
    var verificar = Api.cuerpoVerificar("ana@fahybrid.com", code);
    if (verificar.size() != 2 || !"ana@fahybrid.com".equals(verificar.get("email")) || !(verificar.get("code") instanceof Lang.String) || !"012345".equals(verificar.get("code"))) {
        logger.debug("cuerpo de /email/verify mal");
        return false;
    }
    if (!CodigoDelegate.aTexto([9, 0, 0, 0, 0, 7]).equals("900007") || CodigoDelegate.aTexto([null, 1]).length() != 2) {
        logger.debug("aTexto no respeta ceros ni huecos");
        return false;
    }
    return true;
}

(:test)
function laPantallaEntrarSegunLoQueSeRecuerda(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    c.acceso.entrar();
    if (c.state != AppState.STATE_ENTRAR || !c.action.equals(c.resolve(Rez.Strings.ActionEscribirEmail)) || !c.note.equals("")) {
        logger.debug("sin email: debe pedir escribirlo");
        return false;
    }
    Store.saveEmail("ana@fahybrid.com");
    c.acceso.entrar();
    if (c.state != AppState.STATE_ENTRAR || !c.action.equals(c.resolve(Rez.Strings.ActionSendCode)) || !c.body.equals("ana@fahybrid.com") || c.note.equals("")) {
        logger.debug("con email recordado: debe enseñarlo y ofrecer pedir código");
        return false;
    }
    // Código pedido hace un minuto: se sigue esperándolo, no se manda otro.
    Store.marcarCodigoPedido();
    c.acceso.entrar();
    if (c.state != AppState.STATE_CODIGO || c.body.find("ana@fahybrid.com") == null) {
        logger.debug("con código reciente: debe ir a escribirlo");
        return false;
    }
    // Uno de hace más de 10 minutos ya no vale.
    Store.escribir(Config.STORE_CODIGO_PEDIDO, Time.now().value() - Config.LOGIN_CODE_TTL_S - 1);
    c.acceso.entrar();
    Store.borrarCodigoPedido();
    return c.state == AppState.STATE_ENTRAR;
}

(:test)
function emailTecleadoSeRecuerdaYUnoMaloSeExplica(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    c.acceso.alEmail("no es un email");
    if (c.state != AppState.STATE_ENTRAR || !c.body.equals(c.resolve(Rez.Strings.ErrBadEmail)) || !Store.email().equals("")) {
        logger.debug("un email malo no se explica o se guardó");
        return false;
    }
    // Cancelar el teclado no pierde nada: vuelve a Entrar.
    c.acceso.alCancelarEmail();
    if (c.state != AppState.STATE_ENTRAR) {
        logger.debug("cancelar el teclado debe volver a Entrar");
        return false;
    }
    return true;
}

(:test)
function respuestasDePedirCodigo(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    c.acceso.email = "ana@fahybrid.com";
    c.acceso.onCodigoPedido(200, { "ok" => true });
    if (c.state != AppState.STATE_CODIGO || Store.codigoPedido() == 0) {
        logger.debug("200: debe esperar el código y recordar cuándo se pidió");
        return false;
    }
    c.acceso.onCodigoPedido(400, null);
    if (c.state != AppState.STATE_ENTRAR || !c.body.equals(c.resolve(Rez.Strings.ErrBadEmail))) {
        logger.debug("400: email mal formado");
        return false;
    }
    c.acceso.onCodigoPedido(429, null);
    if (c.state != AppState.STATE_ENTRAR || !c.body.equals(c.resolve(Rez.Strings.ErrTooMany))) {
        logger.debug("429: demasiadas peticiones");
        return false;
    }
    c.acceso.onCodigoPedido(Communications.BLE_CONNECTION_UNAVAILABLE, null);
    if (c.state != AppState.STATE_ENTRAR || !c.body.equals(c.resolve(Rez.Strings.BodyNoConnection)) || c.action.equals("")) {
        logger.debug("sin móvil: debe decirlo y dejar reintentar");
        return false;
    }
    c.acceso.onCodigoPedido(500, null);
    Store.borrarCodigoPedido();
    return c.state == AppState.STATE_ENTRAR && c.body.find("500") != null && !c.action.equals("");
}

(:test)
function respuestasDeVerificarElCodigo(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    c.acceso.email = "ana@fahybrid.com";
    c.acceso.onVerificado(400, null);
    if (c.state != AppState.STATE_CODIGO || !c.body.equals(c.resolve(Rez.Strings.ErrBadCode)) || Store.hasToken()) {
        logger.debug("400: código malo o caducado, sin token");
        return false;
    }
    c.acceso.onVerificado(429, null);
    if (c.state != AppState.STATE_ENTRAR || !c.body.equals(c.resolve(Rez.Strings.ErrTooMany)) || Store.hasToken()) {
        logger.debug("429: demasiados intentos");
        return false;
    }
    c.acceso.onVerificado(200, { "session_token" => "" });
    if (c.state != AppState.STATE_CODIGO || Store.hasToken() || c.continuado) {
        logger.debug("200 sin token no entra");
        return false;
    }
    Store.marcarCodigoPedido();
    c.acceso.onVerificado(200, AccesoTest.respuestaToken("tok-1"));
    if (!Store.token().equals("tok-1") || Store.numero(Config.STORE_TOKEN_EXP) != AccesoTest.EXP_EPOCH || Store.codigoPedido() != 0 || !c.continuado) {
        logger.debug("200: debe guardar el token y su caducidad, olvidar el código y seguir al plan");
        return false;
    }
    if (Store.renovacionPendiente()) {
        logger.debug("recién entrado no toca renovar");
        return false;
    }
    return true;
}

(:test)
function laSesionSeRenuevaYUn401VuelveAlLogin(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    Store.saveEmail("ana@fahybrid.com");
    c.acceso.email = "ana@fahybrid.com";
    // Sesión de antes de existir la renovación (sin fecha): toca renovar.
    Store.writeStorage(Config.STORE_TOKEN, "viejo");
    if (!Store.renovacionPendiente()) {
        logger.debug("sin fecha de renovación debe tocar");
        return false;
    }
    c.acceso.onRenovada(200, AccesoTest.respuestaToken("nuevo"));
    if (!Store.token().equals("nuevo") || Store.numero(Config.STORE_TOKEN_EXP) != AccesoTest.EXP_EPOCH || Store.renovacionPendiente() || !c.continuado) {
        logger.debug("200: token nuevo, caducidad guardada, fecha de renovación y seguir");
        return false;
    }
    // Sin móvil o el servidor caído: se sigue con el token que hay.
    c.continuado = false;
    c.acceso.onRenovada(Communications.BLE_CONNECTION_UNAVAILABLE, null);
    if (!Store.token().equals("nuevo") || !c.continuado) {
        logger.debug("sin conexión: debe seguir con el token viejo");
        return false;
    }
    c.continuado = false;
    c.acceso.onRenovada(500, null);
    if (!Store.token().equals("nuevo") || !c.continuado) {
        logger.debug("500: debe seguir con el token viejo");
        return false;
    }
    // 401: el token no vale; se borra pero el email se queda.
    c.continuado = false;
    c.acceso.onRenovada(401, null);
    if (Store.hasToken() || c.continuado || c.state != AppState.STATE_ENTRAR || !Store.email().equals("ana@fahybrid.com") || !c.title.equals(c.resolve(Rez.Strings.TitleExpired)) || !c.body.equals(c.resolve(Rez.Strings.BodyExpired))) {
        logger.debug("401: debe borrar el token, conservar el email y volver a Entrar");
        return false;
    }
    if (Store.numero(Config.STORE_TOKEN_EXP) != 0 || Store.numero(Config.STORE_TOKEN_RENOVADO) != 0) {
        logger.debug("401: la caducidad y la fecha de renovación deben borrarse");
        return false;
    }
    return true;
}

(:test)
function unaCaducidadYaPasadaVaAlLoginSinPeticion(logger as Test.Logger) as Lang.Boolean {
    var c = AccesoTest.nuevo();
    Store.saveToken("muerto", Time.now().value() - 60);
    if (!Store.tokenCaducado()) {
        logger.debug("caducidad pasada no detectada");
        return false;
    }
    c.acceso.renovar();
    if (Store.hasToken() || c.continuado || c.state != AppState.STATE_ENTRAR) {
        logger.debug("con la caducidad pasada debe ir al login sin pedir nada");
        return false;
    }
    // Vigente y renovada hoy: renovar() no hace nada más que seguir.
    Store.saveToken("vivo", Time.now().value() + 86400);
    c.acceso.renovar();
    return Store.token().equals("vivo") && c.continuado && !Store.tokenCaducado() && !Store.renovacionPendiente();
}

(:test)
function isoUtcDelServidorAEpoch(logger as Test.Logger) as Lang.Boolean {
    if (DateUtil.isoUtcToEpoch(AccesoTest.EXP_ISO) != AccesoTest.EXP_EPOCH) {
        logger.debug("2026-10-30T12:34:56Z debe ser " + AccesoTest.EXP_EPOCH);
        return false;
    }
    return DateUtil.isoUtcToEpoch("") == null && DateUtil.isoUtcToEpoch("no es una fecha ni de coña") == null;
}
