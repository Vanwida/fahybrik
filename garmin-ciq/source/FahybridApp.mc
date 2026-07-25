//
// Punto de entrada. Entra en el manifest como entry="FahybridApp".
//
using Toybox.Application;
using Toybox.Lang;
using Toybox.WatchUi;

class FahybridApp extends Application.AppBase {

    var controller as Controller;

    function initialize() {
        AppBase.initialize();
        controller = new Controller();
    }

    function onStart(state as Lang.Dictionary or Null) as Void {
        controller.refresh();
    }

    // Garmin llama aquí cuando el atleta guarda los ajustes desde Garmin Connect
    // Mobile. Es la bisagra del login: es el momento en que llegan al reloj el
    // email y el código de 6 dígitos recién tecleados, y por tanto cuando se
    // puede canjear el código por el token.
    //
    // LIMITACIÓN CONOCIDA: los ajustes solo bajan al reloj con el móvil
    // emparejado y cuando el atleta SALE de la pantalla de ajustes en Garmin
    // Connect. Tarda unos segundos. Por eso la app deja además un gesto manual
    // para reintentar (ver MainDelegate.onNextPage) en vez de fiarlo todo a esta
    // llamada.
    function onSettingsChanged() as Void {
        controller.refresh();
    }

    // La firma la fija AppBase y hay que copiarla EXACTA: declararla como
    // `Lang.Array` a secas no compila (el compilador lo lee como sobrescribir
    // con otro tipo de retorno). Tomada de los samples del SDK 9.2.0.
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        return [new MainView(controller), new MainDelegate(controller)];
    }
}
