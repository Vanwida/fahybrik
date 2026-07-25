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

    function todayIso() as Lang.String {
        var now = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return now.year.format("%04d") + "-" + now.month.format("%02d") + "-" + now.day.format("%02d");
    }
}
