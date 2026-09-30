//
// LOS AVISOS — §6 del modelo: vibración + tono, sin voz (H5). Un evento, un aviso,
// con CODIFICACIÓN REDUNDANTE: la vibración se distingue por el NÚMERO de pulsos
// (los Forerunner no cambian de intensidad) y el tono por su melodía (si el atleta
// silencia los tonos, queda la vibración).
//
// El motor no vibra: emite eventos en un `Lote` durante el segundo y al final
// suena UNO, el de más prioridad («sin apilar»). El acuse de una tecla es la
// excepción: va DELANTE, porque es la respuesta del botón (una pulsación = una
// acción + un aviso propio, G4). Todo cabe en una llamada a `Attention.vibrate`
// (<= 8 perfiles). Un evento sin fila en §6 no vibra.
//
using Toybox.Attention;
using Toybox.Lang;

module Avisos {

    enum {
        EV_NINGUNO = -1,
        EV_CUENTA,          // 3-2-1 antes de un paso de trabajo
        EV_GO,              // empieza trabajo
        EV_RECUPERA,        // empieza recuperación o descanso
        EV_PREAVISO,
        EV_AFLOJA,
        EV_APRIETA,
        EV_VUELTA,          // vuelta automática
        EV_PASO_A_MANO,     // acuse de una tecla que cierra el paso
        EV_BLOQUE,
        EV_SESION,
        EV_GPS,
        EV_ENLACE,          // sensor o GPS perdido
        EV_RECUPERADO,
        EV_BATERIA
    }

    // Tipos de pulso.
    enum {
        P_MUY_CORTO,
        P_CORTO,
        P_LARGO
    }

    // Duración de cada pulso y silencio entre pulsos, ms: distinguibles a ciegas (mecanismo, no método).
    const PULSO_MUY_CORTO_MS = 60;
    const PULSO_CORTO_MS = 180;
    const PULSO_LARGO_MS = 520;
    const HUECO_MS = 160;
    const INTENSIDAD_MAXIMA = 100;
    // Attention.vibrate admite como mucho 8 perfiles por llamada (H5).
    const MAX_PERFILES = 8;

    // Notas de las melodías (Hz, ms): dos que bajan (afloja) y dos que suben (aprieta).
    const NOTA_ALTA_HZ = 1047;
    const NOTA_BAJA_HZ = 784;
    const NOTA_1_MS = 140;
    const NOTA_2_MS = 180;

    // Prioridad de cada evento cuando coinciden en el mismo segundo (la de kit-reloj/eventos.ts).
    function prioridad(ev as Lang.Number) as Lang.Number {
        switch (ev) {
            case EV_SESION: return 11;
            case EV_BLOQUE: return 10;
            case EV_GO: return 9;
            case EV_RECUPERA: return 8;
            case EV_ENLACE: return 7;
            case EV_BATERIA: return 7;
            case EV_PREAVISO: return 6;
            case EV_AFLOJA: return 5;
            case EV_APRIETA: return 5;
            case EV_VUELTA: return 4;
            case EV_CUENTA: return 3;
            case EV_RECUPERADO: return 2;
            case EV_GPS: return 1;
            default: return 0;
        }
    }

    // El aviso de un segundo: el acuse (si lo hay) y el evento de más prioridad.
    class Lote {
        var mejor as Lang.Number = EV_NINGUNO;
        var acuse as Lang.Boolean = false;

        function meter(ev as Lang.Number) as Void {
            if (ev == EV_PASO_A_MANO) {
                acuse = true;
            } else if (mejor == EV_NINGUNO || prioridad(ev) > prioridad(mejor)) {
                mejor = ev;
            }
        }

        function vacio() as Lang.Boolean {
            return mejor == EV_NINGUNO && !acuse;
        }

        function limpiar() as Void {
            mejor = EV_NINGUNO;
            acuse = false;
        }
    }

    // Los pulsos de un evento, en el orden de §6.
    function pulsos(ev as Lang.Number) as Lang.Array<Lang.Number> {
        switch (ev) {
            case EV_CUENTA: return [P_CORTO];
            case EV_GO: return [P_LARGO, P_LARGO];
            case EV_RECUPERA: return [P_LARGO];
            case EV_PREAVISO: return [P_CORTO];
            case EV_AFLOJA: return [P_CORTO, P_CORTO];
            case EV_APRIETA: return [P_CORTO, P_CORTO, P_CORTO];
            case EV_VUELTA: return [P_CORTO, P_CORTO];
            case EV_PASO_A_MANO: return [P_MUY_CORTO];
            case EV_BLOQUE: return [P_LARGO, P_CORTO];
            case EV_SESION: return [P_LARGO, P_LARGO, P_LARGO];
            case EV_GPS: return [P_LARGO];
            case EV_ENLACE: return [P_LARGO, P_LARGO, P_LARGO];
            case EV_RECUPERADO: return [P_CORTO];
            case EV_BATERIA: return [P_LARGO, P_LARGO];
            default: return [];
        }
    }

    function duracionPulso(tipo as Lang.Number) as Lang.Number {
        if (tipo == P_MUY_CORTO) {
            return PULSO_MUY_CORTO_MS;
        }
        return tipo == P_CORTO ? PULSO_CORTO_MS : PULSO_LARGO_MS;
    }

    // Añade los perfiles de vibración de una lista de pulsos (con hueco entre ellos).
    function perfiles(out as Lang.Array, ps as Lang.Array<Lang.Number>) as Void {
        for (var i = 0; i < ps.size(); i++) {
            if (out.size() > 0) {
                out.add(new Attention.VibeProfile(0, HUECO_MS));
            }
            out.add(new Attention.VibeProfile(INTENSIDAD_MAXIMA, duracionPulso(ps[i])));
        }
    }

    // Suena el lote: vibra (acuse primero) y toca el tono del evento. Sin lote, nada.
    function emitir(lote as Lote) as Void {
        if (lote.vacio()) {
            return;
        }
        if (Attention has :vibrate) {
            var out = [];
            if (lote.acuse) {
                perfiles(out, pulsos(EV_PASO_A_MANO));
            }
            if (lote.mejor != EV_NINGUNO) {
                perfiles(out, pulsos(lote.mejor));
            }
            if (out.size() > MAX_PERFILES) {
                out = out.slice(0, MAX_PERFILES);
            }
            if (out.size() > 0) {
                Attention.vibrate(out);
            }
        }
        if (Attention has :playTone) {
            tono(lote.mejor == EV_NINGUNO ? EV_PASO_A_MANO : lote.mejor);
        }
    }

    // Un tono de sistema o una melodía de dos notas.
    function tono(ev as Lang.Number) as Void {
        switch (ev) {
            case EV_CUENTA: Attention.playTone(Attention.TONE_KEY); break;
            case EV_GO: Attention.playTone(Attention.TONE_START); break;
            case EV_RECUPERA: Attention.playTone(Attention.TONE_STOP); break;
            case EV_PREAVISO: Attention.playTone(Attention.TONE_INTERVAL_ALERT); break;
            case EV_AFLOJA: melodia(NOTA_ALTA_HZ, NOTA_BAJA_HZ); break;
            case EV_APRIETA: melodia(NOTA_BAJA_HZ, NOTA_ALTA_HZ); break;
            case EV_VUELTA: Attention.playTone(Attention.TONE_LAP); break;
            case EV_PASO_A_MANO: Attention.playTone(Attention.TONE_KEY); break;
            case EV_BLOQUE: Attention.playTone(Attention.TONE_SUCCESS); break;
            case EV_SESION: Attention.playTone(Attention.TONE_SUCCESS); break;
            case EV_GPS: Attention.playTone(Attention.TONE_SUCCESS); break;
            case EV_ENLACE: Attention.playTone(Attention.TONE_FAILURE); break;
            case EV_RECUPERADO: Attention.playTone(Attention.TONE_KEY); break;
            case EV_BATERIA: Attention.playTone(Attention.TONE_LOW_BATTERY); break;
            default: break;
        }
    }

    function melodia(hz1 as Lang.Number, hz2 as Lang.Number) as Void {
        Attention.playTone({
            :toneProfile => [new Attention.ToneProfile(hz1, NOTA_1_MS), new Attention.ToneProfile(hz2, NOTA_2_MS)],
            :repeatCount => 1
        });
    }
}
