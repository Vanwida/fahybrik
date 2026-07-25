//
// Los estados en los que puede estar la app. Uno por situación REAL: si algo
// puede pasarle al atleta, tiene su estado y su pantalla. Ningún caso acaba en
// una pantalla en blanco ni en un "error" genérico que no dice qué hacer.
//
module AppState {
    enum {
        // Vinculación de la cuenta
        STATE_NEEDS_EMAIL,      // no hay email en los ajustes del móvil
        STATE_NEEDS_CODE,       // hay email, falta el código de 6 dígitos
        STATE_CODE_SENT,        // código pedido; toca escribirlo en el móvil

        // Trabajo en curso (lleva su propio texto)
        STATE_BUSY,

        // Entreno del día
        STATE_NEEDS_DOWNLOAD,   // hay entreno y aún no está en el reloj
        STATE_READY,            // el entreno ya está en el reloj: se puede empezar
        STATE_CONFIRM,          // avisamos de los dos toques del sistema
        STATE_NO_SESSION,       // hoy no toca
        STATE_NOT_EXPORTABLE,   // hay sesión pero no es de correr

        // Fin de trayecto
        STATE_ERROR
    }
}
