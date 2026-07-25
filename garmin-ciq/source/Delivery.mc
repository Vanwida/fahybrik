//
// Todo lo que toca el contenido persistido del reloj: buscar nuestro entreno,
// tirar el de días pasados y arrancar el reproductor NATIVO de Garmin.
//
// La app no reimplementa el guiado. Los tramos, los ritmos objetivo, las alertas
// y la vibración los hace Garmin con su propio reproductor; nosotros solo le
// ponemos el entreno delante. Por eso la última línea de todo este flujo es
// System.exitTo(): salimos y le cedemos el reloj.
//
using Toybox.Lang;
using Toybox.PersistedContent;
using Toybox.System;

module Delivery {

    // Devuelve TODOS los entrenos que descargó ESTA app (getAppWorkouts, no
    // getWorkouts: los de Garmin Connect no son nuestros y no se tocan).
    //
    // Se vuelca a un array antes de hacer nada con ellos: borrar mientras se
    // itera invalida el iterador. El tope MAX_APP_WORKOUTS_SCAN es un seguro,
    // no una expectativa: nunca deberíamos tener más de un par.
    function listAppWorkouts() as Lang.Array<PersistedContent.Workout> {
        // El array se tipa explícitamente: un `[]` pelado se infiere como array
        // de Object, y un Workout persistido es una INTERFAZ, no un Object, así
        // que el compilador rechaza el add.
        var items = [] as Lang.Array<PersistedContent.Workout>;
        var iterator = PersistedContent.getAppWorkouts();
        if (iterator == null) {
            return items;
        }
        var item = iterator.next();
        var guard = 0;
        while (item != null && guard < Config.MAX_APP_WORKOUTS_SCAN) {
            items.add(item);
            item = iterator.next();
            guard++;
        }
        return items;
    }

    // Emparejamiento POR NOMBRE. No hay alternativa: de un entreno persistido la
    // app solo puede leer getName() y getId(), y el id lo asigna el reloj al
    // guardar, así que no lo conocemos de antemano. El servidor manda un
    // workout_name único por día precisamente para esto.
    function findByName(name as Lang.String) as PersistedContent.Workout or Null {
        if (name.equals("")) {
            return null;
        }
        var items = listAppWorkouts();
        for (var i = 0; i < items.size(); i++) {
            var candidate = items[i];
            var candidateName = candidate.getName();
            if (candidateName != null && candidateName.equals(name)) {
                return candidate;
            }
        }
        return null;
    }

    // Recolector de basura de lo NUESTRO. Se llama antes de descargar:
    //
    //  1. evita que el reloj acabe con un entreno por día hasta llenarse (que es
    //     como se llega a STORAGE_FULL), y
    //  2. evita que dos días distintos convivan y el atleta arranque el de ayer.
    //
    // Solo borra contenido de esta app y nunca el que vamos a usar hoy.
    function removeStaleExcept(keepName as Lang.String) as Lang.Number {
        var removed = 0;
        var items = listAppWorkouts();
        for (var i = 0; i < items.size(); i++) {
            var item = items[i];
            var name = item.getName();
            if (name != null && name.equals(keepName)) {
                continue;
            }
            try {
                item.remove();
                removed++;
            } catch (ex) {
                // Un fallo al borrar no rompe nada: como mucho queda un entreno
                // viejo ocupando sitio. Seguimos con el resto.
            }
        }
        return removed;
    }

    // Cede el reloj al reproductor nativo.
    //
    // El atleta va a ver DOS confirmaciones del sistema, no una: primero Garmin
    // pregunta si salir de la app, y después con qué app nativa ejecutar el
    // entreno (Correr / Trail / Cinta…). No se pueden suprimir — son del sistema.
    // Por eso la pantalla previa se lo avisa: si no, parece que la app falla.
    // Ref: https://developer.garmin.com/connect-iq/api-docs/Toybox/System.html
    function launch(workout as PersistedContent.Workout) as Lang.Boolean {
        try {
            var intent = workout.toIntent();
            if (intent == null) {
                return false;
            }
            System.exitTo(intent);
            return true;
        } catch (ex) {
            return false;
        }
    }
}
