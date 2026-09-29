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

        /// Para el lector de pantalla y la cronología.
        var titulo: String {
            switch self {
            case .paso: return "Paso"
            case .datos: return "Datos"
            case .vueltas: return "Vueltas"
            case .estructura: return "Estructura"
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

    enum AccionDeCara: String, Equatable { case mas30s = "+30 s", empezarYa = "Empezar ya" }

    /// El descanso común (P8): cuenta atrás, «Viene: …», +30 s y Empezar ya.
    struct CaraDescanso: Equatable {
        var contexto: LineaTexto
        var heroe: HeroeMuneca
        var pulso: LineaDeDato?
        var viene: NotaVista?
        var acciones: [AccionDeCara]
    }

    enum CaraMuneca: Equatable {
        case paso(CaraPaso)
        case recupera(CaraRecupera)
        case descanso(CaraDescanso)
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

    static func cuadroMuneca(_ e: EstadoVivo, registro: RegistroVueltas = RegistroVueltas(), entorno x: EntornoMuneca = EntornoMuneca()) -> CuadroMuneca {
        let m = x.medidas
        let l = lecturasParaPintar(e)
        let p = e.paso
        let lamina = laminaDelPaso(p, l, e.zonas, e.reglas)

        let cara: CaraMuneca
        if e.terminado { cara = .completada }
        else if p.rol == .recuperacion { cara = .recupera(caraRecupera(e, l, lamina, x)) }
        else if p.rol == .descanso { cara = .descanso(caraDescanso(e, l, m)) }
        else { cara = .paso(caraPaso(lamina, m)) }

        let (objetivo, enCurso) = vueltaEnCurso(e, registro: registro)
        let vueltas = filasDeVueltas(e.vueltas + registro.vueltas, objetivo: objetivo, visibles: enCurso != nil ? 4 : 5)
        let estructura = estructuraDe(e.pasos, i: e.i).map { f -> FilaLista in
            let t = textoFila(f)
            return FilaLista(linea: t.linea, detalle: t.detalle, estado: f.estado)
        }
        let tinte: TinteVista? = x.alwaysOn ? nil : tinteDelPaso(p, l, e.zonas).map {
            TinteVista(zona: $0, color: colorZona($0, e.zonas?.techos.count ?? 5), mezclaPct: tinteZonaPct)
        }

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
            capa: capaDe(e, registro, m),
            datos: PaginaDatosMuneca(titulo: ["Sesión"], filas: filasDeDatos(e.sesion, l, zonas: e.zonas, fuente: p.entorno == .cinta ? "cinta" : nil)),
            vueltas: PaginaVueltasMuneca(titulo: vueltas.titulo, enCurso: enCurso, filas: vueltas.filas,
                                         vacia: (vueltas.filas.isEmpty && enCurso == nil) ? "Aún ninguna" : nil),
            estructura: PaginaEstructuraMuneca(titulo: ["Estructura"], filas: ventanaDeLista(estructura)),
            aro: AroMuneca(arcos: arcosDePlan(e.pasos), indice: e.i, fraccion: fraccionDelPaso(p, l)),
            avisoCierre: avisoDeCierre(p)
        )
    }

    // MARK: - Las caras

    private static func caraPaso(_ lam: Lamina, _ m: MedidasMuneca) -> CaraPaso {
        let nota = lam.nota.map { notaVista($0, ancho: m.anchoUtil) }
        // La nota va ARRIBA, bajo el contexto: abajo las esquinas dejan ~150 pt y una
        // nota de honestidad no puede quedarse a medias.
        var filas: [Fila] = [.contexto]
        if let nota { filas.append(filaDeNota(nota)) }
        if lam.banda != nil { filas.append(.banda) }
        if lam.instruccion != nil { filas.append(.instruccion) }
        if lam.segundo != nil { filas.append(.segundo) }
        if lam.tercero != nil { filas.append(.tercero) }
        return CaraPaso(
            contexto: contextoQueCabe(lam.contexto, m),
            nota: nota,
            heroe: heroeMuneca(lam.heroe, filas: filas, m),
            banda: lam.banda,
            instruccion: lam.instruccion.map { instruccionQueCabe($0, m) },
            segundo: lam.segundo.map { lineaDeDato($0, cuerpo: TipoMuneca.segundo, ancho: lam.tercero != nil ? m.anchoUtil : m.anchoPie) },
            tercero: lam.tercero.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) }
        )
    }

    private static func caraRecupera(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ x: EntornoMuneca) -> CaraRecupera {
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

    private static func caraDescanso(_ e: EstadoVivo, _ l: Lecturas, _ m: MedidasMuneca) -> CaraDescanso {
        let p = e.paso
        var heroe = heroeDelPaso(p, l, nil)
        heroe.etiqueta = nil
        // El pulso bajando, monocromo: el descanso tampoco se tiñe (P6).
        let pulso: LineaVista? = l.ppm != nil ? { var s = lineaPulso(p, l, nil, e.reglas); s.zona = nil; return s }() : nil
        let viene = e.siguiente.map { notaVista(textoViene($0), prefijo: "Viene:", ancho: m.anchoUtil) }
        var filas: [Fila] = [.contexto, .boton]
        if let viene { filas.append(filaDeNota(viene)) }
        if pulso != nil { filas.append(.tercero) }
        return CaraDescanso(
            contexto: contextoQueCabe(contextoDe(p), m),
            heroe: heroeMuneca(heroe, filas: filas, m),
            pulso: pulso.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoUtil) },
            viene: viene,
            acciones: [.mas30s, .empezarYa]
        )
    }

    // MARK: - La capa

    /// De qué paso habla la cuenta: del que ENTRA (el trabajo tras una recuperación o
    /// un descanso), no del que se acaba; la de arranque del motor habla del paso vivo.
    private static func pasoDeLaCuenta(_ e: EstadoVivo) -> Paso {
        let p = e.paso
        if p.rol != .trabajo, let s = e.siguiente, s.rol == .trabajo { return s }
        return p
    }

    static func caraCuenta(_ n: Int, _ p: Paso, _ m: MedidasMuneca) -> CaraCuenta {
        let que = textoCuenta(p)
        let numero = HeroeVista(clase: .crono, texto: n > 0 ? String(n) : "GO")
        return CaraCuenta(
            contexto: contextoQueCabe(contextoDe(p), m),
            que: que.map { instruccionQueCabe($0, m) },
            numero: heroeMuneca(numero, filas: que != nil ? [.contexto, .instruccion] : [.contexto], m)
        )
    }

    private static func capaDe(_ e: EstadoVivo, _ registro: RegistroVueltas, _ m: MedidasMuneca) -> CapaMuneca? {
        if let n = e.cuenta { return .cuenta(caraCuenta(n, pasoDeLaCuenta(e), m)) }
        if e.go { return .cuenta(caraCuenta(0, e.paso, m)) }
        return registro.avisoVigente(e.sesion.t).map { .vuelta($0) }
    }
}
