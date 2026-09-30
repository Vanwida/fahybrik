//
// El cursor sobre los bytes del plan compacto (docs/garmin-reloj/plan-compacto.md).
//
// Un plan es una tabla de cadenas y una lista de enteros no negativos (varints de
// 7 bits, el bit 0x80 dice «sigue», menos significativo primero). Todo el
// decodificador tiene un solo verbo: «leer el siguiente valor». Convenciones:
//
//   · Ausente = 0 y presente = valor + 1 (`opc`): «no hay dato», nunca un cero.
//   · Una cadena viaja como su índice en la tabla (`cadena`) o índice + 1 si es
//     opcional (`cadenaOpc`).
//   · Sin floats: décimas para los ejes, centésimas para los kilos, en enteros.
//
// Un plan malo NO se lee «a medias»: cualquier desajuste lanza
// InvalidValueException y quien decodifica lo dice («plan de otra versión»).
//
using Toybox.Lang;
using Toybox.StringUtil;

class Lector {

    // Un número de 31 bits cabe en 5 bytes de varint.
    const MAX_BYTES_VARINT = 5;
    const CONTINUA = 0x80;
    const MASCARA = 0x7F;
    const BASE = 128;

    var bytes as Lang.ByteArray;
    var pos as Lang.Number;
    var cadenas as Lang.Array<Lang.String>;

    function initialize(datos as Lang.ByteArray) {
        bytes = datos;
        pos = 0;
        cadenas = [] as Lang.Array<Lang.String>;
    }

    // El base64 de la red → los bytes. Sin saltos de línea (el conversor no los admite).
    static function desdeBase64(texto as Lang.String) as Lang.ByteArray {
        return StringUtil.convertEncodedString(texto, {
            :fromRepresentation => StringUtil.REPRESENTATION_STRING_BASE64,
            :toRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY
        }) as Lang.ByteArray;
    }

    function byte() as Lang.Number {
        if (pos >= bytes.size()) {
            throw new Lang.InvalidValueException("plan cortado en el byte " + pos);
        }
        var b = bytes[pos] & 0xFF;
        pos++;
        return b;
    }

    function varint() as Lang.Number {
        var valor = 0;
        var mult = 1;
        for (var k = 0; k < MAX_BYTES_VARINT; k++) {
            var b = byte();
            valor += (b & MASCARA) * mult;
            if (b < CONTINUA) {
                return valor;
            }
            mult *= BASE;
        }
        throw new Lang.InvalidValueException("varint de más de 5 bytes en " + pos);
    }

    // Versión y tabla de cadenas (el contenedor). Devuelve la versión.
    function cabecera() as Lang.Number {
        var version = varint();
        var n = varint();
        for (var i = 0; i < n; i++) {
            var largo = varint();
            if (pos + largo > bytes.size()) {
                throw new Lang.InvalidValueException("la cadena " + i + " se sale del plan");
            }
            var trozo = bytes.slice(pos, pos + largo);
            pos += largo;
            cadenas.add(StringUtil.convertEncodedString(trozo, {
                :fromRepresentation => StringUtil.REPRESENTATION_BYTE_ARRAY,
                :toRepresentation => StringUtil.REPRESENTATION_STRING_PLAIN_TEXT,
                :encoding => StringUtil.CHAR_ENCODING_UTF8
            }) as Lang.String);
        }
        return version;
    }

    // ── valores ──────────────────────────────────────────────────────────────

    function n() as Lang.Number {
        return varint();
    }

    // Ausente → null; presente → el valor.
    function opc() as Lang.Number or Null {
        var v = varint();
        return v == 0 ? null : v - 1;
    }

    // Un código de una tabla de `max` entradas: fuera de tabla = reloj y servidor no hablan igual.
    function codigo(max as Lang.Number, donde as Lang.String) as Lang.Number {
        var c = varint();
        if (c >= max) {
            throw new Lang.InvalidValueException(donde + ": código " + c + " fuera de la tabla (" + max + ")");
        }
        return c;
    }

    function cadenaEn(i as Lang.Number, donde as Lang.String) as Lang.String {
        if (i < 0 || i >= cadenas.size()) {
            throw new Lang.InvalidValueException(donde + ": la cadena " + i + " no existe");
        }
        return cadenas[i];
    }

    function cadena(donde as Lang.String) as Lang.String {
        return cadenaEn(varint(), donde);
    }

    function cadenaOpc(donde as Lang.String) as Lang.String or Null {
        var v = opc();
        return v == null ? null : cadenaEn(v, donde);
    }

    // Un valor empaquetado en trozos de `anchos[i]` bits (de bajo a alto).
    function empaquetado(anchos as Lang.Array<Lang.Number>) as Lang.Array<Lang.Number> {
        var resto = varint();
        var out = [] as Lang.Array<Lang.Number>;
        for (var i = 0; i < anchos.size(); i++) {
            var modulo = 1 << anchos[i];
            out.add(resto % modulo);
            resto = resto / modulo;
        }
        return out;
    }

    // Un plan de otra versión que se leyó «bien» a medias deja bytes sin leer.
    function fin() as Void {
        if (pos != bytes.size()) {
            throw new Lang.InvalidValueException("sobran " + (bytes.size() - pos) + " bytes tras el último paso");
        }
    }
}
