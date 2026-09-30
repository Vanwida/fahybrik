import Foundation

// EL CUADRO DE LA MUÑECA — TODO lo que la pantalla del Apple Watch pinta en un
// instante, decidido en un sitio (docs/reloj-muneca/modelo.md, P1 y P3). De un
// `Vivo.EstadoVivo` (el estado del motor, con su enlace y su GPS) sale un
// `CuadroMuneca`; la vista SOLO pinta lo que el cuadro dice, sin una decisión:
// ni qué número manda, ni a qué cuerpo, ni qué fila sobra, ni si hay tinte.
//
// Reutiliza lo que ya existe en vez de reescribirlo: `laminaDelPaso` (la regla P3
// del héroe, la banda y el veredicto), `estructuraDe` (las filas de la
// Estructura), `textoViene` («Luego ·»), `cuentaDe`/`goDe` (el 3-2-1 y el GO)
// que ya calcula `estadoDe`. Lo nuevo es lo que el kit web resuelve dentro de
// sus componentes: qué filas hay y cuánto alto le dejan al héroe.
//
// Cuatro páginas, la corona las recorre en vertical: Paso → Datos → Vueltas →
// Estructura. TOCAR LA PANTALLA NO CIERRA NADA (P4): este cuadro no lleva
// ningún gesto de avance. Lo único que ofrece son botones a la vista de un paso
// de descanso; cerrar a mano (doble toque, Acción) es otra fase.
//
// Always-On (modelo §3): fondo negro, sin tinte, números en tinta al 60 %, aro
// atenuado, 1 Hz. Lo decide el cuadro (`alwaysOn`); la vista aplica los números.

extension Vivo {

    // MARK: - Mecanismo: el Always-On y lo que depende del móvil

    /// Fondo negro, sin tintes, números en tinta al 60 %, aro atenuado, 1 Hz. Mecanismo nuestro:
    /// lo pide la plataforma (batería) y el modelo, no es método del coach.
    enum AlwaysOn {
        static let tinta: Double = 0.6
        static let aro: Double = 0.4
        static let refrescoHz: Double = 1
    }

    /// Los campos que, con el móvil llevando el motor, llegan POR el enlace: si se
    /// pierde, se pintan «—» con su nota, jamás congelados. El pulso lo mide el
    /// propio reloj y no está aquí.
    static let camposDelMovil: [CampoVivo] = [.ritmo, .hecho]

    /// La acción del momento según el reloj: una pista (18 pt) o un botón (48 pt).
    /// Dónde se cierra a mano (doble toque, Acción) es la fase de los gestos; aquí
    /// solo cuenta cuánto alto ocupa su fila.
    enum FilaDeAccion: Equatable { case pista, boton }

    struct EntornoMuneca: Equatable {
        var medidas: MedidasMuneca = .mm46
        var alwaysOn: Bool = false
        var accion: FilaDeAccion = .pista
    }

    // MARK: - Las cuatro páginas

    enum PaginaMuneca: String, Equatable, CaseIterable {
        case paso, datos, vueltas, estructura
        /// La hoja del coach por ejercicios: la de fuerza (en lugar de Vueltas y Estructura).
        case ejercicios

        /// Para el lector de pantalla y la cronología.
        var titulo: String {
            switch self {
            case .paso: return "Paso"
            case .datos: return "Datos"
            case .vueltas: return "Vueltas"
            case .estructura: return "Estructura"
            case .ejercicios: return "Ejercicios"
            }
        }
    }

    // MARK: - La página Paso: una cara por lo que haces

    /// Un paso de trabajo (correr, o cualquier otro): contexto, héroe según el
    /// objetivo, banda con marca ▲▼ y palabra, lo que falta, la otra métrica.
    struct CaraPaso: Equatable {
        var contexto: LineaTexto
        /// Sin enlace · GPS buscando · cue del coach · Cinta · Pista. Va bajo el contexto.
        var nota: NotaVista?
        var heroe: HeroeMuneca
        var banda: BandaVista?
        /// «RPE 7 · fuerte»: lo que manda y no es un número vivo.
        var instruccion: LineaTexto?
        /// Lo que falta (30 pt), o el ritmo si nada más lo dice.
        var segundo: LineaDeDato?
        /// La fila de abajo, a ANCHO_PIE: el pulso (o el ritmo si el héroe es el pulso).
        var tercero: LineaDeDato?
        /// M1 · El segundo objetivo a la vista: un techo de pulso o el tope de ritmo («no más lento de 6:00/km»).
        var tope: NotaVista? = nil
        /// «doble toque · serie hecha»: solo en un paso que cierra el atleta y no lleva su acción en otra fila (ergo).
        var pista: NotaVista? = nil
        // Lo que añaden el WOD y el circuito (P10, P12). Cada fila, `nil` si el paso no la lleva; el orden en que se
        // pintan es el de esta lista: título y dosis bajo el contexto, el total antes del héroe, y las notas tras él.
        /// El movimiento o la estación, a 22 pt («Sled Push», «SkiErg · 1000 m»).
        var titulo: LineaTexto? = nil
        /// Su dosis con la carga si nadie la mide («50 m · 152 kg»).
        var dosis: NotaVista? = nil
        /// El crono total, la puntuación de un For Time y de un circuito: nunca se va de la pantalla.
        var total: LineaDeDato? = nil
        /// Una nota neutra bajo el héroe («reps: al final, con la corona»).
        var bajo: NotaVista? = nil
        /// «Luego · …», en tinta.
        var luego: NotaVista? = nil
        /// Una marca por ronda (Tabata): las hechas, la de ahora y las que faltan.
        var marcas: MarcasRonda? = nil
    }

    struct MarcasRonda: Equatable {
        var total: Int
        var hechas: Int
        /// ¿Hay una ronda en curso (trabajo), o se está en el descanso entre rondas?
        var ahora: Bool
    }

    /// La puntuación de un AMRAP, dicha en la campana: rondas + reps con la corona (P12). Las reps sin decir son «—»,
    /// nunca 0.
    struct CaraPuntuacion: Equatable {
        var contexto: LineaTexto
        /// El héroe de un AMRAP de UN movimiento (las reps con su nombre encima); en uno de varios, `nil`: lo pintan
        /// `rondas` y `reps` en tres piezas.
        var heroe: HeroeMuneca
        var rondas: Int?
        var reps: Int?
        /// «reps de la ronda 6», «12 Wall Ball + 6 KB Swing», «gira la corona», «sin guardar».
        var notas: [NotaVista]
        var pista: NotaVista
        var pulso: LineaDeDato?
    }

    /// Recuperación: monocromo (sin tinte, sin zona), «Luego · …» y la acción que la corta.
    struct CaraRecupera: Equatable {
        var contexto: LineaTexto
        var heroe: HeroeMuneca
        var luego: NotaVista?
        /// La acción del momento, dicha corta y en minúscula.
        var accion: String
        /// «doble toque · empezar ya», medida: en un reloj estrecho va en dos líneas.
        var pista: NotaVista
        var pulso: LineaDeDato?
    }

    enum AccionDeCara: String, Equatable {
        case mas30s = "+30 s", empezarYa = "Empezar ya"
        /// El descanso que anota: «Confirmar» mientras quede algo propuesto y «Listo» después.
        case confirmar = "Confirmar", listo = "Listo"
    }

    /// El descanso común (P8): cuenta atrás, «Viene: …», +30 s y Empezar ya.
    struct CaraDescanso: Equatable {
        var contexto: LineaTexto
        var heroe: HeroeMuneca
        var pulso: LineaDeDato?
        var viene: NotaVista?
        var acciones: [AccionDeCara]
        /// El descanso de fuerza dice lo que viene en dos partes (qué y dosis) y lleva la serie ya anotada en una píldora.
        var vieneFuerza: VieneMuneca? = nil
        var hueco: PildoraAnotar? = nil
    }

    enum CaraMuneca: Equatable {
        case paso(CaraPaso)
        case recupera(CaraRecupera)
        case descanso(CaraDescanso)
        /// Fuerza: la serie en curso, el «Colócate» de una isometría y el descanso que anota.
        case serie(CaraSerie)
        case colocate(CaraColocate)
        case anotar(CaraAnotar)
        /// La campana de un AMRAP: la puntuación que se dice con la corona.
        case puntuacion(CaraPuntuacion)
        /// La sesión acabó sola: «Sesión completada».
        case completada
    }

    // MARK: - La capa a pantalla completa: el 3-2-1, el GO y el km

    /// El 3-2-1 o el GO: arriba, a qué entras; en el centro, el número.
    struct CaraCuenta: Equatable {
        var contexto: LineaTexto
        /// Solo lo que el contexto no dice («Wall Ball · a 3:45–3:55»), en tinta2.
        var que: LineaTexto?
        /// «3», «2», «1» o «GO».
        var numero: HeroeMuneca
        /// Fuerza: el nombre del ejercicio (22 pt) va delante y el contexto es «Serie 2/4 · 8 × 125 kg».
        var nombre: NombreMedido? = nil
    }

    enum CapaMuneca: Equatable {
        case cuenta(CaraCuenta)
        /// El km recién hecho, unos segundos sobre la página Paso.
        case vuelta(AvisoDeVuelta)
    }

    // MARK: - Las otras tres páginas

    struct PaginaDatosMuneca: Equatable {
        var titulo: [String]
        var filas: [FilaDatoVista]
        /// «2 series sin confirmar»: lo que la página avisa abajo.
        var pie: NotaVista? = nil
    }

    struct PaginaVueltasMuneca: Equatable {
        var titulo: [String]
        /// La vuelta que se está corriendo, arriba de todas.
        var enCurso: FilaSplit?
        /// Las últimas, la más reciente primero.
        var filas: [FilaSplit]
        /// «Aún ninguna», si no hay nada que enseñar.
        var vacia: String?
    }

    struct PaginaEstructuraMuneca: Equatable {
        var titulo: [String]
        /// Una ventana alrededor de la fila de ahora.
        var filas: [FilaLista]
    }

    /// El aro del bisel: la sesión entera (los tramos con su peso, el paso vivo y lo que va de él).
    struct AroMuneca: Equatable {
        var arcos: [ArcoDeTramo]
        var indice: Int
        var fraccion: Double
    }

    /// El tinte de fondo de un paso a zona (P6): el número de zona y el color del
    /// espectro del coach, mezclado con el negro al `mezclaPct` %.
    struct TinteVista: Equatable {
        var zona: Int
        var color: UInt32
        var mezclaPct: Double
    }

    // MARK: - El cuadro entero

    struct CuadroMuneca: Equatable {
        var alwaysOn: Bool
        /// Opacidad de los números: 1, o el 60 % de Always-On.
        var tinta: Double
        var opacidadAro: Double
        /// Cada cuánto se refresca: 1 Hz en Always-On; `nil` = con cada cambio.
        var refrescoHz: Double?
        var pausado: Bool
        var enlace: Enlace
        var gps: EstadoGps
        /// Fondo de zona; `nil` fuera de un paso a zona y siempre en Always-On.
        var tinte: TinteVista?
        var cara: CaraMuneca
        var capa: CapaMuneca?
        var datos: PaginaDatosMuneca
        var vueltas: PaginaVueltasMuneca
        var estructura: PaginaEstructuraMuneca
        var aro: AroMuneca
        /// Lo que dice el aviso de deshacer al cerrar a mano: «Serie 3 cerrada».
        var avisoCierre: String
        /// Las páginas de la corona, en orden. La pila pinta estas y no otras: correr trae cuatro, fuerza tres
        /// (con un dato enfocado, una sola: la corona es del dato).
        var paginas: [PaginaMuneca] = PaginaMuneca.allCases.filter { $0 != .ejercicios }
        /// La hoja de ejercicios de fuerza; `nil` fuera de fuerza.
        var ejercicios: PaginaEjerciciosMuneca? = nil
        /// El dato de la anotación al que la corona gira ahora; `nil` = la corona pasa página.
        var corona: CampoAnotar? = nil
        /// En la campana de un AMRAP la corona es de las reps de la puntuación y la pila se queda en una página.
        var coronaPuntuacion: Bool = false
        /// La acción del momento (doble toque, botón, mano): la misma para todo el que lleve el motor.
        var primaria: ClavePrimaria? = nil
        /// Segundos que quedan para deshacer el último cierre a mano (`EstadoVivo.deshacerS`); `nil` = nada que deshacer.
        var deshacerS: Double? = nil
    }

    // MARK: - Las lecturas que se pintan

    /// Las lecturas con lo que el enlace perdido invalida: sin enlace, lo que llega
    /// por él (`camposDelMovil`) se marca viejo y se pinta «—» con su nota.
    static func lecturasParaPintar(_ e: EstadoVivo) -> Lecturas {
        var l = e.lecturas
        if e.enlace == .sinEnlace {
            for c in camposDelMovil where !l.viejos.contains(c) { l.viejos.append(c) }
        }
        return l
    }

    // MARK: - El cuadro

    /// `anotar`: lo declarado en la anotación de fuerza y lo que hay abierto (la muñeca lo conserva; sin él, todo
    /// propuesto y nada abierto). `wod`: lo que el atleta marcó en el WOD (las ventanas hechas, las rondas y la
    /// puntuación dicha). Sin fuerza ni WOD en la sesión no se leen.
    static func cuadroMuneca(_ e: EstadoVivo, registro: RegistroVueltas = RegistroVueltas(), entorno x: EntornoMuneca = EntornoMuneca(),
                             anotar a: AnotarMuneca = AnotarMuneca(), wod w: EstadoWod = EstadoWod()) -> CuadroMuneca {
        let m = x.medidas
        let l = lecturasParaPintar(e)
        let p = e.paso
        let lamina = laminaDelPaso(p, l, e.zonas, e.reglas)
        let familia = familiaMuneca(e.pasos, e.i)

        let cara = caraDeMuneca(e, l, lamina, a, x, familia: familia, wod: w)
        let corona = a.coronaEnfocada(e)
        let tinte: TinteVista? = x.alwaysOn ? nil : tinteDelPaso(p, l, e.zonas).map {
            TinteVista(zona: $0, color: colorZona($0, e.zonas?.techos.count ?? 5), mezclaPct: tinteZonaPct)
        }
        var esPuntuacion = false
        if case .puntuacion = cara { esPuntuacion = true }

        return CuadroMuneca(
            alwaysOn: x.alwaysOn,
            tinta: x.alwaysOn ? AlwaysOn.tinta : 1,
            opacidadAro: x.alwaysOn ? AlwaysOn.aro : 1,
            refrescoHz: x.alwaysOn ? AlwaysOn.refrescoHz : nil,
            pausado: e.pausado,
            enlace: e.enlace,
            gps: l.gps,
            tinte: tinte,
            cara: cara,
            capa: capaDe(e, registro, a, m),
            datos: paginaDatosDeMuneca(e, l, familia, a, w, m),
            vueltas: paginaVueltasDeMuneca(e, familia, registro, w),
            estructura: paginaEstructuraDeMuneca(e, familia),
            aro: AroMuneca(arcos: arcosDePlan(e.pasos), indice: e.i, fraccion: fraccionDelPaso(p, l)),
            avisoCierre: avisoDelCierre(p, wod: w),
            paginas: paginasDeLaCorona(e, familia: familia, corona: corona, puntuacion: esPuntuacion),
            ejercicios: familia == .fuerza ? paginaEjercicios(e, a, m) : nil,
            corona: corona,
            coronaPuntuacion: esPuntuacion,
            primaria: clavePrimariaMuneca(e, a, w),
            deshacerS: e.deshacerS
        )
    }

    // MARK: - Las caras

    /// La cara de un paso a su objetivo. `contexto`: otra posición que la de la lámina (la carrera de un circuito);
    /// `total`: el crono total bajo la nota, que la carrera de un circuito lleva y correr suelto no.
    static func caraPaso(_ lam: Lamina, _ e: EstadoVivo, _ l: Lecturas, _ m: MedidasMuneca,
                         contexto: [String]? = nil, total: LineaVista? = nil) -> CaraPaso {
        let nota = lam.nota.map { notaVista($0, ancho: m.anchoUtil) }
        // El tope de ritmo tipado (M1): un techo de pulso ya va en la línea del pulso («▲ alto»).
        let tope = topeDe(e.paso, l, e.zonas, e.reglas, m, conTecho: false)
        // La nota va ARRIBA, bajo el contexto: abajo las esquinas dejan ~150 pt y una
        // nota de honestidad no puede quedarse a medias.
        var filas: [Fila] = [.contexto]
        if let nota { filas.append(filaDeNota(nota)) }
        if total != nil { filas.append(.tercero) }
        if lam.banda != nil { filas.append(.banda) }
        if lam.instruccion != nil { filas.append(.instruccion) }
        if let tope { filas.append(filaDeNota(tope)) }
        if lam.segundo != nil { filas.append(.segundo) }
        if lam.tercero != nil { filas.append(.tercero) }
        return CaraPaso(
            contexto: contextoQueCabe(contexto ?? lam.contexto, m),
            nota: nota,
            heroe: heroeMuneca(lam.heroe, filas: filas, m),
            banda: lam.banda,
            instruccion: lam.instruccion.map { instruccionQueCabe($0, m) },
            segundo: lam.segundo.map { lineaDeDato($0, cuerpo: TipoMuneca.segundo, ancho: lam.tercero != nil ? m.anchoUtil : m.anchoPie) },
            tercero: lam.tercero.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) },
            tope: tope,
            total: total.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoUtil) }
        )
    }

    static func caraRecupera(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ x: EntornoMuneca) -> CaraRecupera {
        let p = e.paso
        let m = x.medidas
        var heroe = heroeDelPaso(p, l, e.zonas)
        heroe.etiqueta = nil
        // Monocromo (P6): el pulso sin la marca de color de su zona.
        let pulso = lam.tercero.map { t -> LineaVista in var s = t; s.zona = nil; return s }
        let luego = e.siguiente.map { notaVista(textoViene($0), prefijo: "Luego ·", ancho: m.anchoUtil) }
        // La pista va encima del pulso: la última fila es la más estrecha (esquinas). Ni la pista
        // ni «Luego» caben siempre en una línea: cada una reserva las que de verdad ocupa.
        let accion = "empezar ya"
        let pista = notaVista("doble toque · \(accion)", ancho: m.anchoUtil)
        var filas: [Fila] = [.contexto, .tercero, x.accion == .boton ? .boton : filaDeNota(pista)]
        if let luego { filas.append(filaDeNota(luego)) }
        return CaraRecupera(
            contexto: contextoQueCabe(contextoDe(p), m),
            heroe: heroeMuneca(heroe, filas: filas, m),
            luego: luego,
            accion: accion,
            pista: pista,
            pulso: pulso.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) }
        )
    }

    /// El descanso común (P8). `viene`: en fuerza dice qué y dosis en dos partes; `hueco`: la serie ya anotada;
    /// `conPulso`: el descanso que anota, ya todo declarado, no lo lleva (la serie anotada ocupa su sitio).
    static func caraDescanso(_ e: EstadoVivo, _ l: Lecturas, _ m: MedidasMuneca, viene: VieneMuneca? = nil, hueco: PildoraAnotar? = nil,
                             conPulso: Bool = true) -> CaraDescanso {
        let p = e.paso
        var heroe = heroeDelPaso(p, l, nil)
        heroe.etiqueta = nil
        // El pulso bajando, monocromo: el descanso tampoco se tiñe (P6).
        let pulso: LineaVista? = (conPulso && l.ppm != nil) ? { var s = lineaPulso(p, l, nil, e.reglas); s.zona = nil; return s }() : nil
        let vieneNota = viene == nil ? e.siguiente.map { notaVista(textoViene($0), prefijo: "Viene:", ancho: m.anchoUtil) } : nil
        var alturas: [Double] = [Fila.contexto.alto, Fila.boton.alto]
        if let vieneNota { alturas.append(filaDeNota(vieneNota).alto) }
        if let viene { alturas.append(viene.alto) }
        if pulso != nil { alturas.append(Fila.tercero.alto) }
        if hueco != nil { alturas.append(alturaDeHueco) }
        return CaraDescanso(
            contexto: contextoQueCabe(contextoDe(p), m),
            heroe: heroeConAlto(heroe, alto: altoLibre(alturas, m), m),
            pulso: pulso.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoUtil) },
            viene: vieneNota,
            acciones: [.mas30s, .empezarYa],
            vieneFuerza: viene,
            hueco: hueco
        )
    }

    /// Lo que ocupa la píldora de la serie anotada bajo el héroe del descanso.
    static let alturaDeHueco: Double = 32

    // MARK: - La capa

    /// De qué paso habla la cuenta: del que ENTRA (el trabajo tras una recuperación o
    /// un descanso), no del que se acaba; la de arranque del motor habla del paso vivo.
    private static func pasoDeLaCuenta(_ e: EstadoVivo) -> Paso {
        let p = e.paso
        if p.rol != .trabajo, let s = e.siguiente, s.rol == .trabajo { return s }
        return p
    }

    static func caraCuenta(_ n: Int, _ p: Paso, _ m: MedidasMuneca, arrastrada: Double? = nil) -> CaraCuenta {
        // Una serie de fuerza entra con su nombre y la carga que está en la barra.
        if esFuerza(p) { return caraCuentaFuerza(n, p, arrastrada: arrastrada, m) }
        let que = textoCuenta(p)
        let numero = HeroeVista(clase: .crono, texto: n > 0 ? String(n) : "GO")
        return CaraCuenta(
            contexto: contextoQueCabe(contextoDe(p), m),
            que: que.map { instruccionQueCabe($0, m) },
            numero: heroeMuneca(numero, filas: que != nil ? [.contexto, .instruccion] : [.contexto], m)
        )
    }

    /// La carga que está en la barra cuando entra el paso `p` del plan: la declarada en una serie anterior (cascada).
    private static func arrastradaAl(entrar p: Paso, _ e: EstadoVivo, _ a: AnotarMuneca) -> Double? {
        e.pasos.firstIndex { $0.id == p.id }.flatMap { cargaArrastrada(e.pasos, $0, a.registro) }
    }

    private static func capaDe(_ e: EstadoVivo, _ registro: RegistroVueltas, _ a: AnotarMuneca, _ m: MedidasMuneca) -> CapaMuneca? {
        if let n = e.cuenta {
            let p = pasoDeLaCuenta(e)
            return .cuenta(caraCuenta(n, p, m, arrastrada: arrastradaAl(entrar: p, e, a)))
        }
        if e.go { return .cuenta(caraCuenta(0, e.paso, m, arrastrada: arrastradaAl(entrar: e.paso, e, a))) }
        return registro.avisoVigente(e.sesion.t).map { .vuelta($0) }
    }
}
