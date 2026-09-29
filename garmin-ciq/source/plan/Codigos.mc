//
// GENERADO por tools/generar-codigos.py desde formato.ts. NO EDITAR A MANO.
//
// La ABI del plan compacto (docs/garmin-reloj/plan-compacto.md): el orden de cada
// tabla ES el código que viaja por el cable. Solo se añade al final.
//
using Toybox.Lang;

module Cod {
    const VERSION_ESQUEMA = 2;
    const NUM_PALABRAS_RPE = 11;
    const MAX_OBJETIVOS = 2;
    const MAX_PASOS = 200;

    const ANCHOS_ROL_FASE = [2, 2, 1];
    const ANCHOS_MEDIDA = [3, 3];
    const ANCHOS_OBJETIVO = [4, 2, 1, 2, 2];
    const ANCHOS_EXTRAS = [2, 2, 3, 2];
    const ANCHOS_TAREA = [1, 1, 1, 1, 3];
    const ANCHOS_FICHA = [2, 1, 1];
    const ANCHOS_POSICION = [1, 1, 1, 1, 1, 1];
    const ANCHOS_FLAGS_REGLAS = [1, 1];
    const ANCHOS_BANDERAS_PASO = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    const N_CLASE = 23;
    enum {
        CLASE_CALENTAMIENTO = 0,
        CLASE_VUELTA_CALMA = 1,
        CLASE_RODAJE = 2,
        CLASE_TIRADA = 3,
        CLASE_TEMPO = 4,
        CLASE_SERIES = 5,
        CLASE_PROGRESIVO = 6,
        CLASE_FARTLEK = 7,
        CLASE_CUESTAS = 8,
        CLASE_STRIDES = 9,
        CLASE_CARRERA = 10,
        CLASE_TEST = 11,
        CLASE_RECUPERACION = 12,
        CLASE_DESCANSO = 13,
        CLASE_DESCANSO_TANDAS = 14,
        CLASE_ESTACION = 15,
        CLASE_ROXZONE = 16,
        CLASE_FUERZA = 17,
        CLASE_ERGO = 18,
        CLASE_EMOM = 19,
        CLASE_AMRAP = 20,
        CLASE_FORTIME = 21,
        CLASE_MOVILIDAD = 22,
    }

    const N_ROL = 4;
    enum {
        ROL_TRABAJO = 0,
        ROL_RECUPERACION = 1,
        ROL_DESCANSO = 2,
        ROL_TRANSICION = 3,
    }

    const N_FASE = 3;
    enum {
        FASE_CALENTAMIENTO = 0,
        FASE_PRINCIPAL = 1,
        FASE_VUELTA = 2,
    }

    const N_MEDIDA = 5;
    enum {
        MEDIDA_DISTANCIA = 0,
        MEDIDA_TIEMPO = 1,
        MEDIDA_REPS = 2,
        MEDIDA_CAL = 3,
        MEDIDA_ABIERTA = 4,
    }

    const N_MIDE = 6;
    enum {
        MIDE_GPS = 0,
        MIDE_CINTA = 1,
        MIDE_ERGO = 2,
        MIDE_SENSOR = 3,
        MIDE_ATLETA = 4,
        MIDE_RELOJ = 5,
    }

    const N_EJE = 11;
    enum {
        EJE_RITMO = 0,
        EJE_ZONA = 1,
        EJE_PPM = 2,
        EJE_RPE = 3,
        EJE_POTENCIA = 4,
        EJE_PCTRM = 5,
        EJE_KG = 6,
        EJE_RIR = 7,
        EJE_SPLIT500 = 8,
        EJE_CADENCIA = 9,
        EJE_INCLINACION = 10,
    }

    const N_PAPEL = 3;
    enum {
        PAPEL_PRINCIPAL = 0,
        PAPEL_TECHO = 1,
        PAPEL_SECUNDARIO = 2,
    }

    const N_AVISA = 3;
    enum {
        AVISA_AMBOS = 0,
        AVISA_SOLO_ARRIBA = 1,
        AVISA_SOLO_ABAJO = 2,
    }

    const N_RECUPERA = 3;
    enum {
        RECUPERA_TROTE = 0,
        RECUPERA_ANDAR = 1,
        RECUPERA_PARADO = 2,
    }

    const N_ENTORNO = 3;
    enum {
        ENTORNO_CALLE = 0,
        ENTORNO_CINTA = 1,
        ENTORNO_PISTA = 2,
    }

    const N_MAQUINA = 4;
    enum {
        MAQUINA_REMO = 0,
        MAQUINA_SKI = 1,
        MAQUINA_BICI = 2,
        MAQUINA_CINTA = 3,
    }

    const N_ROXZONA = 2;
    enum {
        ROXZONA_ENTRADA = 0,
        ROXZONA_SALIDA = 1,
    }

    const N_WOD = 6;
    enum {
        WOD_EMOM = 0,
        WOD_AMRAP = 1,
        WOD_PUNTUACION = 2,
        WOD_FORTIME = 3,
        WOD_PARED = 4,
        WOD_DEATHBY = 5,
    }

    const N_CARGA = 4;
    enum {
        CARGA_KG = 0,
        CARGA_RM = 1,
        CARGA_CORPORAL = 2,
        CARGA_TUYA = 3,
    }

    const N_ESFUERZO = 2;
    enum {
        ESFUERZO_RIR = 0,
        ESFUERZO_RPE = 1,
    }

    const N_LADO = 3;
    enum {
        LADO_PIERNA = 0,
        LADO_BRAZO = 1,
        LADO_LADO = 2,
    }

    const N_TURNO = 3;
    enum {
        TURNO_TUYO = 0,
        TURNO_PAREJA = 1,
        TURNO_REPARTO = 2,
    }

    const N_PROC = 2;
    enum {
        PROC_ESTIMADA = 0,
        PROC_MEDIDA = 1,
    }

    const N_UNIDAD = 2;
    enum {
        UNIDAD_KM = 0,
        UNIDAD_500M = 1,
    }

    const N_ESCALA = 2;
    enum {
        ESCALA_PPM = 0,
        ESCALA_RITMO = 1,
    }

    const N_ALTERNA = 3;
    enum {
        ALTERNA_METROS = 0,
        ALTERNA_REPS = 1,
        ALTERNA_SEGUNDOS = 2,
    }

    const N_FORMATO = 10;
    enum {
        FORMATO_EMOM = 0,
        FORMATO_AMRAP = 1,
        FORMATO_FORTIME = 2,
        FORMATO_PARED = 3,
        FORMATO_DEATHBY = 4,
        FORMATO_CIRCUITO = 5,
        FORMATO_TEST = 6,
        FORMATO_SERIES = 7,
        FORMATO_FUERZA = 8,
        FORMATO_CONTINUO = 9,
    }

    const N_BANDERA = 13;
    enum {
        BANDERA_POSICION = 0,
        BANDERA_BLOQUE = 1,
        BANDERA_NOMBRE = 2,
        BANDERA_CARGA = 3,
        BANDERA_EXTRAS = 4,
        BANDERA_TEMPO = 5,
        BANDERA_CUE = 6,
        BANDERA_VUELTAAUTO = 7,
        BANDERA_WOD = 8,
        BANDERA_FUERZA = 9,
        BANDERA_DOBLES = 10,
        BANDERA_DAMPER = 11,
        BANDERA_GRUPO = 12,
    }

    const N_CONTADOR = 5;
    enum {
        CONTADOR_TANDA = 0,
        CONTADOR_SERIE = 1,
        CONTADOR_TRAMO = 2,
        CONTADOR_RONDA = 3,
        CONTADOR_ESTACION = 4,
    }

}
