import Foundation

// EL ESPEJO DE LA MUÑECA — el receptor. Con el móvil llevando el motor, la muñeca
// tiene DOS cosas del móvil (el plan, una vez; el cursor, en cada trama) y TODO lo
// demás suyo: el reloj, el pulso, los metros del GPS. De ellas produce el MISMO
// `Vivo.CuadroMuneca` que en solitario, llamando a la MISMA `Vivo.cuadroMuneca`
// (docs/reloj-muneca/modelo.md, P1: un estado vivo, un pintor).
//
//   · Los relojes NO se congelan entre tramas: el del paso y el de la sesión son
//     `ancla + lo que ha pasado desde que llegó la trama` (y se quedan quietos en
//     pausa). Cada trama re-basa el ancla.
//   · Los metros de un paso que se corre con GPS son `acumulado del builder − lo que
//     llevaba el builder al empezar el paso` (ancla de distancia). El ritmo actual
//     sale de la `VentanaDeRitmo` sobre esas mismas muestras.
//   · Lo que mide un aparato del móvil (cinta enchufada) viene en el cursor.
//   · Un dato que deja de llegar se MARCA viejo, nunca se congela en silencio: pasados
//     `MirrorWire.datoViejoTrasS` sin trama, el enlace se pinta «sin enlace · la
//     muñeca sigue grabando». Es una comparación al pintar, no un temporizador
//     (FH-56: el estado del enlace sigue siendo solo de Apple).
//   · Cuando no hay plan, cursor, o el cursor apunta a otro plan, NO se inventa: el
//     cuadro es `nil` y el reloj cae a la cara de siempre; el plan se pide una vez.
//
// Struct de valor, Foundation puro: compila en el reloj y se prueba sin aparato. El
// reloj lo guarda en `WatchPrimaryOwner` y lo alimenta desde sus eventos.

extension Vivo {

    struct EspejoMuneca {

        /// En qué punto está el espejo. Solo `vivo` produce cuadro.
        enum Estado: Equatable {
            /// Nadie ha mandado plan ni cursor: un móvil viejo, o aún no ha llegado nada.
            case sinPlan
            /// Hay plan pero las tramas no traen cursor (o el plan está vacío).
            case sinCursor
            /// El cursor apunta a un plan que la muñeca no tiene (`hash`): se pide.
            case planDesconocido(hash: String)
            case vivo
        }

        /// La última trama con cursor y cuándo llegó.
        struct Trama: Equatable {
            var cursor: MirrorCursor
            var recibidoEn: Date
            /// Lo que el móvil dice de «último paso» (`MirrorStateFrame.isFinalStep`), si lo dice.
            var finalSegunMovil: Bool? = nil
        }

        /// Lo que solo sabe el reloj en el momento de pintar y no es una muestra continua.
        struct Locales: Equatable {
            var gps: EstadoGps = .noAplica
            var cadencia: Double? = nil
            /// Apple dice que el móvil se fue (`didDisconnect…`): sin enlace YA, sin esperar los 5 s.
            var enlaceApplePerdido = false
            var entorno = EntornoMuneca()
        }

        /// Mecanismo nuestro, cada constante con su porqué.
        enum Mecanismo {
            /// Cuánta historia de distancia se guarda: la trama llega con retardo de segundos
            /// como mucho, y la ancla de un paso se busca en ese margen. Más, gasta memoria; menos, la pierde.
            static let historiaDistanciaS: Double = 30
        }

        private struct Pedido: Equatable {
            var hash: String
            var en: Date
        }

        private(set) var plan: MirrorPlanVivo?
        private(set) var trama: Trama?
        /// Los pasos ya cerrados, con lo que la muñeca midió de cada uno (página Vueltas).
        private(set) var parciales: [Parcial] = []
        /// Las vueltas por km y a mano (`RegistroVueltas`), las mismas que en solitario.
        private(set) var registro = RegistroVueltas()
        /// Lo declarado en el descanso de fuerza y lo que la muñeca tiene abierto. La muñeca es su dueña; cada dato
        /// declarado además viaja al móvil (`MirrorWire.CommandKind.anotar`), que lo escribe en su motor.
        private(set) var anotar = AnotarMuneca()
        /// Lo que el atleta marca en el WOD (las ventanas hechas, las rondas del AMRAP y la puntuación de la campana).
        /// La muñeca es su dueña; lo que el motor del móvil necesita saber viaja como comando.
        private(set) var wod = EstadoWod()
        /// Los minutos completos de un death by que el reloj acaba de cazar (un minuto se cerró sin marcar); lo toma
        /// quien manda a `deathByFail` al móvil, una vez.
        private var cazadoCon: Int?

        private var ventana = VentanaDeRitmo()
        private var muestras: [MuestraDeDistancia] = []
        private var historiaRecortada = false
        private var acumuladoM: Double = 0
        private var pausasAcumuladasS: Double = 0
        private var pausadoDesde: Date?
        private var anclaM: Double?
        private var pulso: Double?
        private var pulsos: [Double] = []
        private var pulsoSuma: Double = 0
        private var pulsoN = 0
        private var pedido: Pedido?
        /// La muñeca se unió con el entreno ya andando (se relanzó): lo que llevaba
        /// medido antes se ignora, y no se puede decir desde dónde cuenta un paso a medias.
        private let unidoATarde: Bool

        init(unidoATarde: Bool = false) { self.unidoATarde = unidoATarde }

        // MARK: - Estado

        var estado: Estado {
            guard let t = trama else { return plan == nil ? .sinPlan : .sinCursor }
            guard let plan, plan.planHash == t.cursor.planHash else { return .planDesconocido(hash: t.cursor.planHash) }
            return plan.pasos.isEmpty ? .sinCursor : .vivo
        }

        /// ¿El plan vivo manda? Con él, el director de la muñeca (hápticos, voz) sale de las
        /// transiciones del estado y las señales del móvil (`hapticCue`) se ignoran: si no, vibraría dos veces.
        var dirigeElPlan: Bool { estado == .vivo }

        /// El paso vivo, o `nil` si no hay cuadro. La pila lo usa para volver a su primera página cuando
        /// cambia (`Paso.id`) y para saber qué acción del momento toca (`Vivo.clavePorDefecto`); sale del
        /// mismo índice que el cuadro.
        var pasoVivo: Paso? {
            guard estado == .vivo, let plan, let t = trama else { return nil }
            return plan.pasos[Swift.min(Swift.max(0, t.cursor.i), plan.pasos.count - 1)]
        }

        /// ¿El paso vivo es el último del plan? `nil` = no se sabe (sin cuadro): quien cierra pregunta
        /// (`Vivo.CierreSeguro`, falla hacia preguntar). Lo dice el cursor del plan y, si lo dice, el móvil.
        var ultimoPaso: Bool? {
            guard estado == .vivo, let plan, let t = trama else { return nil }
            return CierreSeguro.esUltimoPaso(indice: t.cursor.i, de: plan.pasos.count, marcaDelMovil: t.finalSegunMovil)
        }

        /// El `hapticCue` de una trama, o `nil` si el plan vivo ya lo dirige.
        func hapticAplicable(_ f: MirrorStateFrame) -> String? { dirigeElPlan ? nil : f.hapticCue }

        /// La huella del plan que falta, una vez (y otra pasado `MirrorWire.planReenvioMinS` sin
        /// respuesta). Quien la reciba manda `sync` al móvil. `nil` = nada que pedir.
        mutating func planAPedir(en ahora: Date) -> String? {
            guard case let .planDesconocido(hash) = estado else { return nil }
            if let p = pedido, p.hash == hash, ahora.timeIntervalSince(p.en) < MirrorWire.planReenvioMinS { return nil }
            pedido = Pedido(hash: hash, en: ahora)
            return hash
        }

        // MARK: - Lo que llega del móvil

        /// Otro plan (o el primero): reemplaza al anterior. Los pasos cerrados solo se conservan
        /// si el plan sigue siendo el mismo entreno (mismos pasos, otra zona o regla).
        mutating func recibirPlan(_ nuevo: MirrorPlanVivo) {
            if let actual = plan, actual.pasos.map(\.id) != nuevo.pasos.map(\.id) { parciales = []; anotar = AnotarMuneca(); wod = EstadoWod() }
            plan = nuevo
        }

        /// Una trama del móvil, recibida en `ahora`. Sin cursor (un móvil viejo) el espejo no manda.
        mutating func recibirTrama(_ f: MirrorStateFrame, en ahora: Date) {
            guard let c = f.cursor else { trama = nil; return }
            let previa = trama
            seguirPausa(c, en: ahora)
            let tau = eje(ahora)
            if let previa {
                if c.i != previa.cursor.i { cambiarDePaso(desde: previa, hacia: c, tau: tau) }
            } else {
                // Con el entreno recién empezado, el primer paso cuenta desde que la muñeca empezó a medir.
                anclaM = (!unidoATarde && c.i == 0) ? 0 : nil
                reiniciarPulsoDelPaso()
            }
            trama = Trama(cursor: c, recibidoEn: ahora, finalSegunMovil: f.isFinalStep)
            observarVueltas(en: ahora)
        }

        // MARK: - Lo que mide la muñeca

        /// Metros nuevos del builder (el delta que ya entrega `onDistanceDelta`).
        mutating func anotarDistancia(deltaM: Double, en ahora: Date) {
            guard deltaM.isFinite, deltaM >= 0 else { return }
            acumuladoM += deltaM
            let t = eje(ahora)
            muestras.append(MuestraDeDistancia(t: t, metros: acumuladoM))
            recortarHistoria(hasta: t)
            ventana.anotar(t: t, metros: acumuladoM)
            observarVueltas(en: ahora)
        }

        mutating func anotarPulso(_ bpm: Int, en ahora: Date) {
            guard bpm > 0 else { return }
            let v = Double(bpm)
            pulso = v
            pulsos.append(v)
            if pulsos.count > Self.pulsosParaTendencia { pulsos.removeFirst(pulsos.count - Self.pulsosParaTendencia) }
            pulsoSuma += v
            pulsoN += 1
        }

        /// «Vuelta» pulsado en la muñeca: la vuelta va desde la anterior. Quien lo llama manda también `newLap` al móvil.
        mutating func vueltaAMano(en ahora: Date) {
            guard let t = trama else { return }
            let s = sesionS(t, ahora)
            registro.aMano(sesionT: s, sesionM: metrosDeSesion(t), ppm: pulso)
        }

        // MARK: - El cuadro

        /// TODO lo que pinta la muñeca ahora, o `nil` si no hay con qué (la vista cae a la cara de siempre).
        func cuadro(ahora: Date, locales: Locales = Locales()) -> CuadroMuneca? {
            guard let e = estadoVivo(ahora: ahora, locales: locales) else { return nil }
            return Vivo.cuadroMuneca(e, registro: registro, entorno: locales.entorno, anotar: anotar, wod: wod)
        }

        /// ¿Pinta la cara nueva el paso vivo? Sin cuadro, no.
        var cubreLaMuneca: Bool {
            guard estado == .vivo, let plan, let t = trama else { return false }
            return Vivo.cubreLaMuneca(plan.pasos, Swift.min(Swift.max(0, t.cursor.i), plan.pasos.count - 1))
        }

        // MARK: - El WOD: lo que marca la muñeca

        /// «Hecho» (EMOM, death by): marca la ventana en la muñeca; el reloj la cierra solo.
        mutating func marcarHecha(ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            wod.marcar(e.paso, t: e.lecturas.t)
        }

        /// «Ronda hecha» (AMRAP): cuenta una ronda.
        mutating func rondaHecha(ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            wod.anotarRonda(e.paso, t: e.lecturas.t)
        }

        /// La corona en la campana: mueve las reps de la puntuación.
        mutating func girarPuntuacion(_ dir: Int, ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            wod.girarReps(dir, e)
        }

        /// La puntuación de la campana tal como se guardaría ahora.
        func puntuacion(ahora: Date) -> MirrorPuntuacion? {
            guard let e = estadoVivo(ahora: ahora), case .puntuacion? = e.paso.wod else { return nil }
            let d = Vivo.dialDeCampana(e, wod)
            return MirrorPuntuacion(rondas: d.rondas, reps: d.reps)
        }

        /// Si el reloj cazó un death by desde la última vez que se preguntó: los minutos que se marcaron.
        mutating func tomarCazado() -> Int? {
            defer { cazadoCon = nil }
            return cazadoCon
        }

        // MARK: - La anotación (fuerza): cada gesto devuelve lo declarado, que el dueño manda al móvil

        mutating func abrirSerie(_ k: Int, ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            anotar.abrir(k, e)
        }

        mutating func enfocarDato(_ campo: CampoAnotar, ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            anotar.enfocar(campo, e)
        }

        mutating func girarDato(_ dir: Int, ahora: Date) -> Declaracion? {
            guard let e = estadoVivo(ahora: ahora) else { return nil }
            return anotar.girar(dir, e)
        }

        mutating func confirmarAnotacion(ahora: Date) -> [Declaracion] {
            guard let e = estadoVivo(ahora: ahora) else { return [] }
            return anotar.confirmar(e)
        }

        mutating func reabrirAnotacion(ahora: Date) {
            guard let e = estadoVivo(ahora: ahora) else { return }
            anotar.reabrir(e)
        }

        /// El estado vivo del que sale el cuadro: el mismo tipo que produce el motor en solitario.
        func estadoVivo(ahora: Date, locales: Locales = Locales()) -> EstadoVivo? {
            guard estado == .vivo, let plan, let t = trama else { return nil }
            let c = t.cursor
            let enlazada = c.maquina?.maquina
            // Sin el monitor del móvil, los metros y el /500 de una máquina los dice el atleta.
            let pasos = enlazada == nil && !plan.pasos.contains(where: { $0.maquina != nil }) ? plan.pasos : Vivo.segunEnlace(plan.plan, maquina: enlazada).pasos
            let i = Swift.min(Swift.max(0, c.i), pasos.count - 1)
            let p = pasos[i]
            let corre = c.quieto ? 0 : Swift.max(0, ahora.timeIntervalSince(t.recibidoEn))
            let tPaso = c.enPasoS + corre
            let movil = Vivo.loMideElMovil(p, entorno: plan.entorno)

            var hecho: Double?
            switch p.medida.tipo {
            case .tiempo: hecho = tPaso
            case .distancia:
                // Cero metros no es una medida (igual que el motor): «—» hasta que el builder cuente el primero.
                let propios = anclaM.map { acumuladoM - $0 }.flatMap { $0 > 0 ? $0 : nil }
                hecho = movil ? c.hecho : propios
            case .cal, .reps: hecho = c.hecho
            case .abierta: hecho = nil
            }

            let lecturas = Lecturas(
                t: tPaso,
                hecho: hecho,
                ritmo: movil ? c.ritmo : ventana.ritmo(ahora: eje(ahora)),
                ppm: pulso,
                ppmTendencia: Vivo.tendenciaDe(muestras: pulsos),
                split500: c.maquina?.split500,
                vatios: c.maquina?.vatios,
                cadencia: c.maquina?.cadencia ?? locales.cadencia,
                cal: c.maquina?.cal,
                gps: Vivo.usaGps(p) ? locales.gps : .noAplica
            )
            let motor: Int? = c.cuentaS.flatMap { $0 - corre > 0 ? Vivo.cuentaDelMotor(restanteS: $0 - corre) : nil }
            let (cuenta, go) = Vivo.cuentaYGo(pasos, i, lecturas, motor: motor, enPausa: c.pausado || c.terminado)
            let perdido = locales.enlaceApplePerdido || ahora.timeIntervalSince(t.recibidoEn) > MirrorWire.datoViejoTrasS

            return EstadoVivo(
                pasos: pasos,
                i: i,
                lecturas: lecturas,
                sesion: Vivo.sesionDe(t: c.sesionS + corre, corridos: metrosDeSesion(t) ?? 0),
                zonas: plan.zonas,
                reglas: plan.reglas,
                pausado: c.pausado,
                enlace: perdido ? .sinEnlace : .espejo,
                vueltas: Vivo.vueltasDe(pasos, parciales: parciales, zonas: plan.zonas, reglas: plan.reglas),
                parciales: parciales,
                cuenta: cuenta,
                go: go,
                terminado: c.terminado,
                maquinaEnlazada: enlazada
            )
        }

        // MARK: - Privado: el eje de tiempo activo

        private static let pulsosParaTendencia = 6

        /// El eje de tiempo de la muñeca SIN las pausas: una hora de pared menos lo pausado.
        /// Es el de la ventana del ritmo y el de las anclas de distancia; solo crece.
        private func eje(_ en: Date) -> Double {
            en.timeIntervalSinceReferenceDate - pausasAcumuladasS - (pausadoDesde.map { Swift.max(0, en.timeIntervalSince($0)) } ?? 0)
        }

        private mutating func seguirPausa(_ c: MirrorCursor, en ahora: Date) {
            let quieto = c.quieto
            if quieto, pausadoDesde == nil { pausadoDesde = ahora }
            else if !quieto, let desde = pausadoDesde {
                pausasAcumuladasS += Swift.max(0, ahora.timeIntervalSince(desde))
                pausadoDesde = nil
            }
        }

        private func sesionS(_ t: Trama, _ ahora: Date) -> Double {
            t.cursor.sesionS + (t.cursor.quieto ? 0 : Swift.max(0, ahora.timeIntervalSince(t.recibidoEn)))
        }

        /// Los metros de la sesión: los del móvil si los mide él (cinta), si no los del builder de la muñeca.
        private func metrosDeSesion(_ t: Trama) -> Double? {
            guard let plan else { return acumuladoM > 0 ? acumuladoM : nil }
            let i = Swift.min(Swift.max(0, t.cursor.i), plan.pasos.count - 1)
            let m = Vivo.loMideElMovil(plan.pasos[i], entorno: plan.entorno) ? (t.cursor.sesionM ?? 0) : acumuladoM
            return m > 0 ? m : nil
        }

        // MARK: - Privado: pasos cerrados y anclas

        private mutating func cambiarDePaso(desde previa: Trama, hacia c: MirrorCursor, tau: Double) {
            // El instante del cambio: hace `enPasoS` activos; nunca antes de la trama anterior.
            let tauCambio = Swift.max(eje(previa.recibidoEn), tau - c.enPasoS)
            if c.i > previa.cursor.i, let paso = pasoDe(previa.cursor) {
                // Un minuto de death by que el reloj cierra sin «hecho» es el último: te cazó.
                if let plan, Vivo.cazadoEn(plan.pasos, iCerrado: previa.cursor.i, hechas: wod.hechas) {
                    cazadoCon = Vivo.completosDeathBy(plan.pasos, wod.hechas)
                }
                let segundos = previa.cursor.enPasoS + (previa.cursor.quieto ? 0 : tauCambio - eje(previa.recibidoEn))
                let metros: Double?
                if Vivo.loMideElMovil(paso, entorno: plan?.entorno) {
                    metros = paso.medida.tipo == .distancia ? previa.cursor.hecho : nil
                } else if let a = anclaM, let b = distanciaEn(tauCambio) { metros = Swift.max(0, b - a) }
                else { metros = nil }
                parciales.removeAll { $0.i == previa.cursor.i }
                parciales.append(Parcial(i: previa.cursor.i, segundos: segundos, metros: metros,
                                         ppm: pulsoN > 0 ? pulsoSuma / Double(pulsoN) : nil, hecho: nil))
                parciales.sort { $0.i < $1.i }
            } else if c.i < previa.cursor.i {
                // Un paso atrás (deshacer): lo que se dio por hecho ya no lo está.
                parciales.removeAll { $0.i >= c.i }
            }
            anclaM = distanciaEn(tauCambio)
            reiniciarPulsoDelPaso()
        }

        private func pasoDe(_ c: MirrorCursor) -> Paso? {
            guard let plan, plan.planHash == c.planHash, plan.pasos.indices.contains(c.i) else { return nil }
            return plan.pasos[c.i]
        }

        private mutating func reiniciarPulsoDelPaso() {
            pulsoSuma = 0
            pulsoN = 0
        }

        /// Los metros acumulados de la muñeca en el instante `tau` del eje activo, o `nil` si no se sabe.
        private func distanciaEn(_ tau: Double) -> Double? {
            guard let ultima = muestras.last else { return acumuladoM }
            if tau >= ultima.t { return ultima.metros }
            guard let primera = muestras.first, tau >= primera.t else { return historiaRecortada ? nil : 0 }
            guard let k = muestras.lastIndex(where: { $0.t <= tau }), k + 1 < muestras.count else { return ultima.metros }
            let a = muestras[k]
            let b = muestras[k + 1]
            guard b.t > a.t else { return a.metros }
            return a.metros + (b.metros - a.metros) * (tau - a.t) / (b.t - a.t)
        }

        private mutating func recortarHistoria(hasta t: Double) {
            let corte = t - Mecanismo.historiaDistanciaS
            // Se conserva la última muestra ANTERIOR al corte: es el origen del primer tramo.
            guard let k = muestras.lastIndex(where: { $0.t < corte }), k > 0 else { return }
            muestras.removeFirst(k)
            historiaRecortada = true
        }

        // MARK: - Privado: vueltas por km

        private mutating func observarVueltas(en ahora: Date) {
            guard let plan, let t = trama, plan.planHash == t.cursor.planHash, plan.pasos.indices.contains(t.cursor.i) else { return }
            registro.observar(plan.pasos[t.cursor.i], sesionT: sesionS(t, ahora), sesionM: metrosDeSesion(t), ppm: pulso)
        }
    }
}
