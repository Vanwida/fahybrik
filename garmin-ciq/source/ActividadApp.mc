//
// Punto de entrada. Entra en el manifest como entry="ActividadApp".
//
using Toybox.Application;
using Toybox.Lang;
using Toybox.WatchUi;

class ActividadApp extends Application.AppBase {

    var controller as Controller;

    function initialize() {
        AppBase.initialize();
        controller = new Controller();
    }

    function onStart(state as Lang.Dictionary or Null) as Void {
        controller.iniciarReloj();
        controller.refresh();
    }

    // Garmin cierra la app: si había una sesión grabando, se guarda (G10).
    function onStop(state as Lang.Dictionary or Null) as Void {
        controller.vivo.alSalir();
    }

    // La firma la fija AppBase y hay que copiarla EXACTA: declararla como
    // `Lang.Array` a secas no compila (el compilador lo lee como sobrescribir
    // con otro tipo de retorno). Tomada de los samples del SDK 9.2.0.
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        return [new Vista(controller), new Mandos(controller)];
    }
}
