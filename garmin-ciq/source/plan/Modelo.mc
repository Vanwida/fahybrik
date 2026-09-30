//
// El plan de una sesión, ya decodificado. Es `PlanSesion` de kit-reloj (paso.ts)
// en enteros: décimas en los ejes, centésimas en los kilos, sin floats.
//
// Aquí solo hay DATOS. Qué se pinta y qué avisa lo decide el motor, y todo lo
// que es método del coach (zonas, holguras, preaviso, vuelta automática, palabras
// del RPE, nombres de clase) llega en el plan: el reloj no trae ningún valor por
// defecto.
//
using Toybox.Lang;

// Un objetivo del paso. `min`/`max` en la unidad del eje ×10 (kilos ×100); null = sin dato.
// En ritmo y split500, `min` es el valor MÁS RÁPIDO (menos segundos).
class Objetivo {
    var eje as Lang.Number = 0;
    var papel as Lang.Number = 0;
    var avisa as Lang.Number = 0;      // 0 = sin dato; si no, Cod.AVISA_* + 1
    var escala as Lang.Number = 0;     // 0 = sin dato; si no, Cod.ESCALA_* + 1
    var min as Lang.Number or Null = null;
    var max as Lang.Number or Null = null;
    var palabra as Lang.String or Null = null;
}

class Tarea {
    var nombre as Lang.String = "";
    var dosisTipo as Lang.Number or Null = null;   // Cod.MEDIDA_*; null = sin dosis
    var dosisPrescrito as Lang.Number or Null = null;
    var dosisMide as Lang.Number = 0;
    var mide as Lang.Number = 0;
    var cargaKg as Lang.Number or Null = null;     // centésimas
    var cargaImpl as Lang.Number = 0;
    var corporal as Lang.Boolean = false;
    var corre as Lang.Boolean = false;
}

// El WOD de un paso. `v` lleva los números del formato en el orden del cable:
//   emom       [ventanas, ventanaS]        + `ciclo` y `tarea`
//   amrap/puntuacion [duracionS]           + `lista`
//   fortime    [capS o null]               + `tarea` (o null)
//   pared      [trabajoS, descansoS, rondas]
//   deathby    [inicio, incremento, ventanaS, tope o null] + `tarea`
class Wod {
    var formato as Lang.Number = 0;
    var lista as Lang.Array<Tarea> or Null = null;
    var tarea as Tarea or Null = null;
    var v as Lang.Array<Lang.Number or Null> = [] as Lang.Array<Lang.Number or Null>;
}

// La ficha de fuerza. `c` = los números de la carga según `cargaTipo`:
//   kg [min, max] (centi) · rm [pctMin, pctMax (deci), rmKg (centi) o null] · tuya [ultimaKg o null, lastre 0/1]
class Ficha {
    var ejercicio as Lang.Number = 0;      // ordinal de su primera aparición
    var cargaTipo as Lang.Number = 0;
    var c as Lang.Array<Lang.Number or Null> = [] as Lang.Array<Lang.Number or Null>;
    var esfuerzoEje as Lang.Number = 0;    // 0 = sin esfuerzo; si no, Cod.ESFUERZO_* + 1
    var esfuerzoMin as Lang.Number = 0;    // décimas
    var esfuerzoMax as Lang.Number = 0;
    var porLado as Lang.Number = 0;        // 0 = no; si no, Cod.LADO_* + 1
    var aproximacion as Lang.Boolean = false;
    var pasoKg as Lang.Number = 0;         // centésimas
    var vaciaKg as Lang.Number or Null = null;
}

class Dobles {
    var turno as Lang.Number = 0;
    var tuyas as Lang.Number or Null = null;
    var suyas as Lang.Number or Null = null;
    var pctTuyo as Lang.Number = 0;
    var alternaTipo as Lang.Number or Null = null;
    var alternaN as Lang.Number = 0;
}

class Paso {
    var clase as Lang.Number = 0;
    var rol as Lang.Number = 0;
    var fase as Lang.Number = 0;
    var cierreAtleta as Lang.Boolean = false;
    var medTipo as Lang.Number = 0;
    var medPrescrito as Lang.Number or Null = null;   // segundos, metros, reps o cal
    var medMide as Lang.Number = 0;
    var objetivos as Lang.Array<Objetivo> = [] as Lang.Array<Objetivo>;
    var recupera as Lang.Number = 0;      // 0 = sin dato; si no, Cod.RECUPERA_* + 1
    var entorno as Lang.Number = 0;       // 0 = sin dato; si no, Cod.ENTORNO_* + 1
    var maquina as Lang.Number = 0;       // 0 = ninguna; si no, Cod.MAQUINA_* + 1
    var roxzone as Lang.Number = 0;       // 0 = no; si no, Cod.ROXZONA_* + 1
    var damper as Lang.Number or Null = null;
    // Posición anidada: [n, de] de cada contador (Cod.CONTADOR_*), n = 0 si falta.
    var pos as Lang.Array<Lang.Number> or Null = null;
    var slotLetra as Lang.Number = 0;     // «A1»: 1 = A
    var slotNum as Lang.Number = 0;
    var bloque as Lang.Number or Null = null;
    var nombre as Lang.String or Null = null;
    var cargaKg as Lang.Number or Null = null;   // centésimas
    var cargaImpl as Lang.Number = 0;
    var tempo as Lang.Array<Lang.Number> or Null = null;
    var cue as Lang.String or Null = null;
    var vueltaAutoM as Lang.Number or Null = null;
    var grupoId as Lang.Number or Null = null;
    var grupoVeces as Lang.Number = 0;
    var wod as Wod or Null = null;
    var ficha as Ficha or Null = null;
    var dobles as Dobles or Null = null;

    // El objetivo con este papel, o null.
    function objetivoDe(papel as Lang.Number) as Objetivo or Null {
        for (var i = 0; i < objetivos.size(); i++) {
            if (objetivos[i].papel == papel) {
                return objetivos[i];
            }
        }
        return null;
    }

    function principal() as Objetivo or Null {
        return objetivoDe(Cod.PAPEL_PRINCIPAL);
    }
}

// Un juego de bandas de ritmo (por km o por 500 m) en segundos enteros.
class Banda {
    var unidad as Lang.Number = 0;
    var procedencia as Lang.Number = 0;
    var rapido as Lang.Array<Lang.Number> = [] as Lang.Array<Lang.Number>;
    var lento as Lang.Array<Lang.Number or Null> = [] as Lang.Array<Lang.Number or Null>;
}

// Las reglas de aviso del coach (histéresis, cadencia, preaviso), en segundos y unidades enteras.
class Reglas {
    var holguraRitmo as Lang.Number = 0;
    var holguraPpm as Lang.Number = 0;
    var holguraSplit as Lang.Number = 0;
    var holguraVatios as Lang.Number = 0;
    var holguraCadencia as Lang.Number = 0;
    var cadenciaS as Lang.Number = 0;
    var confirmacionS as Lang.Number = 0;
    var graciaZonaS as Lang.Number = 0;
    var preavisoS as Lang.Number = 0;
    var preavisoM as Lang.Number = 0;
    var preavisoMinimoS as Lang.Number = 0;
    var avisarCalentamiento as Lang.Boolean = false;
    var avisarRecuperacion as Lang.Boolean = false;
}

// Las palabras del coach: nombre de cada clase que usa la sesión, de los formatos y del RPE.
class Vocab {
    var clases as Lang.Array<Lang.Number> = [] as Lang.Array<Lang.Number>;     // Cod.CLASE_*
    var nombres as Lang.Array<Lang.String> = [] as Lang.Array<Lang.String>;
    var femenino as Lang.Array<Lang.Boolean> = [] as Lang.Array<Lang.Boolean>;
    var formatos as Lang.Array<Lang.String> = [] as Lang.Array<Lang.String>;  // orden de Cod.FORMATO_*
    var rpe as Lang.Array<Lang.String> = [] as Lang.Array<Lang.String>;       // 0..10

    // El nombre de una clase; si el plan no la trae, un texto vacío (el reloj no inventa).
    function nombreClase(clase as Lang.Number) as Lang.String {
        for (var i = 0; i < clases.size(); i++) {
            if (clases[i] == clase) {
                return nombres[i];
            }
        }
        return "";
    }
}

// El método de resumen y de anotación del coach (fuerza y resumen de circuito, fases posteriores).
class Metodo {
    var paresMinimos as Lang.Number = 0;
    var umbralHechoPct as Lang.Number = 0;
    var guardarQuietoS as Lang.Number = 0;
    var repsDeMas as Lang.Number = 0;
    var rpeMin as Lang.Number = 0;   // décimas
    var rpeMax as Lang.Number = 0;
    var rpePaso as Lang.Number = 0;
    var rirMin as Lang.Number = 0;
    var rirMax as Lang.Number = 0;
    var rirPaso as Lang.Number = 0;
    var kgMax as Lang.Number = 0;    // centésimas
}

class Sesion {
    var asignacionId as Lang.Number = 0;
    var huella as Lang.Number = 0;
    var fitSport as Lang.Number = 0;
    var fitSubSport as Lang.Number = 0;
    var entorno as Lang.Number = 0;      // 0 = mixto o sin decir; si no, Cod.ENTORNO_* + 1
    var duracionEstS as Lang.Number = 0;
    var zonasTechos as Lang.Array<Lang.Number> or Null = null;   // bpm
    var zonasProcedencia as Lang.Number = 0;
    var zonasNombres as Lang.Array<Lang.String> or Null = null;
    var bandas as Lang.Array<Banda> = [] as Lang.Array<Banda>;
    var reglas as Reglas = new Reglas();
    var vocab as Vocab = new Vocab();
    var metodo as Metodo = new Metodo();
    var pareja as Lang.String or Null = null;
    var pasos as Lang.Array<Paso> = [] as Lang.Array<Paso>;

    // ¿Sabe la v1 guiar esta sesión? Solo correr: todo paso es de una clase de
    // carrera (o descanso) y no lleva nada de circuito, fuerza, WOD, ergo ni Roxzone.
    function soportada() as Lang.Boolean {
        for (var i = 0; i < pasos.size(); i++) {
            var p = pasos[i];
            if (!Clases.esDeCarrera(p.clase) || p.wod != null || p.ficha != null || p.dobles != null || p.maquina != 0 || p.roxzone != 0) {
                return false;
            }
        }
        return pasos.size() > 0;
    }
}
