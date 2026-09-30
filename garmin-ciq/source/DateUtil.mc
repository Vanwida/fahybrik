//
// Fecha LOCAL del reloj en ISO (YYYY-MM-DD).
//
// Por qué la manda el reloj y no la deduce el servidor: el servidor no sabe en
// qué huso está el atleta. Si lo adivina, a las 23:30 de un martes en Barcelona
// le puede servir el entreno del miércoles. El reloj sí lo sabe con certeza —
// Gregorian.info() con FORMAT_SHORT devuelve la hora local del dispositivo.
//
using Toybox.Lang;
using Toybox.Time;
using Toybox.Time.Gregorian;

module DateUtil {

    const SECONDS_PER_DAY = 86400;

    function todayIso() as Lang.String {
        var now = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return now.year.format("%04d") + "-" + now.month.format("%02d") + "-" + now.day.format("%02d");
    }

    // Días desde 1970 de una fecha ISO (YYYY-MM-DD). Solo sirve para restar dos fechas.
    function epochDays(iso as Lang.String) as Lang.Number {
        var m = Gregorian.moment({
            :year => iso.substring(0, 4).toNumber(),
            :month => iso.substring(5, 7).toNumber(),
            :day => iso.substring(8, 10).toNumber(),
            :hour => 12
        });
        return m.value() / SECONDS_PER_DAY;
    }

    // Días entre dos fechas ISO (b - a). Fecha vacía o rota: null.
    function daysBetween(a as Lang.String, b as Lang.String) as Lang.Number or Null {
        if (a.length() != 10 || b.length() != 10) {
            return null;
        }
        return epochDays(b) - epochDays(a);
    }
}
