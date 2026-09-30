//
// Entrada del atleta: los botones de un reloj de cinco (H6). START/STOP = onSelect,
// BACK/LAP = onBack, UP = onPreviousPage, DOWN = onNextPage, UP largo = onMenu.
// Lo que hace cada uno en cada estado es la tabla de §5 y vive en Vivo/Controller;
// aquí solo se traduce la tecla.
//
// BehaviorDelegate traduce sola las teclas físicas y el toque a estos métodos. En
// el vivo el táctil está APAGADO (G3, como en Garmin nativo): un roce con la manga
// o el sudor no puede cerrar un paso. Fuera del vivo, un toque vale como START.
//
using Toybox.Lang;
using Toybox.WatchUi;

class Mandos extends WatchUi.BehaviorDelegate {

    var controller as Controller;

    function initialize(ctrl as Controller) {
        BehaviorDelegate.initialize();
        controller = ctrl;
    }

    function onSelect() as Lang.Boolean {
        return controller.onSelect();
    }

    function onBack() as Lang.Boolean {
        return controller.onBack();
    }

    function onPreviousPage() as Lang.Boolean {
        return controller.onUp();
    }

    function onNextPage() as Lang.Boolean {
        return controller.onDown();
    }

    function onMenu() as Lang.Boolean {
        return controller.onMenu();
    }

    // ── táctil: apagado en el vivo ───────────────────────────────────────────

    function tactilApagado() as Lang.Boolean {
        return controller.vivo.enSesion();
    }

    function onTap(evt as WatchUi.ClickEvent) as Lang.Boolean {
        return tactilApagado() ? true : BehaviorDelegate.onTap(evt);
    }

    function onSwipe(evt as WatchUi.SwipeEvent) as Lang.Boolean {
        return tactilApagado() ? true : BehaviorDelegate.onSwipe(evt);
    }

    function onHold(evt as WatchUi.ClickEvent) as Lang.Boolean {
        return tactilApagado() ? true : BehaviorDelegate.onHold(evt);
    }
}
