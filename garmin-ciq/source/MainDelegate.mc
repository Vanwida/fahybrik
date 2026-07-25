//
// Entrada del atleta. Un solo gesto útil: la acción principal.
//
// BehaviorDelegate (no InputDelegate) porque traduce sola el botón físico START
// de un Forerunner/fēnix y el toque en pantalla de un Venu al mismo onSelect():
// una sola implementación para relojes con y sin táctil.
//
using Toybox.Lang;
using Toybox.WatchUi;

class MainDelegate extends WatchUi.BehaviorDelegate {

    var controller as Controller;

    function initialize(ctrl as Controller) {
        BehaviorDelegate.initialize();
        controller = ctrl;
    }

    function onSelect() as Lang.Boolean {
        controller.primaryAction();
        return true;
    }

    // BACK: si estamos en la pantalla de aviso de los dos toques, vuelve atrás en
    // vez de cerrar la app — es una confirmación, y una confirmación se cancela.
    function onBack() as Lang.Boolean {
        if (controller.state == AppState.STATE_CONFIRM) {
            controller.ready("");
            return true;
        }
        return false;
    }

    // Gesto de refrescar: gira/desliza y vuelve a preguntar al servidor. Útil
    // cuando el atleta acaba de escribir el código en el móvil.
    function onNextPage() as Lang.Boolean {
        controller.refresh();
        return true;
    }
}
