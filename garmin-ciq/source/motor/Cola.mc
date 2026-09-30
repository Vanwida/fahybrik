//
// LA COLA DE ENVÍO — escribir primero, enviar después (G8).
//
// Un resultado se guarda en Storage ANTES de intentar enviarlo y se queda ahí, sin
// caducidad, hasta que el servidor lo acusa (2xx). Un fallo de red, un 401 o un
// servidor que no contesta lo dejan donde está; cada arranque de la app lo reintenta.
// Cada resultado ocupa su propia clave (una clave admite 8 KB) y un índice los ordena.
//
// Estados que se le dicen al atleta (G31): guardado en el reloj / enviado / sesión
// caducada / el servidor no contesta. Nunca «enviado» sin acuse.
//
using Toybox.Communications;
using Toybox.Lang;
using Toybox.WatchUi;

module Cola {

    enum {
        ESTADO_GUARDADO,      // en la cola, aún sin intentar (o sin móvil)
        ESTADO_ENVIANDO,
        ESTADO_ENVIADO,
        ESTADO_CADUCADA,      // 401: el token ya no vale
        ESTADO_SERVIDOR,      // el servidor no contesta o no lo acepta: se reintenta
        ESTADO_SIN_SITIO      // Storage lleno: el resultado NO quedó guardado
    }

    const PREFIJO = "cola_";
    const CODIGO_OK_DESDE = 200;
    const CODIGO_OK_HASTA = 299;
    const CODIGO_NO_AUTORIZADO = 401;

    var estado as Lang.Number = ESTADO_GUARDADO;
    var enVuelo as Lang.Number = 0;      // el id que se está enviando (0 = nada)

    function claveDe(id as Lang.Number) as Lang.String {
        return PREFIJO + id;
    }

    function ids() as Lang.Array<Lang.Number> {
        var ix = Store.leer(Config.STORE_COLA);
        return ix instanceof Lang.Array ? ix : [] as Lang.Array<Lang.Number>;
    }

    function pendientes() as Lang.Number {
        return ids().size();
    }

    // Guarda un resultado. El id es su `started_at`: único por sesión y estable entre reintentos.
    // false = no cupo (Storage lleno): se dice, no se traga.
    function encolar(it as Lang.Dictionary) as Lang.Boolean {
        var id = Json.num(it, "i", 0);
        if (!Store.escribir(claveDe(id), it)) {
            estado = ESTADO_SIN_SITIO;
            return false;
        }
        var lista = ids();
        if (lista.indexOf(id) < 0) {
            lista.add(id);
        }
        estado = ESTADO_GUARDADO;
        return Store.escribir(Config.STORE_COLA, lista);
    }

    function leerItem(id as Lang.Number) as Lang.Dictionary or Null {
        var it = Store.leer(claveDe(id));
        return it instanceof Lang.Dictionary ? it : null;
    }

    // El atleta eligió su RPE (o lo omitió): se anota en el resultado ya guardado y queda listo.
    function fijarRpe(id as Lang.Number, rpe as Lang.Number or Null) as Void {
        var it = leerItem(id);
        if (it == null) {
            return;
        }
        it.put("r", rpe == null ? Resultado.SIN_RPE : rpe);
        it.put("l", 1);
        Store.escribir(claveDe(id), it);
    }

    // Quita un resultado acusado.
    function quitar(id as Lang.Number) as Void {
        Store.borrar(claveDe(id));
        var lista = ids();
        var i = lista.indexOf(id);
        if (i >= 0) {
            lista.remove(id);
            Store.escribir(Config.STORE_COLA, lista);
        }
    }

    // Manda el primer resultado de la cola (los siguientes, uno tras otro al acusarse).
    // `salvo` = un id que aún espera su RPE y no debe irse todavía (0 = ninguno).
    function drenar(token as Lang.String, salvo as Lang.Number) as Void {
        if (enVuelo != 0 || token.equals("")) {
            return;
        }
        var lista = ids();
        for (var i = 0; i < lista.size(); i++) {
            if (lista[i] == salvo) {
                continue;
            }
            var it = leerItem(lista[i]);
            if (it == null) {
                quitar(lista[i]);
                drenar(token, salvo);
                return;
            }
            enVuelo = lista[i];
            estado = ESTADO_ENVIANDO;
            Api.enviarResultado(token, Resultado.cuerpo(it), new Alcance(salvo).metodo());
            return;
        }
        if (lista.size() == 0) {
            estado = ESTADO_ENVIADO;
        }
    }

    // El acuse del servidor. Solo un 2xx saca el resultado de la cola.
    function alResponder(codigo as Lang.Number, data as Lang.Object or Null, salvo as Lang.Number) as Void {
        var id = enVuelo;
        enVuelo = 0;
        if (codigo >= CODIGO_OK_DESDE && codigo <= CODIGO_OK_HASTA) {
            quitar(id);
            estado = ESTADO_ENVIADO;
            drenar(Store.token(), salvo);
        } else if (codigo == CODIGO_NO_AUTORIZADO) {
            estado = ESTADO_CADUCADA;
        } else {
            estado = ESTADO_SERVIDOR;
        }
        WatchUi.requestUpdate();
    }

    // Un método al que Communications pueda llamar de vuelta llevando el `salvo`.
    class Alcance {
        var salvo as Lang.Number;

        function initialize(s as Lang.Number) {
            salvo = s;
        }

        function metodo() as Lang.Method {
            return method(:responder);
        }

        function responder(codigo as Lang.Number, data as Lang.Object or Null) as Void {
            Cola.alResponder(codigo, data, salvo);
        }
    }
}
