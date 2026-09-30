import Foundation

// EL DIRECTOR — de lo que pasa en el estado vivo a los EVENTOS que se sienten (P1, P5).
//
// P1: los hápticos salen de las TRANSICIONES del estado, en la muñeca, iguales con móvil o
// sin él. P5: un evento, un háptico. Esto es esa regla, pura y sin WatchKit: recibe el estado
// vivo de ahora (`EstadoVivo`, el mismo que pintan el iPhone y la muñeca, sea del motor local
// o del espejo) y devuelve los eventos que ese instante produce respecto al anterior. Qué
// vibra y qué se dice lo decide `componer` (Vivo+Eventos.swift) con la tabla del §4; cómo se
// toca cada vibración, `Vivo+Haptica.swift`. Espejo de `kit-reloj/secuencia.ts` (`cerrar`,
// `entradaEn`, `avanzar`), con una diferencia: allí el motor CIERRA el paso y sabe qué emite;
// aquí solo se MIRA el estado, así que cada evento se deduce de un cambio entre dos miradas.
//
// Lo que es MÉTODO del coach no está aquí: la holgura, la histéresis, la cadencia (20 s), la
// gracia de la zona, el preaviso (10 s / 100 m, solo en pasos de ≥ 30 s), si se avisa en el
// calentamiento o en la recuperación y hacia qué lado avisa cada objetivo (`Objetivo.avisa`)
// viajan en `EstadoVivo.reglas` y en el plan (`ReglasAviso`, `Vivo+SentidoAviso.swift`).
//
// La VOZ es de F4: cada evento lleva su frase como DATO (`Emitido.voz`); quien dirige decide si
// la reproduce. Aquí no se dice nada.
//
// Una mirada a mitad de sesión (la app vuelve a primer plano, la muñeca se une al espejo tarde)
// no anuncia lo ya pasado: la primera mirada solo se anota, salvo el GO de un entreno que
// acaba de empezar.

extension Vivo {

    /// Lo que el director recuerda entre una mirada y la siguiente. Valor puro: quien dirige
    /// guarda uno por sesión y se lo pasa a `dirigir`.
    struct MemoriaDirector: Equatable {
        /// ¿Ya hubo una mirada? Antes de ella nada se anuncia.
        var visto = false
        /// El paso de la última mirada y su índice y bloque.
        var paso: Paso?
        var indice = 0
        /// El último paso que se dejó atrás: es el de la serie cuyo resultado se dice al cerrarse.
        var pasoCerrado: Paso?
        var aviso: EstadoAviso = Vivo.avisoInicial
        /// El paso cuyo preaviso ya sonó (suena UNA vez por paso).
        var preavisado: String?
        /// El paso cuyo GO ya se dio (un paso no tiene dos).
        var goDado: String?
        var cuentaVista: Int?
        var terminado = false
        var enlace: Enlace = .solo
        var vueltasVistas = 0
        var kmVistos = 0
        /// Sube en cada emisión: es la `n` de `Emision`.
        var n = 0

        init() {}

        /// Junta una cola de eventos en UNA emisión (un háptico, las voces encadenadas), o `nil` si no hay ninguno.
        mutating func componer(_ cola: [Emitido]) -> Emision? {
            guard !cola.isEmpty else { return nil }
            n += 1
            return Vivo.componer(n, cola)
        }
    }

    // MARK: - La mirada

    /// UNA mirada al estado: los eventos que produce respecto a la anterior (`m`), en el orden
    /// en que ocurren. Después, `m.componer` los junta en lo que vibra.
    ///
    /// `registro` son las vueltas por km del correr continuo (`RegistroVueltas`): el km lo cruza
    /// el vivo y no el motor (un rodaje sigue siendo UN paso), así que llega aparte.
    static func dirigir(_ m: inout MemoriaDirector, _ e: EstadoVivo, registro: RegistroVueltas? = nil) -> [Emitido] {
        guard !e.pasos.isEmpty else { return [] }
        let p = e.paso
        let primera = !m.visto
        let cambio = !primera && m.paso?.id != p.id
        // Un paso ATRÁS es un deshacer: lo que se dio por hecho ya no lo está y no se anuncia nada.
        let atras = cambio && e.i < m.indice
        let cerrado = cambio ? m.paso : m.pasoCerrado
        var out: [Emitido] = []

        // El enlace con el móvil (solo existe en el espejo: en solitario no hay nada que perder).
        if !primera {
            if m.enlace != .sinEnlace, e.enlace == .sinEnlace { out.append(Emitido(evento: .enlace)) }
            if m.enlace == .sinEnlace, e.enlace != .sinEnlace { out.append(Emitido(evento: .enlaceRecuperado)) }
        }
        m.enlace = e.enlace

        // El resultado de la serie cerrada: solo si dice algo (un veredicto, o el tiempo de una serie por metros).
        if !primera, !atras, e.vueltas.count > m.vueltasVistas, let v = e.vueltas.last, let c = cerrado,
           principal(c) != nil, v.veredicto != nil || c.medida.tipo == .distancia {
            out.append(Emitido(evento: .finSerie, voz: vozFinSerie(c, v)))
        }
        m.vueltasVistas = e.vueltas.count

        // El paso cambia: bloque hecho y la entrada al paso nuevo (GO, recupera…).
        if cambio, !atras {
            if let anterior = m.paso, let a = anterior.bloque, let b = p.bloque, a != b { out.append(Emitido(evento: .bloque)) }
            out.append(entradaEn(p, siguiente: e.siguiente))
            if p.rol == .trabajo || (p.rol == .transicion && p.roxzone != nil) { m.goDado = p.id }
        }

        // La sesión acaba.
        if !primera, e.terminado, !m.terminado { out.append(Emitido(evento: .sesion, voz: vozSesion)) }
        m.terminado = e.terminado

        // El 3-2-1. En pausa la cuenta desaparece del estado sin haber acabado: no se toma por fin de cuenta.
        if !e.pausado {
            if let c = e.cuenta {
                if c != m.cuentaVista { out.append(Emitido(evento: .cuenta)) }
            } else if m.cuentaVista != nil, !cambio, p.rol == .trabajo, m.goDado != p.id {
                // La cuenta de ARRANQUE del motor acaba y el paso sigue siendo el mismo: es el GO.
                out.append(Emitido(evento: .go, voz: vozInicio(p)))
                m.goDado = p.id
            }
            m.cuentaVista = e.cuenta
        }

        // Un entreno que acaba de empezar sin cuenta de arranque: su primer paso de trabajo es el GO.
        if primera, e.i == 0, p.rol == .trabajo, e.cuenta == nil, !e.pausado, !e.terminado, e.lecturas.t < duracionGoS {
            out.append(Emitido(evento: .go, voz: vozInicio(p)))
            m.goDado = p.id
        }

        // El preaviso (10 s / 100 m). Una pantalla que se abre ya dentro de él, no lo repite con otra cifra.
        if !e.pausado, e.cuenta == nil, !e.terminado, m.preavisado != p.id, let falta = preavisoDe(p, e.lecturas, e.reglas) {
            m.preavisado = p.id
            if !primera { out.append(Emitido(evento: .preaviso, voz: vozPreaviso(p, falta: falta))) }
        }

        // Fuera de objetivo: UN veredicto (el techo pasado manda), con holgura, confirmación y cadencia.
        if cambio { m.aviso = avisoInicial }
        if !e.pausado, e.cuenta == nil, !e.terminado, !cambio {
            let o = principal(p)
            if o != nil || objetivoDe(p, .techo) != nil {
                let v = veredictoDelPaso(p, e.lecturas, e.zonas, e.reglas)
                let d = decidirAviso(m.aviso, v, t: e.lecturas.t, p, eje: o?.eje, e.reglas)
                m.aviso = d.estado
                if let ev = d.evento { out.append(Emitido(evento: ev)) }
            }
        }

        // La vuelta automática por km del correr continuo.
        if let registro {
            let kms = registro.vueltas.filter { $0.clase == .auto }
            if !primera, kms.count > m.kmVistos, let k = kms.last { out.append(Emitido(evento: .vuelta, voz: vozVueltaAuto(k.n, k.vueltaM, k.segundos))) }
            m.kmVistos = kms.count
        }

        if cambio { m.pasoCerrado = m.paso }
        m.visto = true
        m.paso = p
        m.indice = e.i
        return out
    }

    /// Lo que emite la entrada en un paso: GO, recupera o la transición (`entradaEn` del kit).
    static func entradaEn(_ p: Paso, siguiente: Paso?) -> Emitido {
        switch p.rol {
        case .trabajo: return Emitido(evento: .go, voz: vozInicio(p))
        case .recuperacion: return Emitido(evento: .recupera, voz: vozRecupera(p, siguiente: siguiente))
        case .descanso: return Emitido(evento: .recupera, voz: vozDescanso(p))
        // La Roxzone es parte de la carrera (P10): se entra con el GO, como a una estación. Colocarse o dar
        // la puntuación es dejar de trabajar.
        case .transicion: return Emitido(evento: p.roxzone != nil ? .go : .recupera, voz: vozTransicion(p, siguiente: siguiente))
        }
    }
}
