import Foundation
@testable import FAHYBRIK

// EL ESCENARIO DE «AL TERMINAR DE CORRER» — la carrera que la pantalla lee.
//
// SE ELIGE LA SERIE, y no es una elección estética. Para un 6×800 la pregunta del
// atleta no es «¿cuál fue mi ritmo medio?», es «¿las hice?»: un reloj no puede
// contestarla porque no sabe qué le pidieron, y aquí están las dos mitades. Es la
// pantalla gastando la única ventaja que tiene, así que es la que hay que mirar.
//
// LA TRAZA SE GENERA CON LA FORMA QUE TIENE UNA SERIE DE VERDAD: dientes de
// sierra en el ritmo, pulso que sube dentro de cada repetición y baja en el trote,
// calentamiento y vuelta a la calma a los lados. Una traza plana dibujaría una
// curva que en producción no existe, y entonces no se puede juzgar el acabado del
// gráfico que ocupa media pantalla.
//
// LOS TIEMPOS SE ACUMULAN, NO SE ESCRIBEN. El inicio de cada tramo sale de sumar
// lo que duró el anterior: escritos a mano, el primer cambio de ritmo los deja
// descuadrados contra la traza y la curva pinta las marcas donde no fueron.
enum EscenariosDeLaCarrera {

    /// Los s/km de las seis repeticiones de trabajo. Las dos últimas se van —como
    /// se va una serie— y por eso el veredicto es «4 de 6» con sesgo lento.
    private static let ritmosDeTrabajo: [Double] = [205, 208, 210, 212, 224, 218]
    /// Lo que el coach pidió: entre 3:20 y 3:35 el kilómetro.
    private static let banda = (rapido: 200.0, lento: 215.0)
    private static let metrosPorRepeticion: Double = 800
    private static let troteS: Double = 120
    private static let ritmoDeTrote: Double = 350
    private static let calentamientoS: Double = 480
    private static let ritmoDeCalentamiento: Double = 330
    private static let vueltaALaCalmaS: Double = 358
    private static let ritmoDeVuelta: Double = 360

    // MARK: - La carrera

    /// UN 6×800 CORRIDO ENTERO, con sus trotes grabados y el objetivo del coach en
    /// las dos partes: el trabajo contra su banda de ritmo y la recuperación contra
    /// la suya. En carrera el «parado» rara vez se hace, así que el trote se
    /// prescribe igual que el trabajo — y se juzga igual.
    static var series: Carrera {
        let tramos = repeticiones
        let finDeLasSeries = (tramos.last.map { $0.inicioS + $0.duracionS }) ?? calentamientoS
        let duracion = finDeLasSeries + vueltaALaCalmaS

        return Carrera(
            titulo: "Series 6×800",
            cuando: "Hoy",
            momento: .alTerminar,
            prescrito: "6×800 a 3:20–3:35 · trote 2:00",
            objetivo: .ritmo(rapidoSkm: banda.rapido, lentoSkm: banda.lento),
            objetivoRecuperacion: .ritmo(rapidoSkm: 330, lentoSkm: 390),
            superficie: .calle,
            distanciaM: distancia,
            duracionS: duracion,
            // 158 ppm de media cae en Z3 con el umbral de 170: es la zona que tiñe
            // el lienzo entero, que es lo que más hace que la pantalla parezca esta
            // app. El color es dato, así que sale de aquí y no de una constante.
            fcMediaPpm: 158,
            fcMaxPpm: 184,
            desnivelM: 38,
            traza: traza(duracion: duracion),
            repeticiones: tramos,
            // Los cerró el entreno tramo a tramo. Un tramo INFERIDO del ritmo no se
            // puede leer igual, y por eso la certeza se declara bajo el troceado.
            certezaTramos: .marcados,
            // Los kilómetros de un 6×800 no dicen nada: el troceado es por
            // repetición, y las dos tablas juntas no se enseñan nunca.
            kilometros: [],
            zonasS: [1: 180, 2: 520, 3: 640, 4: 940, 5: 180],
            derivado: Carrera.Derivado(derivaPct: 4.2, bajadaPulsoPpm: 34),
            ruta: ruta,
            // Acaba de terminar: lo que dijo aún no lo ha dicho.
            dicho: nil
        )
    }

    /// Las bandas de pulso del atleta sobre un umbral medido de 170 ppm. `estimated`
    /// a falso porque este atleta SÍ hizo el test: es el caso que tiñe.
    static let zonasDePulso = HRZoneProfile(
        lthrBpm: 170,
        estimated: false,
        source: "test",
        sourceLabel: "Zonas de tu test de umbral",
        confidence: "measured",
        zones: [
            HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
            HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
            HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
            HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
            HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
        ]
    )

    // MARK: - Los tramos

    /// Trabajo y trote alternados, con el reloj acumulándose. Las recuperaciones
    /// heredan el número de la repetición que cierran, que es como las cuenta el
    /// atleta («el trote de la tercera»).
    static var repeticiones: [Repeticion] {
        var salida: [Repeticion] = []
        var reloj = calentamientoS

        for (i, skm) in ritmosDeTrabajo.enumerated() {
            let n = i + 1
            let duracion = skm * metrosPorRepeticion / 1000
            salida.append(Repeticion(
                n: n, papel: .trabajo, modo: nil,
                inicioS: reloj, duracionS: duracion,
                distanciaM: metrosPorRepeticion, ritmoSkm: skm,
                fcMediaPpm: 168 + Double(i) * 2.4,
                // 0 = LLANO MEDIDO, que no es lo mismo que nulo: un nulo retira el
                // veredicto de ritmo igual que lo haría una cuesta.
                pendientePct: 0,
                veredicto: skm <= banda.lento ? .dentro : .fueraLento,
                veredictoDuracion: .completa
            ))
            reloj += duracion

            guard n < ritmosDeTrabajo.count else { continue }
            salida.append(Repeticion(
                n: n, papel: .recuperacion, modo: .trote,
                inicioS: reloj, duracionS: troteS,
                distanciaM: troteS / ritmoDeTrote * 1000, ritmoSkm: ritmoDeTrote,
                fcMediaPpm: 149, pendientePct: 0,
                veredictoRecuperacion: .controlada,
                veredictoDuracionRecuperacion: .controlada
            ))
            reloj += troteS
        }
        return salida
    }

    /// Lo que de verdad recorrió: calentamiento, las seis, los cinco trotes y la
    /// vuelta a la calma. Sumado de las mismas piezas que dibuja la pantalla, para
    /// que la cifra del cromo no contradiga a la tabla de debajo.
    static var distancia: Double {
        let trabajo = Double(ritmosDeTrabajo.count) * metrosPorRepeticion
        let trotes = Double(ritmosDeTrabajo.count - 1) * troteS / ritmoDeTrote * 1000
        let calentamiento = calentamientoS / ritmoDeCalentamiento * 1000
        let vuelta = vueltaALaCalmaS / ritmoDeVuelta * 1000
        return (trabajo + trotes + calentamiento + vuelta).rounded()
    }

    // MARK: - El archivo

    /// LA SEÑAL, MUESTREADA CADA 5 s. Ritmo y pulso salen del mismo reloj que los
    /// tramos: se pregunta en qué tramo cae cada instante y se muestrea eso. Así la
    /// curva y el peine de debajo no pueden discrepar.
    ///
    /// El pulso no salta: sube dentro de la repetición y baja en el trote con un
    /// retraso, que es como se comporta de verdad y lo que hace que la curva se lea
    /// como una serie en vez de como un diente de sierra dibujado a mano.
    static func traza(duracion: Double, cada paso: Double = 5) -> Traza {
        let tramos = repeticiones
        var ritmo: [Muestra] = []
        var pulso: [Muestra] = []
        var ppm: Double = 108

        for t in stride(from: 0.0, through: duracion, by: paso) {
            let tramo = tramos.first { t >= $0.inicioS && t < $0.inicioS + $0.duracionS }
            let objetivoSkm: Double
            let objetivoPpm: Double
            switch tramo?.papel {
            case .trabajo:
                objetivoSkm = tramo?.ritmoSkm ?? banda.rapido
                objetivoPpm = tramo?.fcMediaPpm ?? 172
            case .recuperacion:
                objetivoSkm = ritmoDeTrote
                objetivoPpm = 146
            case nil:
                let calentando = t < calentamientoS
                objetivoSkm = calentando ? ritmoDeCalentamiento : ritmoDeVuelta
                objetivoPpm = calentando ? 138 : 124
            }
            // El pulso persigue su objetivo en vez de saltar a él: un 12 % del hueco
            // por muestra da los ~30 s de retraso que tiene de verdad.
            ppm += (objetivoPpm - ppm) * 0.12
            ritmo.append(Muestra(t: t, v: objetivoSkm))
            pulso.append(Muestra(t: t, v: ppm.rounded()))
        }
        return Traza(ritmo: ritmo, pulso: pulso)
    }

    /// UNA VUELTA A UN PARQUE, normalizada a 0..1 y teñida por la zona en que se
    /// corrió cada trozo. Es un recorrido cerrado porque una serie se hace dando
    /// vueltas, no en línea recta.
    static var ruta: [PuntoRuta] {
        let n = 96
        return (0..<n).map { i in
            let vuelta = Double(i) / Double(n) * 2 * .pi
            // Un óvalo achatado: la forma de una pista o de un lago, no un círculo.
            let x = 0.5 + 0.44 * cos(vuelta)
            let y = 0.5 + 0.30 * sin(vuelta * 2 + 0.6) * 0.6 + 0.24 * sin(vuelta)
            // Cuatro trozos por vuelta: se alterna fuerte y suave como en la sesión.
            let fuerte = (i / 8) % 2 == 0
            return PuntoRuta(x: x, y: min(max(y, 0.04), 0.96), zona: fuerte ? 4 : 2)
        }
    }
}
