import Foundation

// LAS VUELTAS DE UN CORRER CONTINUO — espejo de `kit-reloj/secuencia.ts` (la
// vuelta automática por km) y de `gancho.ts#vuelta` (la vuelta a mano).
//
// El motor no parte un rodaje en vueltas (M-límite): la vuelta automática y la
// vuelta a mano («Vuelta») son del vivo. Se llevan aquí, desde la sesión (su
// crono y sus metros corridos), y NO cierran el paso: un rodaje sigue siendo UN
// paso. La tarjeta que sale encima dura `duracionS`.

extension Vivo {

    struct AvisoDeVuelta: Equatable {
        var titulo: String
        var valor: String
        var pie: String
        var hasta: Double
    }

    struct RegistroVueltas: Equatable {
        /// Lo que dura la tarjeta de la vuelta encima del vivo (s).
        static let duracionS: Double = 4

        private(set) var vueltas: [Vuelta] = []
        private(set) var aviso: AvisoDeVuelta? = nil
        private var kmN = 0
        /// Cuándo empezó el km en curso; `nil` si se empezó a mirar a mitad de un km (no se sabe).
        private var kmDesdeT: Double? = nil
        private var tramosN = 0
        private var tramoDesdeT: Double = 0
        private var tramoDesdeM: Double = 0
        private var arrancado = false
        /// El paso de vuelta automática que se está mirando. Otro distinto (el rodaje que llega tras un
        /// calentamiento) re-ancla la cuenta: sin ello, su primer km mediría desde el arranque de la sesión.
        private var pasoAuto: String? = nil

        init() {}

        /// Otro vistazo a la sesión: si el paso lleva vuelta automática y se ha
        /// cruzado otro km, su vuelta y su tarjeta. Devuelve la vuelta nueva.
        @discardableResult
        mutating func observar(_ p: Paso, sesionT: Double, sesionM: Double?, ppm: Double?) -> Vuelta? {
            let m = sesionM ?? 0
            if !arrancado {
                // Se empieza a mirar a mitad de sesión (la app vuelve a primer plano): lo ya corrido no se
                // anuncia, y el km a medias no tiene tiempo honesto: su vuelta se calla y cuenta la siguiente.
                arrancado = true
                let cada = p.vueltaAutoM ?? 0
                kmN = cada > 0 ? Int(m / cada) : 0
                kmDesdeT = (cada > 0 && m - Double(kmN) * cada >= 1) ? nil : sesionT
                tramoDesdeT = sesionT
                tramoDesdeM = m
                pasoAuto = p.vueltaAutoM != nil ? p.id : nil
                return nil
            }
            guard let cada = p.vueltaAutoM, cada > 0 else { return nil }
            if pasoAuto != p.id {
                pasoAuto = p.id
                kmN = Int(m / cada)
                kmDesdeT = (m - Double(kmN) * cada >= 1) ? nil : sesionT
                return nil
            }
            let km = Int(m / cada)
            guard km > kmN else { return nil }
            guard let desde = kmDesdeT else { kmN = km; kmDesdeT = sesionT; return nil }
            let seg = sesionT - desde
            let v = Vuelta(n: km, clase: .km, segundos: seg, metros: cada, ritmo: seg * 1000 / cada, ppm: ppm, veredicto: nil)
            kmN = km
            kmDesdeT = sesionT
            vueltas.append(v)
            aviso = AvisoDeVuelta(titulo: "Kilómetro \(km)", valor: fmtReloj(seg), pie: "ritmo del km", hasta: sesionT + Self.duracionS)
            return v
        }

        /// «Vuelta» pulsado: la vuelta va desde la anterior (o desde que se empezó a mirar).
        mutating func aMano(sesionT: Double, sesionM: Double?, ppm: Double?) {
            let m = sesionM ?? tramoDesdeM
            let seg = sesionT - tramoDesdeT
            let metros = Swift.max(0, m - tramoDesdeM)
            let ritmo: Double? = metros > 50 ? seg / (metros / 1000) : nil
            tramosN += 1
            vueltas.append(Vuelta(n: tramosN, clase: .tramo, segundos: seg, metros: metros.rounded(), ritmo: ritmo, ppm: ppm, veredicto: nil))
            tramoDesdeT = sesionT
            tramoDesdeM = m
            aviso = AvisoDeVuelta(titulo: "Vuelta \(tramosN)", valor: fmtReloj(seg), pie: "\(fmtRitmo(ritmo)) /km", hasta: sesionT + Self.duracionS)
        }

        /// El km que se está corriendo (para la página Vueltas): su número y lo que
        /// lleva. `segundos` es `nil` si se empezó a mirar a mitad de km (no se sabe).
        func kmEnCurso(sesionT: Double) -> (n: Int, segundos: Double?) {
            (kmN + 1, kmDesdeT.map { sesionT - $0 })
        }

        func avisoVigente(_ sesionT: Double) -> AvisoDeVuelta? {
            guard let a = aviso, a.hasta > sesionT else { return nil }
            return a
        }
    }
}
