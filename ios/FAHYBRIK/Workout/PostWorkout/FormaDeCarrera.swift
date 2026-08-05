import Foundation

// LA FORMA DE UNA CARRERA — cálculo puro. Port del diseño aprobado
// `web/components/design-twin/tramos.ts` (pantalla `resumen-carrera` del doble).
//
// QUÉ FALLABA. El reloj de un atleta, después de un fartlek de 14,5 km, le
// enseñó «RITMO MEDIO 5:36/km». Ese número no describe ningún momento de esa
// carrera: es la media de los fuertes y los suaves, dos cosas distintas
// promediadas cruzando justo la frontera que las separa. Es la misma enfermedad
// que una FC media que era media de medias, o un reparto de zonas dividido entre
// la suma en vez de entre la duración.
//
// Apple y Garmin promedian porque NO SABEN qué formato estás haciendo. Nosotros
// sí: lo prescribió el coach y el motor cierra los tramos. Ahí está la ventaja, y
// este fichero es donde se gasta.
//
// LA LEY, y es lo único que hay que recordar de todo el fichero:
//
//   **La media se gana el derecho a ser el sujeto sólo si la carrera fue UNA
//   SOLA COSA.**
//
// Eso convierte «la media miente» —que es falso, porque en un rodaje continuo la
// media describe cada minuto— en una regla DECIDIBLE. Por eso lo que devuelve
// esta función no es «aquí van los tramos» sino UNA FORMA:
//
//   `uniforme`     — fue una sola cosa; la media es honesta y ES el sujeto.
//   `conContraste` — fueron dos; el sujeto es el par, nunca su promedio.
//   `noSeSabe`     — no se puede decomponer, y la pantalla lo dice.
//
// La vista no decide nada de esto: lee la forma. Así el resumen del teléfono y
// cualquier otra superficie que lea la misma carrera no pueden discrepar sobre
// quién es el sujeto.
//
// EL TERCER ESTADO NO ES EL CASO RARO. Hoy la app no guarda ninguna serie de
// ritmo (el polilínea de la ruta lleva coordenadas y ni un solo tiempo), así que
// una carrera sin tramos marcados —un rodaje suelto, o una sesión que corrió el
// reloj y llegó colapsada en un único lap— cae SIEMPRE en `noSeSabe`. Este
// módulo está escrito para el dato que hará falta y declara honestamente que hoy
// no lo tiene, en vez de rellenar el hueco con un promedio disfrazado.

enum FormaDeCarrera {

    // MARK: - Vocabulario

    /// Lo que se hace en un tramo. `parado` no es un ritmo: es un semáforo o una
    /// pérdida de señal, y por eso no puede entrar en ninguna media.
    enum TipoTramo: Equatable { case fuerte, suave, parado }

    /// La forma de la carrera entera — lo que decide quién es el sujeto.
    enum Forma: Equatable { case uniforme, conContraste, noSeSabe }

    /// De dónde salen las fronteras, y cuánto se puede uno fiar de ellas. Va a la
    /// pantalla tal cual: un tramo inferido no puede leerse igual que uno medido.
    enum Certeza: Equatable {
        /// Los cerró el motor: el coach los prescribió, o el atleta pulsó vuelta.
        case marcados
        /// Salieron del ritmo, con separación limpia y muestras de sobra.
        case detectados
        /// Salieron del ritmo, pero la separación o la densidad van justas.
        case estimados
    }

    /// Por qué no se pudo decomponer. Sólo con `forma == .noSeSabe`.
    enum Motivo: Equatable {
        /// No se guardó ninguna muestra de ritmo. El caso de producción HOY.
        case sinSerie
        /// Hay muestras, pero no bastan para resolver un tramo.
        case muestrasEscasas
    }

    /// Cómo aguantó de la primera mitad del trabajo a la segunda.
    enum Veredicto: Equatable { case aguantaste, deMenosAMas, seTeFue }

    /// La forma que el coach PRESCRIBIÓ. Es la ventaja que Apple no tiene: aunque
    /// no podamos decomponer la carrera, si el coach mandó contraste SABEMOS que
    /// la media es una mezcla, y eso se puede decir.
    enum FormaPrescrita: Equatable { case continua, conContraste }

    struct Muestra: Equatable {
        /// Segundos desde el inicio de la carrera.
        let t: Double
        /// Ritmo instantáneo en s/km. Nulo = parado o sin señal.
        let ritmoSkm: Double?

        init(t: Double, ritmoSkm: Double?) {
            self.t = t
            self.ritmoSkm = ritmoSkm
        }
    }

    /// Un tramo cuya frontera YA se conoce: la prescripción del coach expandida
    /// por el motor, o una vuelta que se cerró en su momento. No hay nada que
    /// detectar aquí, sólo que leer.
    struct TramoMarcado: Equatable {
        /// Un marcado no puede ser `parado`: nadie prescribe un semáforo. El tipo
        /// propio lo hace imposible en vez de dejarlo a un comentario.
        enum Tipo: Equatable {
            case fuerte, suave
            var tramo: TipoTramo { self == .fuerte ? .fuerte : .suave }
        }
        let tipo: Tipo
        let duracionS: Double
        /// Nulo = se cronometró pero no se midió distancia; entonces no hay ritmo.
        let distanciaM: Double?

        init(tipo: Tipo, duracionS: Double, distanciaM: Double?) {
            self.tipo = tipo
            self.duracionS = duracionS
            self.distanciaM = distanciaM
        }
    }

    struct Tramo: Equatable {
        let tipo: TipoTramo
        let desdeS: Double
        let hastaS: Double
        let duracionS: Double
        /// Nulo en `parado`, y en un marcado sin distancia.
        let ritmoSkm: Double?
        /// Su orden entre los de SU tipo, desde 1: «la 3.ª fuerte».
        let orden: Int
    }

    /// El agregado de un tipo de tramo: cuántos, a qué ritmo y cuánto tiempo.
    struct Grupo: Equatable {
        let n: Int
        let ritmoSkm: Double
        let duracionS: Double
        let distanciaM: Double
    }

    struct Aguante: Equatable {
        let primeraSkm: Double
        let ultimaSkm: Double
        /// s/km perdidos (+) o ganados (−) de la primera mitad del trabajo a la
        /// segunda.
        let derivaSkm: Double
        let veredicto: Veredicto
    }

    struct Lectura: Equatable {
        let forma: Forma
        let certeza: Certeza?
        let motivo: Motivo?
        let tramos: [Tramo]
        /// Si los tramos son UNA LECTURA o sólo el andamio de la detección.
        ///
        /// En un rodaje continuo el disparador igualmente trocea la serie —tiene
        /// que hacerlo para poder concluir que no hay frontera—, pero esos trozos
        /// no son repeticiones: son ruido con nombre. Pintarlos sería enseñar una
        /// estructura que el atleta no corrió. Lo decide el dominio y no la
        /// pantalla, para que las dos superficies no puedan discrepar.
        let tramosSonLectura: Bool
        let fuerte: Grupo?
        let suave: Grupo?
        /// s/km entre lo suave y lo fuerte. Es lo que hace que el ritmo fuerte
        /// signifique algo.
        let contrasteSkm: Double?
        /// Necesita al menos `Umbral.minTramosAguante` tramos fuertes: con dos es
        /// una anécdota.
        let aguante: Aguante?
        /// El ritmo medio de toda la carrera. Se sabe siempre: lo mide cualquier
        /// reloj.
        let mediaSkm: Double?
        /// La media promedia cruzando una frontera y por tanto no describe ningún
        /// momento. Es el campo del que cuelga la única frase que nos separa de
        /// Apple.
        let mediaEsMezcla: Bool
    }

    struct Carrera: Equatable {
        /// Lo que SIEMPRE se sabe.
        let distanciaM: Double
        let duracionS: Double
        /// La serie de ritmo. Vacía = lo que la app guarda hoy.
        let muestras: [Muestra]
        /// Fronteras ya conocidas. Ganan a la detección: no se infiere lo que se
        /// sabe.
        let marcados: [TramoMarcado]
        let formaPrescrita: FormaPrescrita?

        init(distanciaM: Double,
             duracionS: Double,
             muestras: [Muestra] = [],
             marcados: [TramoMarcado] = [],
             formaPrescrita: FormaPrescrita? = nil) {
            self.distanciaM = distanciaM
            self.duracionS = duracionS
            self.muestras = muestras
            self.marcados = marcados
            self.formaPrescrita = formaPrescrita
        }
    }

    // MARK: - Las constantes, y por qué valen lo que valen

    enum Umbral {
        /// Suavizado por MEDIANA móvil, no por media: la mediana se come el pico
        /// del GPS y el frenazo del semáforo sin arrastrar la frontera hacia
        /// ellos, que es justo lo que hace la media y por lo que un detector con
        /// media corta tarde.
        static let ventanaMedianaS: Double = 15

        /// Por debajo de esto no es un tramo: es un semáforo, una cuesta o un
        /// adelanto. Se absorbe en el vecino en vez de trocear la carrera en el
        /// ruido.
        static let minTramoS: Double = 25

        /// Suelo de la banda de histéresis: el ruido del ritmo por GPS, en s/km.
        static let bandaMinSkm: Double = 8

        /// Por debajo de este contraste la variación no es una frontera: es el
        /// terreno. Y entonces la carrera fue UNA cosa y su media es honesta. Esta
        /// constante hace doble trabajo — decide la forma y protege a la media de
        /// una acusación falsa.
        static let contrasteSkm: Double = 20

        /// Más lento que 9:00/km sostenido no es correr suave: es estar parado.
        static let ritmoParadoSkm: Double = 540

        /// Con menos no hay nada que resolver.
        static let minMuestras = 20

        /// Una muestra cada 15 s. Con menos no se resuelve un tramo de 30 s.
        static let minDensidadPorMin: Double = 4

        /// Con menos tramos fuertes, «aguantaste» es una anécdota, no una lectura.
        static let minTramosAguante = 4

        /// Cuánto de la sesión puede quedarse fuera de los tramos antes de que ese
        /// hueco sea la recuperación que nadie grabó, y no el redondeo del reloj.
        static let huecoMinimo = 0.1

        /// Cuánto puede caerse el ritmo entre mitades y seguir siendo
        /// «aguantaste». En porcentaje y no en s/km: 5 s/km sobre 3:00 es otra
        /// cosa que sobre 6:00. El 2 % está por encima del ruido de medida de una
        /// repetición por GPS.
        static let aguante = 0.02

        /// Contraste, en s/km, a partir del cual la frontera deja de ser
        /// discutible. Un fartlek de verdad son 60-90; una progresión suelta,
        /// 20-30. Por debajo de este listón los tramos salen, pero se declaran
        /// `estimados`.
        static let contrasteLimpioSkm: Double = 40
        /// Cuánto de la carrera tiene que caer dentro de tramos para fiarse.
        static let coberturaLimpia = 0.8
        /// Una muestra cada 6 s: bastante para ver las dos fronteras de un tramo
        /// de 30 s.
        static let densidadLimpiaPorMin: Double = 10

        /// Doce vueltas bastan de sobra para dos grupos en una dimensión; el
        /// bucle corta antes si deja de moverse.
        static let vueltasLloyd = 12
    }

    /// Lo que sale de intentar trocear la carrera: o unos tramos con su certeza,
    /// o la razón por la que no se pudo.
    enum Crudos: Equatable {
        case resuelto(tramos: [Tramo], certeza: Certeza)
        case sinResolver(Motivo)
    }

    // MARK: - La lectura

    static func lectura(de c: Carrera) -> Lectura {
        let mediaSkm: Double? = c.distanciaM > 0 ? (c.duracionS / c.distanciaM) * 1000 : nil
        let crudos = c.marcados.isEmpty ? desdeMuestras(c.muestras) : desdeMarcados(c.marcados)

        let tramos: [Tramo]
        let certeza: Certeza
        switch crudos {
        case let .resuelto(t, cz):
            tramos = t
            certeza = cz
        case let .sinResolver(motivo):
            return Lectura(
                forma: .noSeSabe,
                certeza: nil,
                motivo: motivo,
                tramos: [],
                tramosSonLectura: false,
                fuerte: nil,
                suave: nil,
                contrasteSkm: nil,
                aguante: nil,
                mediaSkm: mediaSkm,
                // Aquí está la ventaja que Apple no tiene: no sabemos decomponerla,
                // pero SABEMOS que el coach mandó contraste, así que sabemos que
                // miente.
                mediaEsMezcla: c.formaPrescrita == .conContraste
            )
        }

        let fuertes = conRitmo(tramos, .fuerte)
        let suaves = conRitmo(tramos, .suave)
        let fuerte = fuertes.isEmpty ? nil : ritmoDe(fuertes)
        let suave = suaves.isEmpty ? nil : ritmoDe(suaves)

        // EL HUECO — y es el caso de producción, no un borde raro.
        //
        // Hasta el 29-jul el motor grababa los tramos de TRABAJO y tiraba los de
        // recuperación, así que un 5×1000 llega con cinco fuertes y sin nada
        // contra lo que compararlos, y el tiempo que falta hasta la duración de la
        // sesión ES la recuperación. Llamar «uniforme» a eso sería absolver a una
        // media que promedia lo que tenemos con lo que perdimos. Hubo contraste;
        // lo que no hay es el suave.
        let cubierto = tramos.reduce(0) { $0 + $1.duracionS }
        let hueco = c.duracionS > 0 && (c.duracionS - cubierto) / c.duracionS > Umbral.huecoMinimo
        let suaveNoRegistrado = fuerte != nil && suave == nil && hueco

        let contrasteSkm: Double? = {
            guard let f = fuerte, let s = suave else { return nil }
            return s.ritmoSkm - f.ritmoSkm
        }()

        // Sin las dos caras y sin hueco, o con una variación que no llega a
        // frontera (es el terreno, no un formato): fue UNA sola cosa y la media
        // queda absuelta.
        let uniforme = !suaveNoRegistrado
            && (fuerte == nil || suave == nil || (contrasteSkm ?? 0) < Umbral.contrasteSkm)

        // Los tramos son una lectura cuando son repeticiones DE VERDAD: las que
        // definió el coach, o las que separa una frontera real. Los trozos en que
        // la detección parte un rodaje continuo no lo son — ni para el aguante, ni
        // para pintarlos.
        let repeticionesReales = certeza == .marcados || !uniforme

        return Lectura(
            forma: uniforme ? .uniforme : .conContraste,
            certeza: certeza,
            motivo: nil,
            tramos: tramos,
            tramosSonLectura: repeticionesReales,
            fuerte: uniforme ? nil : fuerte,
            suave: uniforme ? nil : suave,
            contrasteSkm: uniforme ? nil : contrasteSkm,
            aguante: repeticionesReales && fuerte != nil ? aguanteDe(fuertes) : nil,
            mediaSkm: mediaSkm,
            mediaEsMezcla: !uniforme
        )
    }

    /// Con fronteras conocidas no se infiere nada: se lee.
    static func desdeMarcados(_ marcados: [TramoMarcado]) -> Crudos {
        var reloj: Double = 0
        var orden: [TipoTramo: Int] = [.fuerte: 0, .suave: 0, .parado: 0]
        var tramos: [Tramo] = []
        for m in marcados {
            let desdeS = reloj
            reloj += m.duracionS
            let tipo = m.tipo.tramo
            orden[tipo, default: 0] += 1
            let ritmo: Double? = {
                guard let d = m.distanciaM, d > 0 else { return nil }
                return (m.duracionS / d) * 1000
            }()
            tramos.append(Tramo(tipo: tipo,
                                desdeS: desdeS,
                                hastaS: reloj,
                                duracionS: m.duracionS,
                                ritmoSkm: ritmo,
                                orden: orden[tipo] ?? 1))
        }
        return .resuelto(tramos: tramos, certeza: .marcados)
    }

    // MARK: - Estadística del ritmo

    /// Los tramos de un tipo que TIENEN ritmo, listos para promediarse.
    static func conRitmo(_ tramos: [Tramo], _ tipo: TipoTramo) -> [(duracionS: Double, ritmoSkm: Double)] {
        tramos.compactMap { t in
            guard t.tipo == tipo, let r = t.ritmoSkm else { return nil }
            return (t.duracionS, r)
        }
    }

    /// EL RITMO MEDIO DE UN CONJUNTO DE TRAMOS — y no es la media aritmética.
    ///
    /// El ritmo es s/km: un inverso. Sobre tramos repartidos en el TIEMPO, la
    /// media aritmética de los ritmos sale más lenta que la verdad, porque pesa
    /// igual un segundo rápido (que cubre más metros) que uno lento. La media
    /// buena es tiempo total entre distancia total. Con ocho repeticiones a 3:58 y
    /// una a 5:12 la diferencia son varios segundos por kilómetro: bastante para
    /// desmentir el sujeto de la pantalla.
    static func ritmoDe(_ tramos: [(duracionS: Double, ritmoSkm: Double)]) -> Grupo {
        let duracionS = tramos.reduce(0) { $0 + $1.duracionS }
        let distanciaM = tramos.reduce(0.0) { $0 + ($1.duracionS / $1.ritmoSkm) * 1000 }
        return Grupo(n: tramos.count,
                     ritmoSkm: distanciaM > 0 ? (duracionS / distanciaM) * 1000 : 0,
                     duracionS: duracionS,
                     distanciaM: distanciaM)
    }

    /// EL AGUANTE — lo que de verdad juzga una sesión de calidad.
    ///
    /// «La última fuerte a 4:05, la primera a 3:52» son HECHOS y se dicen tal
    /// cual. El VEREDICTO, en cambio, no puede colgar de dos repeticiones sueltas:
    /// se saca comparando la primera mitad del trabajo con la segunda, que es lo
    /// que hace un coach cuando mira la hoja. Y bajar de ritmo no es un fallo — es
    /// negativo, y los coaches lo persiguen: por eso hay tres veredictos y no dos.
    static func aguanteDe(_ fuertes: [(duracionS: Double, ritmoSkm: Double)]) -> Aguante? {
        guard fuertes.count >= Umbral.minTramosAguante,
              let primero = fuertes.first, let ultimo = fuertes.last else { return nil }
        let corte = fuertes.count / 2
        let primera = ritmoDe(Array(fuertes.prefix(corte))).ritmoSkm
        let segunda = ritmoDe(Array(fuertes.suffix(corte))).ritmoSkm
        let derivaSkm = segunda - primera
        let margen = primera * Umbral.aguante
        let veredicto: Veredicto = derivaSkm > margen
            ? .seTeFue
            : (derivaSkm < -margen ? .deMenosAMas : .aguantaste)
        return Aguante(primeraSkm: primero.ritmoSkm,
                       ultimaSkm: ultimo.ritmoSkm,
                       derivaSkm: derivaSkm,
                       veredicto: veredicto)
    }
}
