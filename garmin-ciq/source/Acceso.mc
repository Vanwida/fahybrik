//
// Entrar y mantener la sesión, TODO en el propio reloj.
//
// Una app copiada por USB (sideload) no aparece en Garmin Connect Mobile, así que
// no tiene pantalla de ajustes: el email y el código se teclean aquí.
//
//   «Entrar» → email (TextPicker) → «Pedir código» → 6 dígitos (Picker) → token
//
// El email se recuerda (Storage) para no volver a teclearlo. Al abrir con móvil,
// una sesión viva se renueva (a lo sumo una vez al día); un 401 vuelve al login.
//
using Toybox.Communications;
using Toybox.Lang;
using Toybox.Time;
using Toybox.WatchUi;

class Acceso {

    var c as Controller;

    // El email con el que se está entrando (el recordado, o el recién tecleado).
    var email as Lang.String;

    function initialize(ctrl as Controller) {
        c = ctrl;
        email = Store.email();
    }

    // ── Pantallas ────────────────────────────────────────────────────────────

    // Punto de entrada sin token. Si hace poco que se pidió un código para este
    // email, se sigue esperándolo: pedir otro invalidaría el primero justo cuando
    // el atleta lo está buscando en el correo.
    function entrar() as Void {
        email = Store.email();
        if (!email.equals("") && codigoVigente()) {
            mostrarCodigo(null);
            return;
        }
        mostrarEntrar(null);
    }

    function codigoVigente() as Lang.Boolean {
        var pedido = Store.codigoPedido();
        return pedido > 0 && Time.now().value() - pedido < Config.LOGIN_CODE_TTL_S;
    }

    // `mensaje`: un id de recurso (un fallo que explicar) o null.
    function mostrarEntrar(mensaje) as Void {
        var conEmail = !email.equals("");
        var cuerpo = mensaje != null ? mensaje : (conEmail ? email : Rez.Strings.BodyEntrarSinEmail);
        c.show(AppState.STATE_ENTRAR, Rez.Strings.TitleEntrar, cuerpo, conEmail ? Rez.Strings.ActionSendCode : Rez.Strings.ActionEscribirEmail);
        c.note = conEmail ? c.resolve(Rez.Strings.NoteOtroEmail) : "";
    }

    function mostrarCodigo(mensaje) as Void {
        var cuerpo = mensaje != null ? c.resolve(mensaje) : c.resolve(Rez.Strings.BodyCodeSentA) + email + c.resolve(Rez.Strings.BodyCodeSentB);
        c.show(AppState.STATE_CODIGO, Rez.Strings.TitleCode, cuerpo, Rez.Strings.ActionEscribirCodigo);
        c.note = c.resolve(Rez.Strings.NoteOtroCodigo);
    }

    // ── Teclas ───────────────────────────────────────────────────────────────

    function enPantalla() as Lang.Boolean {
        return c.state == AppState.STATE_ENTRAR || c.state == AppState.STATE_CODIGO;
    }

    // START / toque.
    function alSelect() as Void {
        if (c.state == AppState.STATE_CODIGO) {
            pedirDigitos();
            return;
        }
        if (email.equals("")) {
            pedirEmail();
            return;
        }
        pedirCodigo();
    }

    // UP / DOWN: cambiar de email (desde «Entrar»), o pedir otro código (desde «Código»).
    function alCambiar() as Lang.Boolean {
        if (!enPantalla()) {
            return false;
        }
        if (c.state == AppState.STATE_CODIGO) {
            pedirCodigo();
        } else if (!email.equals("")) {
            pedirEmail();
        }
        return true;
    }

    // ── Email ────────────────────────────────────────────────────────────────

    function pedirEmail() as Void {
        if (!(WatchUi has :TextPicker)) {
            // Todos los relojes del manifest lo traen; si algún firmware no, se dice.
            mostrarEntrar(Rez.Strings.ErrSinTeclado);
            return;
        }
        WatchUi.pushView(new WatchUi.TextPicker(email), new EmailDelegate(self), WatchUi.SLIDE_UP);
    }

    function alEmail(texto as Lang.String) as Void {
        var limpio = Store.trim(texto).toLower();
        if (!emailValido(limpio)) {
            mostrarEntrar(Rez.Strings.ErrBadEmail);
            return;
        }
        if (!limpio.equals(email)) {
            Store.borrarCodigoPedido();     // un código pedido a otro email no sirve
        }
        email = limpio;
        Store.saveEmail(limpio);
        pedirCodigo();
    }

    function alCancelarEmail() as Void {
        mostrarEntrar(null);
    }

    // Forma mínima de un email: algo@algo.algo, sin espacios. El servidor es el que manda.
    function emailValido(texto as Lang.String) as Lang.Boolean {
        if (texto.length() == 0 || texto.length() > Config.EMAIL_MAX_LENGTH) {
            return false;
        }
        var at = texto.find("@");
        if (at == null || at < 1 || texto.find(" ") != null) {
            return false;
        }
        var dominio = texto.substring(at + 1, texto.length());
        if (dominio == null || dominio.find("@") != null) {
            return false;
        }
        var punto = dominio.find(".");
        return punto != null && punto > 0 && punto < dominio.length() - 1;
    }

    // ── Pedir el código ──────────────────────────────────────────────────────

    function pedirCodigo() as Void {
        c.busy(Rez.Strings.BusySendingCode);
        Api.requestLoginCode(email, method(:onCodigoPedido));
    }

    function onCodigoPedido(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        if (responseCode == 200) {
            // 200 { ok } exista el atleta o no: no prueba que el email sea de la casa, solo que se cursó.
            Store.marcarCodigoPedido();
            mostrarCodigo(null);
            return;
        }
        if (responseCode == 400) {
            mostrarEntrar(Rez.Strings.ErrBadEmail);
            return;
        }
        fallo(responseCode);
    }

    // ── Escribir el código ───────────────────────────────────────────────────

    function pedirDigitos() as Void {
        WatchUi.pushView(new CodigoPicker(), new CodigoDelegate(self), WatchUi.SLIDE_UP);
    }

    // Los 6 dígitos tecleados. Se manda como texto (el cero inicial cuenta).
    function alCodigo(code as Lang.String) as Void {
        c.busy(Rez.Strings.BusyVerifying);
        Api.verifyLoginCode(email, code, method(:onVerificado));
    }

    function onVerificado(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        if (responseCode == 400) {
            // Código malo o caducado: se puede reescribir (quizá fue un dedo) o pedir otro.
            mostrarCodigo(Rez.Strings.ErrBadCode);
            return;
        }
        if (responseCode == 429) {
            Store.borrarCodigoPedido();
            mostrarEntrar(Rez.Strings.ErrTooMany);
            return;
        }
        if (responseCode != 200) {
            fallo(responseCode);
            return;
        }
        // `session_token` va en el NIVEL SUPERIOR (jsonOk no envuelve en { data }).
        var cuerpo = Json.dict(data);
        var token = Json.str(cuerpo, "session_token");
        if (token.equals("")) {
            mostrarCodigo(Rez.Strings.ErrBadCode);
            return;
        }
        Store.saveToken(token, caducidad(cuerpo));
        Store.borrarCodigoPedido();
        c.continuar();
    }

    // Un fallo de red o del servidor sin más: se dice y se puede reintentar sin perder el email.
    function fallo(responseCode as Lang.Number) as Void {
        if (responseCode == 429) {
            mostrarEntrar(Rez.Strings.ErrTooMany);
            return;
        }
        if (c.isNetworkError(responseCode)) {
            mostrarEntrar(Rez.Strings.BodyNoConnection);
            return;
        }
        c.show(AppState.STATE_ENTRAR, Rez.Strings.TitleError, c.resolve(Rez.Strings.BodyErrorCode) + " " + responseCode.toString(), !email.equals("") ? Rez.Strings.ActionRetry : Rez.Strings.ActionEscribirEmail);
    }

    // ── Sesión viva: renovar ─────────────────────────────────────────────────

    // Con token, al abrir con móvil. La caducidad conocida que ya pasó ahorra la petición.
    function renovar() as Void {
        if (Store.tokenCaducado()) {
            c.expireSession();
            return;
        }
        if (!Store.renovacionPendiente()) {
            c.continuar();
            return;
        }
        c.busy(Rez.Strings.BusySyncing);
        Api.refreshSession(Store.token(), method(:onRenovada));
    }

    function onRenovada(responseCode as Lang.Number, data as Lang.Object or Null) as Void {
        if (responseCode == 401) {
            c.expireSession();
            return;
        }
        if (responseCode == 200) {
            var cuerpo = Json.dict(data);
            var token = Json.str(cuerpo, "session_token");
            if (!token.equals("")) {
                Store.saveToken(token, caducidad(cuerpo));
            }
        }
        // Sin móvil o el servidor con un mal día: se sigue con el token que hay. Si de
        // verdad está muerto, lo dirá el plan con un 401 y se vuelve al login.
        c.continuar();
    }

    // `expires_at` (ISO UTC) del servidor en epoch; 0 si no vino o no se entiende.
    function caducidad(cuerpo as Lang.Dictionary) as Lang.Number {
        var epoch = DateUtil.isoUtcToEpoch(Json.str(cuerpo, "expires_at"));
        return epoch == null ? 0 : epoch;
    }
}
