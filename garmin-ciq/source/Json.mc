//
// Lectura defensiva de la respuesta JSON.
//
// makeWebRequest con :responseType JSON entrega un Lang.Dictionary, pero nada
// garantiza qué hay dentro: un campo puede faltar, venir null o llegar con otro
// tipo si el endpoint cambia. Un acceso directo reventaría la app en la muñeca
// del atleta a mitad de calentamiento, así que TODO pasa por aquí.
//
using Toybox.Lang;

module Json {

    function dict(data as Lang.Object or Null) as Lang.Dictionary {
        if (data instanceof Lang.Dictionary) {
            return data;
        }
        return {};
    }

    function str(source as Lang.Dictionary, key as Lang.String) as Lang.String {
        var value = source.get(key);
        if (value == null) {
            return "";
        }
        return value.toString();
    }

    // Acepta true/false reales y también "true"/1, por si el serializador del
    // servidor cambia. Ante la duda devuelve `fallback`.
    function bool(source as Lang.Dictionary, key as Lang.String, fallback as Lang.Boolean) as Lang.Boolean {
        var value = source.get(key);
        if (value == null) {
            return fallback;
        }
        if (value instanceof Lang.Boolean) {
            return value;
        }
        if (value instanceof Lang.Number) {
            return value != 0;
        }
        if (value instanceof Lang.String) {
            return value.equals("true") || value.equals("1");
        }
        return fallback;
    }
}
