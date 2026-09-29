import Foundation

// CORRER, LEÍDO — lo que el detalle de correr pinta, traducido del contrato (`screens/analiticas-familia-correr`)
// a lo que el servidor SÍ sirve (`progreso-correr.ts`). Puro y con test: la vista solo pinta.
//
//   sujeto             `progreso.correr`: la marca clave, la MISMA fila que la portada (Motor, el mejor esfuerzo
//                      del peldaño más largo comparable, o el ritmo del tipo de sesión que más repite)
//   tendencia          la serie semanal de esa fila
//   umbral             `correr.umbral`: el ritmo del que cuelgan las zonas y la carga, con su ancla
//   mejores esfuerzos  `correr.mejor.<metros>`: de 400 m a la media, con el periodo anterior detrás
//   motor y economía   `correr.motor` y `correr.desacople`
//   velocidad crítica  `capacidad.velocidad_critica`, `capacidad.deposito` y `correr.vdot`
//   por tipo de sesión `correr.tipo.<tipo>`: el ritmo de cada tipo contra sí mismo
//
// Lo que el doble firmó y el servidor NO sirve, y por tanto no se pinta (declarado en el informe): la tendencia
// del umbral semana a semana (el umbral es el vigente hoy, sin serie), los kilómetros por semana plan frente a
// hecho (no hay lectura de volumen de correr) y el día exacto de cada mejor (las series son semanales).

/// Un mejor esfuerzo de un peldaño de la escalera de correr, con lo que fue en el periodo anterior.
struct MejorEsfuerzo: Equatable, Identifiable {
    /// La clave estable del servidor (`correr.mejor.<clave>`): los metros sin el medio metro de la media.
    let clave: Int
    /// Cómo se llama el peldaño delante del atleta, tal como lo escribe el servidor: «400 m», «5 km», «Media maratón».
    let nombre: String
    let metros: Double
    let segundos: Double
    /// Lo que fue en el periodo anterior de igual longitud, cuando hubo esfuerzo en los dos.
    let anterior: Double?
    let cuando: DiaDeMarca
    /// Se corrió en cinta: la cinta no compite con la calle y lleva su propio récord.
    let enCinta: Bool
    /// Es la marca de la ventana contra su récord de siempre.
    let nuevo: Bool
    /// Ya no es de esta ventana: es el último que hubo.
    let viejo: Bool

    var id: Int { clave }
    /// El ritmo del esfuerzo en s/km: aritmética de unidades, no un juicio.
    var ritmoSKm: Double { segundos / metros * 1000 }
}

struct LecturaDeCorrer: Equatable {
    let sujeto: SujetoDeFamilia
    /// La fila de la familia: su serie es la tendencia.
    let fila: LecturaAnalitica?
    let umbral: LecturaAnalitica?
    /// Los peldaños con marca, de la distancia más corta a la más larga (los que el servidor declara sin dato no salen).
    let mejores: [MejorEsfuerzo]
    let motor: LecturaAnalitica?
    let desacople: LecturaAnalitica?
    let velocidadCritica: LecturaAnalitica?
    let deposito: LecturaAnalitica?
    let vdot: LecturaAnalitica?
    /// El ritmo por tipo de sesión, en el orden en que llegan.
    let porTipo: [LecturaAnalitica]
    let hoy: String

    static let prefijoMejor = "correr.mejor."
    static let prefijoTipo = "correr.tipo."
    static let idMotor = "correr.motor"
    static let idUmbral = "correr.umbral"
    static let idVdot = "correr.vdot"
    static let idDesacople = "correr.desacople"
    static let idVelocidadCritica = "capacidad.velocidad_critica"
    static let idDeposito = "capacidad.deposito"
    /// El servidor titula el ritmo de un tipo de sesión «Ritmo en rodajes».
    static let prefijoDeTitulo = "Ritmo en "

    var estado: EstadoDeFamilia { sujeto.estado }

    /// La fila ES el Motor: su serie ya se dibuja como tendencia y no se repite en «Motor y economía».
    var filaEsMotor: Bool { fila?.procedencia.de == motor?.procedencia.de && fila != nil }

    /// Los esfuerzos de ESTA ventana (la curva «esta ventana»): un dato viejo no es de ella.
    var curvaHoy: [MejorEsfuerzo] { mejores.filter { !$0.viejo } }
    /// La misma curva en el periodo anterior, en los peldaños donde hubo esfuerzo en los dos.
    var curvaAntes: [MejorEsfuerzo] { curvaHoy.filter { $0.anterior != nil } }
    /// La curva se dibuja con dos esfuerzos como mínimo: uno solo no es una curva.
    var hayCurva: Bool { curvaHoy.count >= 2 }

    static func desde(_ d: DetalleAnaliticas) -> LecturaDeCorrer {
        LecturaDeCorrer(
            sujeto: SujetoDeFamilia.desde(d, .correr),
            fila: d.fila,
            umbral: d.lectura(idUmbral),
            mejores: mejores(d),
            motor: d.lectura(idMotor),
            desacople: d.lectura(idDesacople),
            velocidadCritica: d.lectura(idVelocidadCritica),
            deposito: d.lectura(idDeposito),
            vdot: d.lectura(idVdot),
            porTipo: d.lecturas(prefijo: prefijoTipo).filter { $0.forma != .muda },
            hoy: d.hoy
        )
    }

    private static func mejores(_ d: DetalleAnaliticas) -> [MejorEsfuerzo] {
        d.lecturas(prefijo: prefijoMejor).compactMap { l -> MejorEsfuerzo? in
            guard l.estado == .medida, let dato = l.dato, dato.unidad == .segundos,
                  let clave = Int(l.id.dropFirst(prefijoMejor.count)), clave > 0 else { return nil }
            let enCinta = l.tituloEs.hasSuffix(" · cinta")
            var nombre = l.tituloEs.hasPrefix("Mejor ") ? String(l.tituloEs.dropFirst("Mejor ".count)) : l.tituloEs
            if enCinta { nombre = String(nombre.dropLast(" · cinta".count)) }
            return MejorEsfuerzo(
                clave: clave,
                nombre: nombre,
                metros: Double(clave),
                segundos: dato.valor,
                anterior: l.esViejo ? nil : l.comparacion?.anterior,
                cuando: l.diaDelMejor(ventana: d.ventana),
                enCinta: enCinta,
                nuevo: !l.esViejo && l.esRecordDeLaVentana,
                viejo: l.esViejo
            )
        }
        .sorted { $0.clave < $1.clave }
    }

    /// El nombre de un tipo de sesión sin el «Ritmo en » del servidor: «rodajes», «series».
    static func nombreDeTipo(_ l: LecturaAnalitica) -> String {
        l.tituloEs.hasPrefix(prefijoDeTitulo) ? String(l.tituloEs.dropFirst(prefijoDeTitulo.count)) : l.tituloEs
    }
}
