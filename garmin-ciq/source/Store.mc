//
// Acceso a los dos almacenes del reloj. La diferencia NO es cosmética:
//
//   · Application.Properties  → lo que el atleta edita desde Garmin Connect
//     Mobile. Viaja al móvil y se ve en pantalla. Aquí SOLO van email y código.
//   · Application.Storage     → solo en el reloj, invisible y no editable. Aquí
//     va el token de sesión (30 días de vida) y el rastro del último entreno
//     descargado.
//
// Guardar el token en Properties sería enseñar la credencial en una pantalla de
// ajustes del móvil: no se hace.
//
using Toybox.Application;
using Toybox.Lang;

module Store {

    // ── Properties (editables por el atleta) ─────────────────────────────────

    // getValue lanza si la propiedad no está declarada o el almacén aún no está
    // listo; devolvemos "" en vez de propagar, porque para la UI "no hay email"
    // y "no se pudo leer el email" son el mismo estado.
    function readProperty(key as Lang.String) as Lang.String {
        var value = null;
        try {
            value = Application.Properties.getValue(key);
        } catch (ex) {
            value = null;
        }
        if (value == null) {
            return "";
        }
        return trim(value.toString());
    }

    function writeProperty(key as Lang.String, value as Lang.String) as Lang.Boolean {
        try {
            Application.Properties.setValue(key, value);
            return true;
        } catch (ex) {
            return false;
        }
    }

    function email() as Lang.String {
        return readProperty(Config.PROP_EMAIL).toLower();
    }

    function loginCode() as Lang.String {
        return readProperty(Config.PROP_LOGIN_CODE);
    }

    // Se llama en cuanto el código se canjea (bien o mal): un código de un solo
    // uso no se queda escrito en los ajustes del móvil.
    function clearLoginCode() as Lang.Boolean {
        return writeProperty(Config.PROP_LOGIN_CODE, "");
    }

    // ── Storage (privado del reloj) ──────────────────────────────────────────

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

    function token() as Lang.String {
        return readStorage(Config.STORE_TOKEN);
    }

    function hasToken() as Lang.Boolean {
        return !token().equals("");
    }

    function saveToken(value as Lang.String, forEmail as Lang.String) as Void {
        writeStorage(Config.STORE_TOKEN, value);
        writeStorage(Config.STORE_TOKEN_EMAIL, forEmail);
    }

    // El servidor ha dicho 401: el token ya no vale. Se borra para que la app
    // pida login otra vez en vez de reintentar en bucle contra un 401.
    function clearToken() as Void {
        writeStorage(Config.STORE_TOKEN, "");
        writeStorage(Config.STORE_TOKEN_EMAIL, "");
    }

    // ¿El token que tenemos es del email que hay AHORA en los ajustes? Si el
    // atleta cambia de email, el token viejo sigue vivo 30 días y le enseñaría el
    // entreno de otra persona. Se comprueba en cada arranque.
    function tokenMatchesEmail() as Lang.Boolean {
        return readStorage(Config.STORE_TOKEN_EMAIL).equals(email());
    }

    // ── Rastro del último entreno entregado ──────────────────────────────────
    //
    // La app NO puede leer el contenido del .FIT que descargó: de un entreno
    // persistido solo tenemos getName() y getId(). El emparejamiento es por
    // NOMBRE, así que guardamos el nombre exacto que pedimos y para qué día era.
    // Ref: https://developer.garmin.com/connect-iq/api-docs/Toybox/PersistedContent.html

    function lastWorkoutName() as Lang.String {
        return readStorage(Config.STORE_WORKOUT_NAME);
    }

    function lastWorkoutDate() as Lang.String {
        return readStorage(Config.STORE_WORKOUT_DATE);
    }

    function rememberWorkout(name as Lang.String, isoDate as Lang.String) as Void {
        writeStorage(Config.STORE_WORKOUT_NAME, name);
        writeStorage(Config.STORE_WORKOUT_DATE, isoDate);
    }

    // ── Utilidad ─────────────────────────────────────────────────────────────

    // Monkey C no trae trim() en String. Los ajustes se teclean en el móvil y un
    // espacio de más al final del email rompería el login sin que se vea.
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
