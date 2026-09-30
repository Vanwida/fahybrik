//
// El plan de los próximos días, guardado en el reloj (Application.Storage).
//
// Una clave por sesión (`plan_<id>`, el base64 tal cual, ≤ 8 KB: el tope de una
// clave) y un ÍNDICE con lo justo para decidir qué se ofrece sin decodificar
// nada. Solo se decodifica la sesión que se va a hacer. Escribir primero, borrar
// después: si el reloj se queda sin sitio a mitad, el plan anterior sigue entero.
//
// La respuesta del servidor (docs/garmin-reloj/servidor.md):
//   { v: 2, sesiones: [ { asignacion_id, fecha, huella, soportada, motivo?, plan } ] }
//
using Toybox.Application;
using Toybox.Lang;

module PlanStore {

    // Campos de una fila del índice.
    enum {
        IX_ID,
        IX_FECHA,
        IX_HUELLA,
        IX_SOPORTADA,
        IX_MOTIVO
    }

    // Resultado de guardar.
    enum {
        GUARDADO_OK,
        GUARDADO_LLENO,
        GUARDADO_RESPUESTA_MALA
    }

    const FECHA_LARGO = 10;   // YYYY-MM-DD

    function clave(id as Lang.Number) as Lang.String {
        return Config.STORE_PLAN_PREFIJO + id;
    }

    // El índice guardado (vacío si no hay).
    function indice() as Lang.Array {
        var ix = Store.leer(Config.STORE_PLAN_INDICE);
        return ix instanceof Lang.Array ? ix : [];
    }

    // Las filas del índice de una fecha (hoy).
    function deFecha(iso as Lang.String) as Lang.Array {
        var out = [];
        var ix = indice();
        for (var i = 0; i < ix.size(); i++) {
            if ((ix[i][IX_FECHA] as Lang.String).equals(iso)) {
                out.add(ix[i]);
            }
        }
        return out;
    }

    function base64De(id as Lang.Number) as Lang.String or Null {
        var v = Store.leer(clave(id));
        return v instanceof Lang.String ? v : null;
    }

    // Cuándo se sincronizó por última vez (fecha ISO local), o vacío.
    function fechaSync() as Lang.String {
        return Store.readStorage(Config.STORE_PLAN_SYNC);
    }

    // Guarda la respuesta del servidor. Devuelve un GUARDADO_*.
    function guardar(data as Lang.Dictionary, hoy as Lang.String) as Lang.Number {
        if (Json.num(data, "v", 0) != Cod.VERSION_ESQUEMA) {
            return GUARDADO_RESPUESTA_MALA;
        }
        var lista = data.get("sesiones");
        if (!(lista instanceof Lang.Array)) {
            return GUARDADO_RESPUESTA_MALA;
        }
        var viejo = indice();
        var nuevo = [];
        for (var i = 0; i < lista.size(); i++) {
            var s = Json.dict(lista[i]);
            var id = Json.num(s, "asignacion_id", 0);
            var fecha = Json.str(s, "fecha");
            if (id == 0 || fecha.length() != FECHA_LARGO) {
                continue;
            }
            var plan = Json.str(s, "plan");
            var soportada = Json.bool(s, "soportada", false) && !plan.equals("") && plan.length() <= Config.STORE_CLAVE_MAX_CARACTERES;
            var motivo = Json.str(s, "motivo");
            if (soportada) {
                if (!Store.escribir(clave(id), plan)) {
                    return GUARDADO_LLENO;
                }
            } else if (motivo.equals("") && !plan.equals("")) {
                motivo = "plan_grande";
            }
            nuevo.add([id, fecha, Json.num(s, "huella", 0), soportada, motivo]);
        }
        if (!Store.escribir(Config.STORE_PLAN_INDICE, nuevo) || !Store.escribir(Config.STORE_PLAN_SYNC, hoy)) {
            return GUARDADO_LLENO;
        }
        // Lo que ya no está en el plan se borra: libera sitio y evita ofrecer una sesión retirada.
        for (var i = 0; i < viejo.size(); i++) {
            if (!estaEn(nuevo, viejo[i][IX_ID])) {
                Store.borrar(clave(viejo[i][IX_ID]));
            }
        }
        return GUARDADO_OK;
    }

    function estaEn(ix as Lang.Array, id as Lang.Number) as Lang.Boolean {
        for (var i = 0; i < ix.size(); i++) {
            if (ix[i][IX_ID] == id) {
                return true;
            }
        }
        return false;
    }

    // Tira lo más viejo de ESTA app para hacer sitio (STORAGE_FULL). Devuelve si borró algo.
    function liberar() as Lang.Boolean {
        var ix = indice();
        if (ix.size() == 0) {
            return false;
        }
        for (var i = 0; i < ix.size(); i++) {
            Store.borrar(clave(ix[i][IX_ID]));
        }
        Store.borrar(Config.STORE_PLAN_INDICE);
        return true;
    }
}
