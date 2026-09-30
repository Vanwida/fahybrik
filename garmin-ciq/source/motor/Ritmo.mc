//
// El ritmo ACTUAL, suavizado ~10 s, calculado por NOSOTROS desde la distancia
// (`elapsedDistance`), no la media de la vuelta ni el valor del firmware (G2).
//
// Guarda un anillo de muestras (tiempo de sesión en ms, distancia en decímetros),
// una por segundo. El ritmo es el tiempo entre la muestra más reciente y la más
// cercana a `VENTANA_MS` atrás, dividido por la distancia recorrida en ese tramo.
// Con menos historia que `MINIMO_MS` no hay ritmo (se pinta "--", jamás un cero).
// Sin floats: décimas de s/km en enteros.
//
using Toybox.Lang;

class Ritmo {

    // Muestras que caben: a 1 Hz son 16 s, más que la ventana.
    const N = 16;
    // La ventana de suavizado (el «~10 s» del modelo, G2).
    const VENTANA_MS = 10000;
    // Con menos historia que esto el ritmo no es fiable.
    const MINIMO_MS = 5000;
    // dt(ms) * 100 / dist(dm) = décimas de s/km (ms por metro = s por km).
    const ESCALA_DECI_POR_DM = 100;
    // Por encima de 20:00/km no es un ritmo, es alguien parado o un GPS fijando.
    const TECHO_DECI = 12000;

    var tiempos as Lang.Array<Lang.Number or Null>;
    var distancias as Lang.Array<Lang.Number or Null>;
    var cuantas as Lang.Number;
    var cabeza as Lang.Number;

    function initialize() {
        tiempos = new [N];
        distancias = new [N];
        cuantas = 0;
        cabeza = 0;
    }

    function reiniciar() as Void {
        cuantas = 0;
        cabeza = 0;
    }

    function agregar(tMs as Lang.Number, dDm as Lang.Number) as Void {
        tiempos[cabeza] = tMs;
        distancias[cabeza] = dDm;
        cabeza = (cabeza + 1) % N;
        if (cuantas < N) {
            cuantas++;
        }
    }

    // Décimas de s/km, o null si no se puede saber.
    function deci() as Lang.Number or Null {
        if (cuantas < 2) {
            return null;
        }
        var nuevo = (cabeza - 1 + N) % N;
        var t1 = tiempos[nuevo] as Lang.Number;
        var d1 = distancias[nuevo] as Lang.Number;
        var elegido = -1;
        // La muestra más reciente que ya tiene la ventana de antigüedad.
        for (var k = 1; k < cuantas; k++) {
            var i = (nuevo - k + N) % N;
            if (t1 - (tiempos[i] as Lang.Number) >= VENTANA_MS) {
                elegido = i;
                break;
            }
        }
        if (elegido < 0) {
            // Aún no hay ventana entera: la más vieja, si da para un mínimo.
            elegido = (nuevo - (cuantas - 1) + N) % N;
            if (t1 - (tiempos[elegido] as Lang.Number) < MINIMO_MS) {
                return null;
            }
        }
        var dt = t1 - (tiempos[elegido] as Lang.Number);
        var dd = d1 - (distancias[elegido] as Lang.Number);
        if (dd <= 0) {
            return null;
        }
        var deci = dt * ESCALA_DECI_POR_DM / dd;
        return deci > TECHO_DECI ? null : deci;
    }
}
