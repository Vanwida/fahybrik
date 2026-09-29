import Foundation

// MARK: - WristMethod — el método del COACH que la muñeca necesita para correr
//
// Espejo Codable de `shared/domain/coach/wrist-method.ts` (`WristMethod`). Llega en el
// mismo cuerpo que la sesión (`AssignmentDetail.wristMethod`, clave `wrist_method`) y, por
// tanto, al reloj por `WatchTodayPayload.detailJson` — no hay un segundo canal.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0). Cómo se juzga un paso, cómo se filtra el ritmo, la
// ventana de 10 s, el techo de 20:00/km, los 5 s para deshacer: MECANISMO, vive en el código
// del reloj. Lo de aquí es MÉTODO: cuánta holgura se da antes de avisar, cada cuánto se
// repite, hacia dónde avisa un rodaje, cada cuántos metros se cierra una vuelta, dónde
// empieza una tirada, si de calentar a las series se pasa solo o hasta pulsar, qué parte de
// una serie cortada cuenta como hecha y cómo se llama cada RPE.
//
// El servidor manda SIEMPRE el valor efectivo y completo (el defecto del producto si el coach
// no tocó nada), en las unidades que el reloj usa por dentro: segundos, metros, fracción 0…1.
// Sin `wrist_method` (una sesión cacheada antes de esta tanda, un servidor anterior) el
// decode da nil y el reloj usa su reserva, que son los mismos números.
//
// WIRE. `APIClient` y `WatchWire.detailDecoder` usan `convertFromSnakeCase`: `pace_s` →
// `paceS`, `split500_s` → `split500S`, `long_run_s` → `longRunS`.
//
// Este fichero SOLO decodifica. Convertirlo a `Vivo.ReglasAviso` / `Vivo.UmbralesCorrer` es
// del director del reloj (`FAHYBRIKCore/Vivo`), que es quien conoce esos tipos.

struct WristMethod: Codable, Equatable {

    struct Alerts: Codable, Equatable {
        /// Holgura fuera de la banda antes de contar como fuera, por eje (en la unidad del eje).
        struct Slack: Codable, Equatable {
            var paceS: Double
            var hrBpm: Double
            var split500S: Double
            var watts: Double
            var cadenceSpm: Double
        }
        var slack: Slack
        /// Mínimo entre dos avisos del mismo paso.
        var gapS: Double
        /// Segundos seguidos fuera de banda antes del primer aviso.
        var confirmS: Double
        /// Segundos al empezar un paso a zona sin avisar «aprieta» (el pulso va con retraso).
        var zoneGraceS: Double
        var inWarmup: Bool
        var inRecovery: Bool
        /// Hacia dónde avisa un rodaje a zona cuando el tramo no trae su propio `alert`.
        /// Solo llegan `ninguno`, `arriba` o `ambos`; uno desconocido cae a `arriba`.
        var continuousZone: RunAlertDirection
        /// Preaviso del final de un paso: por tiempo y por distancia.
        var prewarnS: Double
        var prewarnM: Double
        /// Un paso más corto que esto no lleva preaviso.
        var prewarnMinStepS: Double

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            slack = try c.decode(Slack.self, forKey: .slack)
            gapS = try c.decode(Double.self, forKey: .gapS)
            confirmS = try c.decode(Double.self, forKey: .confirmS)
            zoneGraceS = try c.decode(Double.self, forKey: .zoneGraceS)
            inWarmup = try c.decode(Bool.self, forKey: .inWarmup)
            inRecovery = try c.decode(Bool.self, forKey: .inRecovery)
            continuousZone = (try? c.decode(RunAlertDirection.self, forKey: .continuousZone)) ?? .arriba
            prewarnS = try c.decode(Double.self, forKey: .prewarnS)
            prewarnM = try c.decode(Double.self, forKey: .prewarnM)
            prewarnMinStepS = try c.decode(Double.self, forKey: .prewarnMinStepS)
        }
    }

    struct AutoLap: Codable, Equatable {
        /// Cada cuántos metros se cierra una vuelta sola. 0 = apagada.
        var everyM: Double
        /// En qué clases de sesión (`rodaje`, `tirada`, `tempo`, `progresivo`, `carrera`).
        /// Son cadenas y no un enum: una clase nueva de un servidor posterior no rompe el decode.
        var classes: [String]

        /// ¿Cierra vuelta sola en esta clase de sesión?
        func applies(toClass name: String) -> Bool { everyM > 0 && classes.contains(name) }
    }

    struct Run: Codable, Equatable {
        enum Gate: String, Codable, Equatable { case auto, manual }
        /// Un rodaje de al menos esto es una tirada (segundos)…
        var longRunS: Double
        /// …o de al menos esto (metros).
        var longRunM: Double
        /// Una serie de como mucho esto, dentro de un repetir, es un stride (segundos).
        var strideMaxS: Double
        /// De calentar a las series: solo (`auto`), o hasta que el atleta pulse (`manual`).
        var gate: Gate

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            longRunS = try c.decode(Double.self, forKey: .longRunS)
            longRunM = try c.decode(Double.self, forKey: .longRunM)
            strideMaxS = try c.decode(Double.self, forKey: .strideMaxS)
            gate = (try? c.decode(Gate.self, forKey: .gate)) ?? .auto
        }
    }

    struct Finish: Codable, Equatable {
        /// Fracción de lo prescrito (0…1) a partir de la cual una serie cortada a mano cuenta como hecha.
        var shortRepDoneFraction: Double
        /// Segundos quieto antes de guardar sola una sesión que ya acabó.
        var idleSaveS: Double
    }

    var alerts: Alerts
    var autoLap: AutoLap
    var run: Run
    var finish: Finish
    /// Once palabras, del RPE 0 al 10.
    var rpeWords: [String]

    /// La palabra de un RPE (0…10), o nil si la lista no llegó completa.
    func rpeWord(_ rpe: Int) -> String? {
        guard rpe >= 0, rpe < rpeWords.count else { return nil }
        return rpeWords[rpe]
    }
}
