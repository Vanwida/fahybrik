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

        STATE_NO_SESSION,       // hoy no toca

        // Fin de trayecto
        STATE_ERROR
    }
}
