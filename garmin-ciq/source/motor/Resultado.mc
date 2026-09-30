//
// EL RESULTADO de una sesión, en dos formas:
//
//   · COMPACTA (`item`), lo que se guarda en Storage: unos pocos enteros por tramo. Una
//     clave de Storage admite 8 KB y un cuerpo JSON con 20 tramos no cabe; los enteros sí.
//   · JSON (`cuerpo`), lo que se manda a `POST /api/sync/workout-execution` (el mismo
//     endpoint que ya usa el móvil): se arma al enviar, con la forma que pide
//     `web/lib/sync/record-workout-execution.ts` y `segment-input-schema.ts`.
//
// `started_at` es el que se fijó y guardó ANTES de grabar: un reintento manda el mismo
// y el servidor no duplica (idempotencia por assignment_id). La verdad de cada tramo
// vive aquí, no en Garmin Connect (H2).
//
using Toybox.Lang;
using Toybox.Time;
using Toybox.Time.Gregorian;

module Resultado {

    // Valores de los campos de la API (vocabulario del servidor, no copy).
    const FUENTE = "garmin";
    const REGISTRADO_EN_VIVO = "live";
    const COMPLETA = "full";
    const PARCIAL = "partial";
    const MODALIDAD_CORRER = "run";
    const ROL_TRABAJO = "work";
    const ROL_RECUPERACION = "recovery";
    const FASE_CALENTAMIENTO = "warmup";
    const FASE_PRINCIPAL = "main";
    const FASE_VUELTA_CALMA = "cooldown";
    const RITMO_S_KM_POR_S_M = 1000;
    const SIN_RPE = -1;
    const SIN_ROL = -1;

    // Columnas por tramo de `meta` (rol y fase del paso, para leg_role y leg_phase).
    const META_LARGO = 2;

    // La forma compacta de un resultado. `tramos` es la fila plana del Motor (Motor.T_LARGO por tramo).
    function item(s as Sesion or Null, id as Lang.Number, huella as Lang.Number, inicio as Lang.Number, durS as Lang.Number, completa as Lang.Boolean, tramos as Lang.Array<Lang.Number>) as Lang.Dictionary {
        var meta = [] as Lang.Array<Lang.Number>;
        for (var k = 0; k + Motor.T_LARGO <= tramos.size(); k += Motor.T_LARGO) {
            var i = tramos[k + Motor.T_PASO];
            if (s != null && i >= 0 && i < s.pasos.size()) {
                meta.addAll([s.pasos[i].rol, s.pasos[i].fase]);
            } else {
                meta.addAll([SIN_ROL, SIN_ROL]);
            }
        }
        return { "a" => id, "h" => huella, "i" => inicio, "d" => durS, "c" => completa ? 1 : 0, "r" => SIN_RPE, "l" => 0, "t" => tramos, "m" => meta };
    }

    // ISO 8601 en UTC: «2026-09-30T07:15:00Z».
    function iso(epoch as Lang.Number) as Lang.String {
        var g = Gregorian.utcInfo(new Time.Moment(epoch), Time.FORMAT_SHORT);
        return g.year.format("%04d") + "-" + g.month.format("%02d") + "-" + g.day.format("%02d") + "T" + g.hour.format("%02d") + ":" + g.min.format("%02d") + ":" + g.sec.format("%02d") + "Z";
    }

    // El cuerpo JSON de la petición.
    function cuerpo(it as Lang.Dictionary) as Lang.Dictionary {
        var inicio = Json.num(it, "i", 0);
        var dur = Json.num(it, "d", 0);
        var rpe = Json.num(it, "r", SIN_RPE);
        var body = {
            "assignment_id" => Json.num(it, "a", 0),
            "source" => FUENTE,
            "recorded_via" => REGISTRADO_EN_VIVO,
            "source_workout_ref" => FUENTE + "-" + Json.num(it, "h", 0) + "-" + inicio,
            "started_at" => iso(inicio),
            "ended_at" => iso(inicio + dur),
            "total_duration_seconds" => dur,
            "completeness" => Json.num(it, "c", 0) == 1 ? COMPLETA : PARCIAL,
            "segments" => segmentos(it)
        };
        // Un RPE omitido es nulo: no se manda, jamás se inventa.
        if (rpe != SIN_RPE) {
            body.put("perceived_exertion", rpe);
        }
        return body;
    }

    function segmentos(it as Lang.Dictionary) as Lang.Array<Lang.Dictionary> {
        var out = [] as Lang.Array<Lang.Dictionary>;
        var t = it.get("t");
        var m = it.get("m");
        if (!(t instanceof Lang.Array) || !(m instanceof Lang.Array)) {
            return out;
        }
        var inicio = Json.num(it, "i", 0);
        var n = t.size() / Motor.T_LARGO;
        for (var k = 0; k < n; k++) {
            var b = k * Motor.T_LARGO;
            var dur = t[b + Motor.T_DUR_S];
            var dist = t[b + Motor.T_DIST_M];
            var desde = inicio + t[b + Motor.T_INICIO_S];
            var seg = {
                "position" => k,
                "modality" => MODALIDAD_CORRER,
                "started_at" => iso(desde),
                "ended_at" => iso(desde + dur),
                "duration_seconds" => dur,
                "distance_meters" => dist,
                "source" => FUENTE
            };
            if (dist > 0 && dur > 0) {
                seg.put("avg_pace_s_per_km", dur * RITMO_S_KM_POR_S_M / dist);
            }
            var pn = t[b + Motor.T_PPM_N];
            if (pn > 0) {
                seg.put("avg_hr", t[b + Motor.T_PPM_SUMA] / pn);
                seg.put("max_hr", t[b + Motor.T_PPM_MAX]);
            }
            // leg_index, leg_role y leg_phase van juntos o ninguno (CHECK del servidor).
            var rol = m[k * META_LARGO];
            var fase = m[k * META_LARGO + 1];
            if (rol != SIN_ROL && fase != SIN_ROL) {
                seg.put("leg_index", k);
                seg.put("leg_role", rol == Cod.ROL_TRABAJO ? ROL_TRABAJO : ROL_RECUPERACION);
                seg.put("leg_phase", fase == Cod.FASE_CALENTAMIENTO ? FASE_CALENTAMIENTO : (fase == Cod.FASE_VUELTA ? FASE_VUELTA_CALMA : FASE_PRINCIPAL));
            }
            out.add(seg);
        }
        return out;
    }
}
