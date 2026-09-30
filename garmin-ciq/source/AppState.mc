//
// Los estados en los que puede estar la app. Uno por situación REAL: si algo
// puede pasarle al atleta, tiene su estado y su pantalla. Ningún caso acaba en
// una pantalla en blanco ni en un "error" genérico que no dice qué hacer.
//
module AppState {
    enum {
        // Vinculación de la cuenta
        STATE_ENTRAR,           // pantalla «Entrar»: falta el email o pedir el código
        STATE_CODIGO,           // código pedido; toca escribir los 6 dígitos

        // Trabajo en curso (lleva su propio texto)
        STATE_BUSY,

        // El plan
        STATE_NO_PLAN,          // hoy no toca
        STATE_PLAN_VIEJO,       // el plan guardado es de hace demasiado: no se empieza
        STATE_SIN_DETALLE,      // hay sesión pero el reloj no tiene su detalle
        STATE_SIN_SOPORTE,      // la sesión va en la app (no es de correr)
        STATE_BRIEF,            // el brief del día: se puede empezar

        // La sesión (los mueve Vivo)
        STATE_CUENTA,           // 3-2-1
        STATE_VIVO,             // el paso en curso
        STATE_PAUSA,
        STATE_CONTROLES,        // pausar, saltar, +30 s, terminar, descartar
        STATE_CONFIRMA,         // terminar o descartar: pide confirmar
        STATE_RPE,
        STATE_RESUMEN,
        STATE_ENVIO,            // el estado honesto del envío
        STATE_RECUPERAR,        // una sesión interrumpida: seguir o guardar lo hecho

        // Fin de trayecto
        STATE_ERROR
    }
}
