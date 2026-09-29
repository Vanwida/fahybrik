import Foundation

// LA CODIFICACIÓN ESTABLE DEL PASO — lo que viaja por el cable (el mensaje
// `plan` de la fase 2: el móvil dice a la muñeca cuáles son los pasos) y lo que
// lee el examen de oro contra el kit web.
//
// Por qué a mano y no sintetizada:
//   · Las CLAVES son un contrato: se llaman como las del kit (`paso.ts`) y no
//     dependen de cómo se llame la propiedad dentro de Swift. Renombrar una
//     propiedad no rompe el cable; cambiar estas claves sí, y lo dice el test
//     (`VivoCodableTests`, el JSON literal).
//   · Lo que tiene valor por defecto se LEE con su defecto si falta (`fase`,
//     `cierre`, `objetivos`, `aproximacion`…). Un campo nuevo con defecto que
//     mañana escriba un móvil nuevo no puede hacer que un reloj viejo tire el
//     plan entero, ni al revés. Lo desconocido, `JSONDecoder` lo ignora.
//   · Lo opcional que es `nil` NO se escribe: el mensaje pesa lo que dice.
//
// Los tipos sin valores por defecto (`Medida`, `Objetivo`, `Posicion`…) llevan
// la conformancia sintetizada junto a su declaración (`Vivo+Paso.swift`).

extension Vivo.Paso: Codable {

    private enum Clave: String, CodingKey {
        case id, clase, rol, fase, medida, objetivos, posicion, nombre, modoRecupera, entorno
        case carga, maquina, tempo, cue, cierre, vueltaAutoM, bloque, roxzone, wod, fuerza, dobles, origen
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            id: try c.decode(String.self, forKey: .id),
            clase: try c.decode(Vivo.Clase.self, forKey: .clase),
            rol: try c.decode(Vivo.Rol.self, forKey: .rol),
            fase: try c.decodeIfPresent(Vivo.Fase.self, forKey: .fase) ?? .principal,
            medida: try c.decode(Vivo.Medida.self, forKey: .medida),
            objetivos: try c.decodeIfPresent([Vivo.Objetivo].self, forKey: .objetivos) ?? [],
            posicion: try c.decodeIfPresent(Vivo.Posicion.self, forKey: .posicion),
            nombre: try c.decodeIfPresent(String.self, forKey: .nombre),
            modoRecupera: try c.decodeIfPresent(Vivo.ModoRecupera.self, forKey: .modoRecupera),
            entorno: try c.decodeIfPresent(Vivo.Entorno.self, forKey: .entorno),
            carga: try c.decodeIfPresent(Vivo.Carga.self, forKey: .carga),
            maquina: try c.decodeIfPresent(Vivo.Maquina.self, forKey: .maquina),
            tempo: try c.decodeIfPresent(Vivo.Tempo.self, forKey: .tempo),
            cue: try c.decodeIfPresent(String.self, forKey: .cue),
            cierre: try c.decodeIfPresent(Vivo.Cierre.self, forKey: .cierre) ?? .medida,
            vueltaAutoM: try c.decodeIfPresent(Double.self, forKey: .vueltaAutoM),
            bloque: try c.decodeIfPresent(Int.self, forKey: .bloque),
            roxzone: try c.decodeIfPresent(Vivo.SentidoRoxzone.self, forKey: .roxzone),
            wod: try c.decodeIfPresent(Vivo.InfoWod.self, forKey: .wod),
            fuerza: try c.decodeIfPresent(Vivo.FichaFuerza.self, forKey: .fuerza),
            dobles: try c.decodeIfPresent(Vivo.Dobles.self, forKey: .dobles),
            origen: try c.decodeIfPresent(Vivo.Origen.self, forKey: .origen)
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(id, forKey: .id)
        try c.encode(clase, forKey: .clase)
        try c.encode(rol, forKey: .rol)
        try c.encode(fase, forKey: .fase)
        try c.encode(medida, forKey: .medida)
        try c.encode(objetivos, forKey: .objetivos)
        try c.encodeIfPresent(posicion, forKey: .posicion)
        try c.encodeIfPresent(nombre, forKey: .nombre)
        try c.encodeIfPresent(modoRecupera, forKey: .modoRecupera)
        try c.encodeIfPresent(entorno, forKey: .entorno)
        try c.encodeIfPresent(carga, forKey: .carga)
        try c.encodeIfPresent(maquina, forKey: .maquina)
        try c.encodeIfPresent(tempo, forKey: .tempo)
        try c.encodeIfPresent(cue, forKey: .cue)
        try c.encode(cierre, forKey: .cierre)
        try c.encodeIfPresent(vueltaAutoM, forKey: .vueltaAutoM)
        try c.encodeIfPresent(bloque, forKey: .bloque)
        try c.encodeIfPresent(roxzone, forKey: .roxzone)
        try c.encodeIfPresent(wod, forKey: .wod)
        try c.encodeIfPresent(fuerza, forKey: .fuerza)
        try c.encodeIfPresent(dobles, forKey: .dobles)
        try c.encodeIfPresent(origen, forKey: .origen)
    }
}

// MARK: - De dónde sale el paso en el motor

extension Vivo.Origen: Codable {

    private enum Clave: String, CodingKey { case segmento, ventana, descanso, puntuacion }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            segmento: try c.decode(Int.self, forKey: .segmento),
            ventana: try c.decode(Ventana.self, forKey: .ventana),
            descanso: try c.decodeIfPresent(Bool.self, forKey: .descanso) ?? false,
            puntuacion: try c.decodeIfPresent(Bool.self, forKey: .puntuacion) ?? false
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(segmento, forKey: .segmento)
        try c.encode(ventana, forKey: .ventana)
        if descanso { try c.encode(true, forKey: .descanso) }
        if puntuacion { try c.encode(true, forKey: .puntuacion) }
    }
}

/// `{"tipo":"emom","i":3}`: un caso con número lleva `i`; `segmento` no lleva nada.
extension Vivo.Origen.Ventana: Codable {

    private enum Clave: String, CodingKey { case tipo, i }
    private enum Tipo: String, Codable { case segmento, emom, ronda, pierna, estacion, serie }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        let tipo = try c.decode(Tipo.self, forKey: .tipo)
        if tipo == .segmento { self = .segmento; return }
        let i = try c.decode(Int.self, forKey: .i)
        switch tipo {
        case .segmento: self = .segmento
        case .emom: self = .emom(i)
        case .ronda: self = .ronda(i)
        case .pierna: self = .pierna(i)
        case .estacion: self = .estacion(i)
        case .serie: self = .serie(i)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        switch self {
        case .segmento: try c.encode(Tipo.segmento, forKey: .tipo)
        case let .emom(i): try c.encode(Tipo.emom, forKey: .tipo); try c.encode(i, forKey: .i)
        case let .ronda(i): try c.encode(Tipo.ronda, forKey: .tipo); try c.encode(i, forKey: .i)
        case let .pierna(i): try c.encode(Tipo.pierna, forKey: .tipo); try c.encode(i, forKey: .i)
        case let .estacion(i): try c.encode(Tipo.estacion, forKey: .tipo); try c.encode(i, forKey: .i)
        case let .serie(i): try c.encode(Tipo.serie, forKey: .tipo); try c.encode(i, forKey: .i)
        }
    }
}

// MARK: - Las uniones: una clave `formato` o `tipo` y los campos planos, como en el kit

/// `{"formato":"emom","tarea":{…},"ciclo":[…],"ventanas":16,"ventanaS":60}`: la
/// misma forma que el kit web (`InfoWod`), así el doble y el reloj se entienden.
extension Vivo.InfoWod: Codable {

    private enum Clave: String, CodingKey {
        case formato, tarea, ciclo, ventanas, ventanaS, tareas, duracionS, capS, trabajoS, descansoS, rondas
        case inicio, incremento, tope
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        switch try c.decode(Formato.self, forKey: .formato) {
        case .emom:
            self = .emom(tarea: try c.decode(Vivo.Tarea.self, forKey: .tarea), ciclo: try c.decode([Vivo.Tarea].self, forKey: .ciclo),
                         ventanas: try c.decode(Int.self, forKey: .ventanas), ventanaS: try c.decode(Double.self, forKey: .ventanaS))
        case .amrap:
            self = .amrap(tareas: try c.decode([Vivo.Tarea].self, forKey: .tareas), duracionS: try c.decode(Double.self, forKey: .duracionS))
        case .puntuacion:
            self = .puntuacion(tareas: try c.decode([Vivo.Tarea].self, forKey: .tareas), duracionS: try c.decode(Double.self, forKey: .duracionS))
        case .fortime:
            self = .fortime(tarea: try c.decodeIfPresent(Vivo.Tarea.self, forKey: .tarea), capS: try c.decodeIfPresent(Double.self, forKey: .capS))
        case .pared:
            self = .pared(trabajoS: try c.decode(Double.self, forKey: .trabajoS), descansoS: try c.decode(Double.self, forKey: .descansoS),
                          rondas: try c.decode(Int.self, forKey: .rondas))
        case .deathby:
            self = .deathby(tarea: try c.decode(Vivo.Tarea.self, forKey: .tarea), inicio: try c.decode(Int.self, forKey: .inicio),
                            incremento: try c.decode(Int.self, forKey: .incremento), ventanaS: try c.decode(Double.self, forKey: .ventanaS),
                            tope: try c.decodeIfPresent(Int.self, forKey: .tope))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(formato, forKey: .formato)
        switch self {
        case let .emom(tarea, ciclo, ventanas, ventanaS):
            try c.encode(tarea, forKey: .tarea); try c.encode(ciclo, forKey: .ciclo)
            try c.encode(ventanas, forKey: .ventanas); try c.encode(ventanaS, forKey: .ventanaS)
        case let .amrap(tareas, duracionS), let .puntuacion(tareas, duracionS):
            try c.encode(tareas, forKey: .tareas); try c.encode(duracionS, forKey: .duracionS)
        case let .fortime(tarea, capS):
            try c.encodeIfPresent(tarea, forKey: .tarea); try c.encodeIfPresent(capS, forKey: .capS)
        case let .pared(trabajoS, descansoS, rondas):
            try c.encode(trabajoS, forKey: .trabajoS); try c.encode(descansoS, forKey: .descansoS); try c.encode(rondas, forKey: .rondas)
        case let .deathby(tarea, inicio, incremento, ventanaS, tope):
            try c.encode(tarea, forKey: .tarea); try c.encode(inicio, forKey: .inicio); try c.encode(incremento, forKey: .incremento)
            try c.encode(ventanaS, forKey: .ventanaS); try c.encodeIfPresent(tope, forKey: .tope)
        }
    }
}

/// `{"tipo":"kg","min":150,"max":160}`, `{"tipo":"corporal"}`…
extension Vivo.CargaFuerza: Codable {

    private enum Clave: String, CodingKey { case tipo, min, max, pctMin, pctMax, rmKg, ultimaKg, lastre }
    private enum Tipo: String, Codable { case kg, rm, corporal, tuya }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        switch try c.decode(Tipo.self, forKey: .tipo) {
        case .kg: self = .kg(min: try c.decode(Double.self, forKey: .min), max: try c.decode(Double.self, forKey: .max))
        case .rm:
            self = .rm(pctMin: try c.decode(Double.self, forKey: .pctMin), pctMax: try c.decode(Double.self, forKey: .pctMax),
                       rmKg: try c.decodeIfPresent(Double.self, forKey: .rmKg))
        case .corporal: self = .corporal
        case .tuya:
            self = .tuya(ultimaKg: try c.decodeIfPresent(Double.self, forKey: .ultimaKg), lastre: try c.decodeIfPresent(Bool.self, forKey: .lastre) ?? false)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        switch self {
        case let .kg(min, max):
            try c.encode(Tipo.kg, forKey: .tipo); try c.encode(min, forKey: .min); try c.encode(max, forKey: .max)
        case let .rm(pctMin, pctMax, rmKg):
            try c.encode(Tipo.rm, forKey: .tipo); try c.encode(pctMin, forKey: .pctMin); try c.encode(pctMax, forKey: .pctMax)
            try c.encodeIfPresent(rmKg, forKey: .rmKg)
        case .corporal:
            try c.encode(Tipo.corporal, forKey: .tipo)
        case let .tuya(ultimaKg, lastre):
            try c.encode(Tipo.tuya, forKey: .tipo); try c.encodeIfPresent(ultimaKg, forKey: .ultimaKg)
            if lastre { try c.encode(true, forKey: .lastre) }
        }
    }
}

// MARK: - Los tipos con valores por defecto

extension Vivo.FichaFuerza: Codable {

    private enum Clave: String, CodingKey { case ejercicio, carga, esfuerzo, porLado, aproximacion, pasoKg, vaciaKg }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            ejercicio: try c.decode(String.self, forKey: .ejercicio),
            carga: try c.decode(Vivo.CargaFuerza.self, forKey: .carga),
            esfuerzo: try c.decodeIfPresent(Vivo.EsfuerzoFuerza.self, forKey: .esfuerzo),
            porLado: try c.decodeIfPresent(PorLado.self, forKey: .porLado),
            aproximacion: try c.decodeIfPresent(Bool.self, forKey: .aproximacion) ?? false,
            pasoKg: try c.decodeIfPresent(Double.self, forKey: .pasoKg) ?? Vivo.fichaFuerzaDefecto.pasoKg,
            vaciaKg: try c.decodeIfPresent(Double.self, forKey: .vaciaKg)
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(ejercicio, forKey: .ejercicio)
        try c.encode(carga, forKey: .carga)
        try c.encodeIfPresent(esfuerzo, forKey: .esfuerzo)
        try c.encodeIfPresent(porLado, forKey: .porLado)
        try c.encode(aproximacion, forKey: .aproximacion)
        try c.encode(pasoKg, forKey: .pasoKg)
        try c.encodeIfPresent(vaciaKg, forKey: .vaciaKg)
    }
}

extension Vivo.Dobles: Codable {

    private enum Clave: String, CodingKey { case turno, pareja, estacion, tuyas, suyas, pctTuyo, nota }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            turno: try c.decode(Turno.self, forKey: .turno),
            pareja: try c.decodeIfPresent(String.self, forKey: .pareja),
            estacion: try c.decode(String.self, forKey: .estacion),
            tuyas: try c.decodeIfPresent(Int.self, forKey: .tuyas),
            suyas: try c.decodeIfPresent(Int.self, forKey: .suyas),
            pctTuyo: try c.decodeIfPresent(Int.self, forKey: .pctTuyo) ?? 100,
            nota: try c.decodeIfPresent(String.self, forKey: .nota)
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(turno, forKey: .turno)
        try c.encodeIfPresent(pareja, forKey: .pareja)
        try c.encode(estacion, forKey: .estacion)
        try c.encodeIfPresent(tuyas, forKey: .tuyas)
        try c.encodeIfPresent(suyas, forKey: .suyas)
        try c.encode(pctTuyo, forKey: .pctTuyo)
        try c.encodeIfPresent(nota, forKey: .nota)
    }
}

/// Los umbrales de nombre de la carrera (método del coach): cada uno con su
/// defecto, porque el coach puede haber tocado solo uno.
extension Vivo.UmbralesCorrer: Codable {

    private enum Clave: String, CodingKey { case tiradaDesdeS, tiradaDesdeM, strideHastaS, tempoDesdeZona }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        let defecto = Vivo.umbralesCorrerDefecto
        // Ausente = la del defecto; presente pero nulo = «nunca por zona».
        let tempo: Double?
        if c.contains(.tempoDesdeZona) { tempo = try c.decodeIfPresent(Double.self, forKey: .tempoDesdeZona) } else { tempo = defecto.tempoDesdeZona }
        self.init(
            tiradaDesdeS: try c.decodeIfPresent(Double.self, forKey: .tiradaDesdeS) ?? defecto.tiradaDesdeS,
            tiradaDesdeM: try c.decodeIfPresent(Double.self, forKey: .tiradaDesdeM) ?? defecto.tiradaDesdeM,
            strideHastaS: try c.decodeIfPresent(Double.self, forKey: .strideHastaS) ?? defecto.strideHastaS,
            tempoDesdeZona: tempo
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(tiradaDesdeS, forKey: .tiradaDesdeS)
        try c.encode(tiradaDesdeM, forKey: .tiradaDesdeM)
        try c.encode(strideHastaS, forKey: .strideHastaS)
        // «Nunca por zona» se escribe como nulo: no es lo mismo que «sin decir».
        if let t = tempoDesdeZona { try c.encode(t, forKey: .tempoDesdeZona) } else { try c.encodeNil(forKey: .tempoDesdeZona) }
    }
}

// MARK: - El plan entero

/// El plan del motor en pasos, tal como lo manda el móvil. Sin `reglas` se
/// entienden las del defecto (un coach que no ha tocado nada).
extension Vivo.PlanVivo: Codable {

    private enum Clave: String, CodingKey { case pasos, zonas, reglas }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Clave.self)
        self.init(
            pasos: try c.decode([Vivo.Paso].self, forKey: .pasos),
            zonas: try c.decodeIfPresent(Vivo.ZonasCoach.self, forKey: .zonas),
            reglas: try c.decodeIfPresent(Vivo.ReglasAviso.self, forKey: .reglas) ?? Vivo.reglasAvisoDefecto
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(pasos, forKey: .pasos)
        try c.encodeIfPresent(zonas, forKey: .zonas)
        try c.encode(reglas, forKey: .reglas)
    }
}
