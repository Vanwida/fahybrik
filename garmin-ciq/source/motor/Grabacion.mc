//
// La grabación del FIT (ActivityRecording). Aparece en la lista de Actividades del
// reloj y se sincroniza con Garmin Connect (H1). Un deporte por sesión: el que
// manda el plan (`fitSport`/`fitSubSport`, dato del servidor, no constantes del reloj).
//
//   · Sensores habilitados ANTES de `createSession` (pulso; el GPS lo pide `Position`).
//   · Una vuelta por paso (`addLap`): la verdad de cada tramo vive en NUESTRO
//     servidor, no en Garmin Connect (H2, los campos de vuelta fallan a menudo).
//   · Developer fields: en RECORD el paso y el objetivo; en SESSION la huella del
//     plan (qué versión se hizo, G9).
//
// Todo puede fallar en un reloj concreto: cada llamada va protegida y devuelve si
// funcionó. El motor sigue aunque no se grabe, y lo dice.
//
using Toybox.ActivityRecording;
using Toybox.FitContributor;
using Toybox.Lang;
using Toybox.Position;
using Toybox.Sensor;
using Toybox.WatchUi;

class Grabacion {

    // Identificadores de los campos propios del FIT.
    const CAMPO_PASO = 0;
    const CAMPO_OBJETIVO = 1;
    const CAMPO_HUELLA = 2;

    var sesion as ActivityRecording.Session or Null;
    var campoPaso as FitContributor.Field or Null;
    var campoObjetivo as FitContributor.Field or Null;
    var grabando as Lang.Boolean;

    function initialize() {
        sesion = null;
        campoPaso = null;
        campoObjetivo = null;
        grabando = false;
    }

    // Pulso y GPS, antes de crear la sesión (el GPS y el pulso tardan en fijar).
    static function habilitarSensores(alPosicion as Lang.Method) as Void {
        try {
            Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
            Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, alPosicion);
        } catch (ex) {
            // Un reloj sin alguno de los dos: el motor lo pinta como «--».
        }
    }

    static function apagarSensores() as Void {
        try {
            Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
            Sensor.setEnabledSensors([]);
        } catch (ex) {
        }
    }

    // Crea la sesión FIT con el deporte del plan. false = este reloj no la crea (se dice, se sigue sin grabar).
    (:typecheck(false))
    function crear(s as Sesion) as Lang.Boolean {
        try {
            sesion = ActivityRecording.createSession({
                :name => WatchUi.loadResource(Rez.Strings.ActivityName) as Lang.String,
                :sport => s.fitSport,
                :subSport => s.fitSubSport
            });
        } catch (ex) {
            sesion = null;
            return false;
        }
        try {
            var ses = sesion as ActivityRecording.Session;
            campoPaso = ses.createField("paso", CAMPO_PASO, FitContributor.DATA_TYPE_UINT16, { :mesgType => FitContributor.MESG_TYPE_RECORD });
            campoObjetivo = ses.createField("objetivo", CAMPO_OBJETIVO, FitContributor.DATA_TYPE_UINT16, { :mesgType => FitContributor.MESG_TYPE_RECORD });
            var huella = ses.createField("huella", CAMPO_HUELLA, FitContributor.DATA_TYPE_UINT32, { :mesgType => FitContributor.MESG_TYPE_SESSION });
            huella.setData(s.huella);
        } catch (ex) {
            // Sin campos propios se graba igual: el detalle va al servidor.
        }
        return true;
    }

    function iniciar() as Lang.Boolean {
        if (sesion == null) {
            return false;
        }
        try {
            grabando = (sesion as ActivityRecording.Session).start();
        } catch (ex) {
            grabando = false;
        }
        return grabando;
    }

    // Pausa (stop) y reanuda (start): el crono y la distancia del FIT se paran con él.
    function pausar() as Void {
        if (sesion != null && grabando) {
            try {
                (sesion as ActivityRecording.Session).stop();
            } catch (ex) {
            }
            grabando = false;
        }
    }

    function reanudar() as Void {
        if (sesion != null && !grabando) {
            iniciar();
        }
    }

    // Cierra la vuelta del paso que acaba.
    function vuelta() as Void {
        if (sesion != null && grabando) {
            try {
                (sesion as ActivityRecording.Session).addLap();
            } catch (ex) {
            }
        }
    }

    // El paso en curso y su objetivo (RECORD), tal como lo prescribe el plan.
    function fijarPaso(indice as Lang.Number, objetivoDeci as Lang.Number or Null) as Void {
        try {
            if (campoPaso != null) {
                (campoPaso as FitContributor.Field).setData(indice + 1);
            }
            if (campoObjetivo != null) {
                (campoObjetivo as FitContributor.Field).setData(objetivoDeci == null ? 0 : objetivoDeci);
            }
        } catch (ex) {
        }
    }

    // Cierra la grabación: guarda el FIT o lo descarta.
    function terminar(guardar as Lang.Boolean) as Lang.Boolean {
        var ok = true;
        if (sesion != null) {
            var ses = sesion as ActivityRecording.Session;
            try {
                if (grabando) {
                    ses.stop();
                }
                ok = guardar ? ses.save() : ses.discard();
            } catch (ex) {
                ok = false;
            }
        }
        grabando = false;
        sesion = null;
        return ok;
    }
}
