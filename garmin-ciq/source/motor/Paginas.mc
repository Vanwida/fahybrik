//
// Las páginas del vivo (UP/DOWN, circular): Paso → Datos → Vueltas → Estructura.
// La página 0 es el paso (la lámina); las demás son filas de dos columnas
// (etiqueta, valor) que el motor deja escritas una vez por segundo para que la
// vista solo las dibuje.
//
using Toybox.Lang;

module Paginas {

    const N = 4;
    enum {
        PASO,
        DATOS,
        VUELTAS,
        ESTRUCTURA
    }

    // Cuántas filas caben (a 218 de diámetro) sin bajar del suelo de texto.
    const MAX_FILAS = 4;
    const M_POR_KM = 1000;

    // Las filas de la página actual del motor: [etiqueta, valor, etiqueta, valor, …].
    function filas(m as Motor) as Lang.Array<Lang.String> {
        if (m.pagina == DATOS) {
            return datos(m);
        }
        if (m.pagina == VUELTAS) {
            return vueltas(m);
        }
        if (m.pagina == ESTRUCTURA) {
            return estructura(m);
        }
        return [] as Lang.Array<Lang.String>;
    }

    function datos(m as Motor) as Lang.Array<Lang.String> {
        var t = m.sesionS();
        var metros = m.totalM();
        var medio = Formato.ritmo(Formato.ritmoDeTramo(t, metros));
        var pm = m.sesPpmN > 0 ? (m.sesPpmSuma / m.sesPpmN).toString() : Formato.SIN_DATO;
        return ["Tiempo", Formato.reloj(t), "Distancia", Formato.distancia(metros), "Ritmo medio", medio, "Pulso medio", pm];
    }

    // Las últimas vueltas cerradas (la más reciente abajo).
    function vueltas(m as Motor) as Lang.Array<Lang.String> {
        var out = [] as Lang.Array<Lang.String>;
        var n = m.vueltas.size() / Motor.V_LARGO;
        if (n == 0) {
            return ["Vueltas", "aún ninguna"];
        }
        var desde = n > MAX_FILAS ? n - MAX_FILAS : 0;
        for (var k = desde; k < n; k++) {
            var b = k * Motor.V_LARGO;
            var auto = m.vueltas[b + Motor.V_TIPO] == 1;
            var rit = m.vueltas[b + Motor.V_RITMO];
            out.add((auto ? "Vuelta " : "Paso ") + (k + 1));
            out.add(Formato.reloj(m.vueltas[b + Motor.V_SEG]) + "  " + Formato.ritmo(rit > 0 ? rit : null));
        }
        return out;
    }

    // Lo que viene: el paso de ahora y los siguientes, cada uno en una línea.
    function estructura(m as Motor) as Lang.Array<Lang.String> {
        var out = [] as Lang.Array<Lang.String>;
        for (var k = 0; k < MAX_FILAS && m.i + k < m.s.pasos.size(); k++) {
            out.add(k == 0 ? "Ahora" : "Luego");
            out.add(Estructura.pasoCorto(m.s, m.s.pasos[m.i + k]));
        }
        return out;
    }
}
