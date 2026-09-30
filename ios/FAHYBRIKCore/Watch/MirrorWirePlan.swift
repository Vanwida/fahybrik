import Foundation

// EL PLAN Y EL CURSOR DEL ESPEJO — F2 de «correr en la muñeca» (DECISIONS 2026-09-30).
//
// Hasta aquí el móvil mandaba a la muñeca frases ya redactadas y un `tramo` en
// dato, y la muñeca pintaba una cara PROPIA (`RodajeLamina`) que solo se parece a
// la de en solitario. Ahora el móvil manda dos cosas:
//   · el PLAN (`MirrorPlanVivo`): los pasos del entreno, las zonas y las reglas de
//     aviso del coach. Pesa lo que pesa la sesión y se manda pocas veces;
//   · el CURSOR (`MirrorCursor`, dentro de cada trama): en qué paso estás y desde
//     cuándo. Pesa unas decenas de bytes y viaja con cada trama.
// Con las dos, la muñeca produce el MISMO `Vivo.CuadroMuneca` que en solitario
// (`Vivo.EspejoMuneca`), con los relojes calculados en local desde anclas.
//
// Todo es ADITIVO (`JSONDecoder` ignora claves que no conoce): un móvil viejo no
// manda ni plan ni cursor y el reloj nuevo cae a lo que pinta hoy; un móvil nuevo
// sigue rellenando `tramo` y el reloj viejo ignora lo nuevo.

extension MirrorWire {

    /// Lo que el móvil sabe hacer con los comandos nuevos (`MirrorStateFrame.capacidades`).
    /// Solo se anuncia lo que el motor atiende de verdad: prometer un botón que no
    /// hace nada es mentir a alguien que corre.
    enum Capacidad {
        /// `CommandKind.newLap`: cortar una vuelta a mano.
        static let vuelta = "vuelta"
        /// `CommandKind.undo`.
        static let deshacer = "deshacer"
        /// `CommandKind.plus30`.
        static let mas30 = "mas30"
        /// El móvil calla su voz cuando la muñeca anuncia `CommandKind.vozMuneca`.
        static let vozCalla = "voz-calla"
        /// `CommandKind.anotar`: lo que la muñeca declara de una serie en el descanso (reps, carga, RIR o RPE).
        static let anotar = "anotar"
    }

    /// Cuánto se aguanta sin trama antes de marcar «viejo» lo que depende del móvil
    /// (modelo §3: «no llega en 5 s»). Es una COMPARACIÓN al pintar, no un temporizador:
    /// el estado del enlace sigue siendo solo de Apple (FH-56).
    static let datoViejoTrasS: Double = 5

    /// Cada cuánto, como mucho, el móvil reenvía el plan aunque la muñeca lo pida:
    /// protege el presupuesto del canal (ver `Presupuesto`).
    static let planReenvioMinS: Double = 5

    /// EL PRESUPUESTO DEL CANAL. Apple lo dice en `HKWorkoutSession.h`: «The maximum
    /// amount of data that can be sent is 100 KB in any given 10-second time window»;
    /// pasado eso el envío devuelve error. Las tramas van a ≤ 1 por segundo (~1,5 KB).
    enum Presupuesto {
        static let bytesPorVentana = 100_000
        static let ventanaS: Double = 10
        /// El plan, empaquetado, no debe pasar de un cuarto de la ventana: deja sitio a
        /// las tramas y a un reenvío. Si una sesión se pasara, el móvil NO lo manda y
        /// la muñeca cae a la cara de siempre (honesto, no roto).
        static let planMaxBytes = bytesPorVentana / 4
    }
}

// MARK: - El cursor

/// Phone → watch, dentro de cada trama: DÓNDE ESTÁ el entreno en el plan de la muñeca.
///
/// Solo lleva lo que la muñeca no puede saber por sí sola. Lo que mide ELLA (el
/// tiempo, el pulso, y los metros y el ritmo de un paso que se corre con GPS) no
/// viaja: `hecho`, `ritmo` y `sesionM` van únicamente cuando los mide un aparato
/// que lleva el móvil (la cinta enchufada, un ergómetro). Lo demás, en local.
struct MirrorCursor: Codable, Equatable {
    /// El plan al que apunta `i`. Distinto del que tiene la muñeca = otro plan (o
    /// aún sin plan): no se pinta, se pide.
    let planHash: String
    /// Índice del paso vivo en `pasos`.
    let i: Int
    /// Segundos DENTRO del paso al emitir. Es el ancla del reloj local del paso.
    let enPasoS: Double
    /// Segundos de la sesión al emitir (sin pausas). Ancla del reloj local de la sesión.
    let sesionS: Double
    let pausado: Bool
    /// El entreno acabó (los relojes no corren).
    var terminado: Bool = false
    /// Los relojes del motor están parados SIN que el atleta haya pausado: la puerta de
    /// un bloque esperando «Empezar», o el motor esperando una decisión. Sin esto la
    /// muñeca seguiría contando en local un paso que el móvil tiene congelado.
    var parado: Bool = false
    /// La cuenta de ARRANQUE del motor: segundos que quedan del 3-2-1 al emitir.
    /// La de entre pasos la calcula la muñeca desde el plan.
    var cuentaS: Double? = nil
    /// Lo hecho del paso en la unidad de su medida, SOLO si lo mide el móvil.
    var hecho: Double? = nil
    /// Ritmo actual (s/km), SOLO si lo mide el móvil (la cinta).
    var ritmo: Double? = nil
    /// Metros de la sesión, SOLO si los mide el móvil.
    var sesionM: Double? = nil
    /// El monitor de la máquina de ergo (remo, ski, bici) cuando el móvil lo tiene enlazado: sin él, la muñeca dice
    /// «lo dices tú». ADITIVO: un móvil viejo no lo manda y el ergo se pinta sin monitor (honesto).
    var maquina: MirrorMaquina? = nil

    /// ¿Los relojes locales corren? No, en pausa, acabado o parado.
    var quieto: Bool { pausado || terminado || parado }

    private enum Clave: String, CodingKey {
        case planHash, i, enPasoS, sesionS, pausado, terminado, parado, cuentaS, hecho, ritmo, sesionM, maquina
    }

    init(planHash: String, i: Int, enPasoS: Double, sesionS: Double, pausado: Bool, terminado: Bool = false, parado: Bool = false,
         cuentaS: Double? = nil, hecho: Double? = nil, ritmo: Double? = nil, sesionM: Double? = nil, maquina: MirrorMaquina? = nil) {
        self.planHash = planHash
        self.i = i
        self.enPasoS = enPasoS
        self.sesionS = sesionS
        self.pausado = pausado
        self.terminado = terminado
        self.parado = parado
        self.cuentaS = cuentaS
        self.hecho = hecho
        self.ritmo = ritmo
        self.sesionM = sesionM
        self.maquina = maquina
    }

    /// Lo opcional que falta se lee como ausente y `terminado` como «no»: un móvil que
    /// mañana cambie un campo no puede hacer que un reloj tire la trama entera.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            planHash: try c.decode(String.self, forKey: .planHash),
            i: try c.decode(Int.self, forKey: .i),
            enPasoS: try c.decode(Double.self, forKey: .enPasoS),
            sesionS: try c.decode(Double.self, forKey: .sesionS),
            pausado: try c.decode(Bool.self, forKey: .pausado),
            terminado: try c.decodeIfPresent(Bool.self, forKey: .terminado) ?? false,
            parado: try c.decodeIfPresent(Bool.self, forKey: .parado) ?? false,
            cuentaS: try c.decodeIfPresent(Double.self, forKey: .cuentaS),
            hecho: try c.decodeIfPresent(Double.self, forKey: .hecho),
            ritmo: try c.decodeIfPresent(Double.self, forKey: .ritmo),
            sesionM: try c.decodeIfPresent(Double.self, forKey: .sesionM),
            maquina: try? c.decodeIfPresent(MirrorMaquina.self, forKey: .maquina)
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(planHash, forKey: .planHash)
        try c.encode(i, forKey: .i)
        try c.encode(enPasoS, forKey: .enPasoS)
        try c.encode(sesionS, forKey: .sesionS)
        try c.encode(pausado, forKey: .pausado)
        // Lo que es su valor por defecto no se escribe: la trama pesa lo que dice.
        if terminado { try c.encode(true, forKey: .terminado) }
        if parado { try c.encode(true, forKey: .parado) }
        try c.encodeIfPresent(cuentaS, forKey: .cuentaS)
        try c.encodeIfPresent(hecho, forKey: .hecho)
        try c.encodeIfPresent(ritmo, forKey: .ritmo)
        try c.encodeIfPresent(sesionM, forKey: .sesionM)
        try c.encodeIfPresent(maquina, forKey: .maquina)
    }
}

/// Lo que da el monitor de la máquina enlazada en el móvil: el /500, los vatios, las paladas y las calorías de ahora.
/// Solo viaja mientras hay monitor; `tipo` es `Vivo.Maquina.Tipo.rawValue`.
struct MirrorMaquina: Codable, Equatable {
    var tipo: String
    var split500: Double? = nil
    var vatios: Double? = nil
    var cadencia: Double? = nil
    var cal: Double? = nil

    var maquina: Vivo.Maquina.Tipo? { Vivo.Maquina.Tipo(rawValue: tipo) }
}

// MARK: - El plan

/// Phone → watch (`MessageType.plan`): el plan del entreno en pasos. Es el
/// `Vivo.PlanVivo` que el móvil construye con `Vivo.planDe(_ sesion:)` —el MISMO que
/// usa la muñeca en solitario— más lo que hizo falta saber para construirlo.
struct MirrorPlanVivo: Codable, Equatable {
    /// Huella del contenido (ver `huella`). Cursor y plan se emparejan por ella.
    let planHash: String
    let pasos: [Vivo.Paso]
    let zonas: Vivo.ZonasCoach?
    let reglas: Vivo.ReglasAviso
    /// Los umbrales de nombre de la carrera con los que se construyeron `pasos`
    /// (método del coach, con defecto). Ya están aplicados en los pasos: viajan para
    /// que quien los lea sepa con cuáles se nombró la sesión.
    let umbrales: Vivo.UmbralesCorrer
    /// Calle o cinta (enchufada o no): decide quién mide los metros de cada paso.
    let entorno: RunEnvironment?

    init(plan: Vivo.PlanVivo, entorno: RunEnvironment?, umbrales: Vivo.UmbralesCorrer = Vivo.umbralesCorrerDefecto) {
        pasos = plan.pasos
        zonas = plan.zonas
        reglas = plan.reglas
        self.umbrales = umbrales
        self.entorno = entorno
        planHash = Self.huella(pasos: pasos, zonas: zonas, reglas: reglas, umbrales: umbrales, entorno: entorno)
    }

    /// El plan tal como lo entiende el motor de pantalla.
    var plan: Vivo.PlanVivo { Vivo.PlanVivo(pasos: pasos, zonas: zonas, reglas: reglas) }

    private enum Clave: String, CodingKey { case planHash, pasos, zonas, reglas, umbrales, entorno }

    /// Sin `reglas` ni `umbrales` se entienden los del defecto (un coach que no ha tocado nada).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        planHash = try c.decode(String.self, forKey: .planHash)
        pasos = try c.decode([Vivo.Paso].self, forKey: .pasos)
        zonas = try c.decodeIfPresent(Vivo.ZonasCoach.self, forKey: .zonas)
        reglas = try c.decodeIfPresent(Vivo.ReglasAviso.self, forKey: .reglas) ?? Vivo.reglasAvisoDefecto
        umbrales = try c.decodeIfPresent(Vivo.UmbralesCorrer.self, forKey: .umbrales) ?? Vivo.umbralesCorrerDefecto
        entorno = try c.decodeIfPresent(RunEnvironment.self, forKey: .entorno)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(planHash, forKey: .planHash)
        try c.encode(pasos, forKey: .pasos)
        try c.encodeIfPresent(zonas, forKey: .zonas)
        try c.encode(reglas, forKey: .reglas)
        try c.encode(umbrales, forKey: .umbrales)
        try c.encodeIfPresent(entorno, forKey: .entorno)
    }

    // MARK: La huella

    private struct Cuerpo: Encodable {
        let pasos: [Vivo.Paso]
        let zonas: Vivo.ZonasCoach?
        let reglas: Vivo.ReglasAviso
        let umbrales: Vivo.UmbralesCorrer
        let entorno: RunEnvironment?
    }

    /// FNV-1a de 64 bits sobre el contenido con las claves ORDENADAS: la misma huella
    /// en cualquier proceso y aparato (el orden de un diccionario no lo es). No es
    /// criptografía: solo tiene que distinguir un plan de otro.
    private enum Fnv {
        static let base: UInt64 = 0xcbf2_9ce4_8422_2325
        static let primo: UInt64 = 0x0000_0100_0000_01b3
    }

    static func huella(pasos: [Vivo.Paso], zonas: Vivo.ZonasCoach?, reglas: Vivo.ReglasAviso,
                       umbrales: Vivo.UmbralesCorrer, entorno: RunEnvironment?) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let bytes = (try? encoder.encode(Cuerpo(pasos: pasos, zonas: zonas, reglas: reglas, umbrales: umbrales, entorno: entorno))) ?? Data()
        var h = Fnv.base
        for b in bytes { h = (h ^ UInt64(b)) &* Fnv.primo }
        return String(h, radix: 16)
    }
}
