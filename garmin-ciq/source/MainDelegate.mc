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

    // Gesto de refrescar: gira/desliza y vuelve a preguntar al servidor. Útil
    // cuando el atleta acaba de escribir el código en el móvil.
    function onNextPage() as Lang.Boolean {
        controller.refresh();
        return true;
    }
}
