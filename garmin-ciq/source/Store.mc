//
// Acceso al almacén del reloj (Application.Storage): solo en el reloj, invisible
// y no editable. Aquí va el token de sesión, el último email, el plan de los
// próximos días, el checkpoint de la sesión en curso y la cola de resultados por
// enviar. No hay ajustes de Garmin Connect: una app copiada por USB no los tiene.
//
using Toybox.Application;
using Toybox.Lang;
using Toybox.Time;

module Store {

    function readStorage(key as Lang.String) as Lang.String {
        var value = null;
        try {
            value = Application.Storage.getValue(key);
        } catch (ex) {
            value = null;
        }
        if (value == null) {
            return "";
        }
        return value.toString();
    }

    function writeStorage(key as Lang.String, value as Lang.String) as Void {
        try {
            Application.Storage.setValue(key, value);
        } catch (ex) {
            // Sin espacio o almacén no disponible: no es fatal. Como mucho el
            // atleta vuelve a entrar o se re-descarga el entreno.
        }
    }

    // Cualquier valor de Storage tal cual (número, texto, lista, diccionario), o null.
    function leer(key as Lang.String) as Lang.Object or Null {
        try {
            return Application.Storage.getValue(key);
        } catch (ex) {
            return null;
        }
    }

    // Guarda un valor. false = sin sitio (StorageFullException) u otro fallo: se dice, no se traga.
    function escribir(key as Lang.String, value) as Lang.Boolean {
        try {
            Application.Storage.setValue(key, value);
            return true;
        } catch (ex) {
            return false;
        }
    }

    function borrar(key as Lang.String) as Void {
        try {
            Application.Storage.deleteValue(key);
        } catch (ex) {
            // Ya no estaba: da igual.
        }
    }

    function token() as Lang.String {
        return readStorage(Config.STORE_TOKEN);
    }

    function hasToken() as Lang.Boolean {
        return !token().equals("");
    }

    // Número de Storage (epoch en segundos), 0 si no hay.
    function numero(key as Lang.String) as Lang.Number {
        var v = leer(key);
        return v instanceof Lang.Number ? v : 0;
    }

    // Guarda el token con su caducidad (epoch; 0 = el servidor no la dijo) y marca
    // que se acaba de renovar.
    function saveToken(value as Lang.String, expEpoch as Lang.Number) as Void {
        writeStorage(Config.STORE_TOKEN, value);
        escribir(Config.STORE_TOKEN_RENOVADO, Time.now().value());
        if (expEpoch > 0) {
            escribir(Config.STORE_TOKEN_EXP, expEpoch);
        } else {
            borrar(Config.STORE_TOKEN_EXP);
        }
    }

    // El servidor ha dicho 401 (o la caducidad ya pasó): el token no vale. Se
    // borra para que la app pida login otra vez en vez de reintentar en bucle.
    // El email recordado se queda: es justo lo que ahorra teclear.
    function clearToken() as Void {
        borrar(Config.STORE_TOKEN);
        borrar(Config.STORE_TOKEN_EXP);
        borrar(Config.STORE_TOKEN_RENOVADO);
    }

    // ¿Toca renovar? Nunca renovado (o sesión de antes de existir la renovación) o hace más de un día.
    function renovacionPendiente() as Lang.Boolean {
        return Time.now().value() - numero(Config.STORE_TOKEN_RENOVADO) >= Config.RENOVAR_CADA_S;
    }

    // ¿La caducidad que dijo el servidor ya pasó? Sin caducidad conocida, no se sabe: false.
    function tokenCaducado() as Lang.Boolean {
        var exp = numero(Config.STORE_TOKEN_EXP);
        return exp > 0 && Time.now().value() >= exp;
    }

    // ── Login: lo que se recuerda entre aperturas ────────────────────────────

    function email() as Lang.String {
        return readStorage(Config.STORE_EMAIL);
    }

    function saveEmail(value as Lang.String) as Void {
        writeStorage(Config.STORE_EMAIL, value);
    }

    // Segundos desde 1970 en que se pidió el código; 0 = ninguno.
    function codigoPedido() as Lang.Number {
        return numero(Config.STORE_CODIGO_PEDIDO);
    }

    function marcarCodigoPedido() as Void {
        escribir(Config.STORE_CODIGO_PEDIDO, Time.now().value());
    }

    function borrarCodigoPedido() as Void {
        borrar(Config.STORE_CODIGO_PEDIDO);
    }

    // ── Utilidad ─────────────────────────────────────────────────────────────

    // Monkey C no trae trim() en String. Un espacio de más al final del email
    // rompería el login sin que se vea.
    function trim(raw as Lang.String) as Lang.String {
        var chars = raw.toCharArray();
        var start = 0;
        var end = chars.size();
        while (start < end && isBlank(chars[start])) {
            start++;
        }
        while (end > start && isBlank(chars[end - 1])) {
            end--;
        }
        if (start == 0 && end == chars.size()) {
            return raw;
        }
        var out = "";
        for (var i = start; i < end; i++) {
            out += chars[i].toString();
        }
        return out;
    }

    function isBlank(c as Lang.Char) as Lang.Boolean {
        return c == ' ' || c == '\t' || c == '\n' || c == '\r';
    }
}
