import XCTest
@testable import FAHYBRIK

// LAS DECISIONES DE «PERFIL», CLAVADAS SOBRE LOS VEINTE CASOS.
//
// Traducción de `web/tests/design-twin/perfil-rehecho.test.ts` (sujeto, «Pendiente», puertas y sus
// invariantes; las cinco filas de Rendimiento, en `RendimientoPerfilTests`): mismos casos, mismos
// resultados. Que el sujeto sea el correcto o que una puerta que pide al atleta no se pliegue no se ve
// mirando un mockup: se ve igual de bien un perfil que miente que uno que no. Así que cada regla se
// fija aquí, caso a caso, y cada decisión tiene al menos un caso que la ejercita.

final class DecidePerfilTests: XCTestCase {

    private func lectura(_ id: String) -> LecturaPerfil { CasosPerfil.caso(id).lectura }

    /// El separador lleva un espacio de no separación (`TextosPerfil.sep`): para comparar, se lee como un espacio.
    private func plano(_ s: String?) -> String? { s?.replacingOccurrences(of: "\u{00A0}", with: " ") }

    private func puerta(_ l: LecturaPerfil, _ clave: ClavePuerta) throws -> PuertaPerfil {
        try XCTUnwrap(DecidePerfil.puertas(l).first { $0.clave == clave }, "sin puerta \(clave)")
    }

    private func estado(_ p: PuertaPerfil) -> (texto: String, tono: TonoMarca)? {
        p.estado.map { (plano($0.texto) ?? "", $0.tono) }
    }

    // MARK: - El sujeto

    /// El momento del sujeto en cada uno de los veinte escenarios.
    private static let modo: [String: DecidePerfil.ModoIdentidad] = [
        "veterano": .completo,
        "alta": .porCompletar,
        "libre": .completo,
        "pareja": .completo,
        "sin-ancla": .completo,
        "tests-a-medias": .completo,
        "reloj-retirado": .completo,
        "coros": .completo,
        "sin-nombre": .porCompletar,
        "cargando": .cargando,
        "error": .error,
        "denso": .completo,
        "termina": .completo,
        "fuente-caida": .completo,
        "largos": .completo,
        "sin-pareja": .completo,
        "invitacion": .completo,
        "libre-alta": .porCompletar,
        "coros-importados": .completo,
        "coros-fallo": .completo,
    ]

    func testCubreExactamenteLosVeinteEscenariosDelDoble() {
        XCTAssertEqual(Set(Self.modo.keys), Set(CasosPerfil.todos.map(\.id)))
        XCTAssertEqual(CasosPerfil.todos.count, 20)
    }

    func testElMomentoDelSujetoEnCadaUnoDeLosVeinteCasos() {
        for caso in CasosPerfil.todos {
            XCTAssertEqual(DecidePerfil.modoIdentidad(caso.lectura), Self.modo[caso.id], caso.id)
        }
    }

    func testElSubtituloSeHaceSoloConLosCamposQueHaySinNivelInventado() {
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(lectura("veterano").identidad)), "división Open · 34 años · 6 años entrenando · 172 cm · 64,5 kg")
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(lectura("sin-ancla").identidad)), "181 cm · 79 kg")
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(lectura("sin-nombre").identidad)), "175 cm · 70 kg")
        XCTAssertNil(DecidePerfil.subtituloIdentidad(lectura("alta").identidad))
        for caso in CasosPerfil.todos {
            let texto = DecidePerfil.subtituloIdentidad(caso.lectura.identidad) ?? ""
            XCTAssertNil(texto.range(of: "nivel|avanzado|intermedio|principiante", options: [.regularExpression, .caseInsensitive]), caso.id)
        }
    }

    func testUnAnoNoEsUnosAnosYUnPesoDecimalLlevaComa() {
        var id = lectura("veterano").identidad
        id.anosEntrenando = 1
        id.division = nil
        id.edad = nil
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(id)), "1 año entrenando · 172 cm · 64,5 kg")
    }

    func testLaAlturaSeRedondeaYNoSeTrunca() {
        var id = IdentidadPerfil(nombre: "Ana", alturaCm: 172.6)
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(id)), "173 cm")
        id.alturaCm = 172.4
        XCTAssertEqual(plano(DecidePerfil.subtituloIdentidad(id)), "172 cm")
    }

    func testSinNombreLaSiluetaYUnaPreguntaNoInicialesVaciasNiUnHueco() {
        let l = lectura("sin-nombre")
        XCTAssertEqual(DecidePerfil.iniciales(l.identidad.nombre), "")
        XCTAssertEqual(DecidePerfil.tituloIdentidad(l.identidad), "¿Cómo te llamas?")
        XCTAssertEqual(DecidePerfil.accionIdentidad(l), "Poner mi nombre")
        XCTAssertNil(l.identidad.fotoURL, "sin foto: el avatar es la silueta")
    }

    func testLasInicialesSonLasDeLasDosPrimerasPalabras() {
        XCTAssertEqual(DecidePerfil.iniciales("Marc Puig"), "MP")
        XCTAssertEqual(DecidePerfil.iniciales("Alejandro Sánchez-Villanueva Ortega"), "AS")
        XCTAssertEqual(DecidePerfil.iniciales("Ana"), "A")
        XCTAssertEqual(DecidePerfil.iniciales("  "), "")
        // La identidad del servidor y la pantalla escriben las mismas iniciales: una sola cuenta.
        XCTAssertEqual(DecidePerfil.iniciales("núria pla"), "NP")
    }

    func testLaAccionEsUnaYEsLaQueFalta() {
        XCTAssertEqual(DecidePerfil.accionIdentidad(lectura("veterano")), "Editar perfil")
        XCTAssertEqual(DecidePerfil.accionIdentidad(lectura("alta")), "Completar mi perfil")
        XCTAssertEqual(DecidePerfil.accionIdentidad(lectura("error")), "Reintentar")
    }

    func testLaInvitacionSoloPrometeLoQueLaAppHaceZonasPorEdadSoloConCoach() throws {
        XCTAssertNotNil(try XCTUnwrap(DecidePerfil.apoyoDeIdentidad(lectura("alta"))).range(of: "fecha de nacimiento.*zonas de pulso", options: .regularExpression))
        // Sin coach no hay zonas que enseñar: no se promete ninguna.
        XCTAssertEqual(DecidePerfil.apoyoDeIdentidad(lectura("libre-alta")), "Cuéntanos tu edad, tu altura y tu peso.")
        // Con métricas, el subtítulo manda y no hay apoyo.
        XCTAssertNil(DecidePerfil.apoyoDeIdentidad(lectura("veterano")))
        XCTAssertEqual(DecidePerfil.apoyoDeIdentidad(lectura("sin-nombre")), "Ponle nombre a tu perfil para empezar.")
    }

    func testUnaFotoQueFaltaNoActivaLaInvitacionNuncaSeObligaAPonerLaCara() {
        XCTAssertNil(lectura("denso").identidad.fotoURL)
        XCTAssertEqual(DecidePerfil.modoIdentidad(lectura("denso")), .completo)
    }

    func testEnFrioYEnErrorElSujetoMandaSobreLoQueDigaLaIdentidad() {
        var l = lectura("veterano")
        l.cargando = true
        l.errorCarga = true
        XCTAssertEqual(DecidePerfil.modoIdentidad(l), .cargando)
        l.cargando = false
        XCTAssertEqual(DecidePerfil.modoIdentidad(l), .error)
    }

    // MARK: - «Pendiente»: solo actos, en el orden en que caducan

    func testLaPreguntaDeCorosEsLaPrimera() {
        XCTAssertEqual(DecidePerfil.pendientes(lectura("coros")), [.coros(inicio: "7:12")])
    }

    func testElDensoLasTraeLasTresYEnSuOrden() {
        let p = DecidePerfil.pendientes(lectura("denso"))
        XCTAssertEqual(p.map(\.id), ["coros", "suscripcion", "pareja"])
        XCTAssertEqual(p[2], .pareja(.caducada, email: "aleix@ejemplo.es"))
    }

    func testEsperarNoEsUnActoUnaInvitacionEnviadaYUnaSuscripcionQueTerminaNoReclaman() {
        XCTAssertEqual(DecidePerfil.pendientes(lectura("invitacion")), [])
        XCTAssertEqual(DecidePerfil.pendientes(lectura("termina")), [])
    }

    func testDoblesSinCompaneroEsUnActoInvitar() {
        XCTAssertEqual(DecidePerfil.pendientes(lectura("sin-pareja")), [.pareja(.sinPareja, email: nil)])
    }

    func testConLaParejaYaEmparejadaNoHayNadaQueHacer() {
        XCTAssertEqual(DecidePerfil.pendientes(lectura("pareja")), [])
    }

    func testNoSePintaNadaMientrasNoSeSabeEnFrioNiConLaIdentidadCaida() {
        var l = lectura("denso")
        l.cargando = true
        XCTAssertEqual(DecidePerfil.pendientes(l), [])
        l.cargando = false
        l.errorCarga = true
        XCTAssertEqual(DecidePerfil.pendientes(l), [])
    }

    func testSinCoachNoLlegaNingunaPiezaDeCoach() {
        var l = lectura("denso")
        l.conCoach = false
        l.coach = nil
        XCTAssertFalse(DecidePerfil.pendientes(l).map(\.id).contains("suscripcion"))
    }

    func testUnPerfilAlDiaNoReclamaNada() {
        for id in ["veterano", "alta", "libre", "reloj-retirado", "sin-ancla"] {
            XCTAssertEqual(DecidePerfil.pendientes(lectura(id)), [], id)
        }
    }

    // MARK: - Las puertas y lo que revelan

    func testSonLasSeisDeSiempreEnSuOrden() {
        XCTAssertEqual(
            DecidePerfil.puertas(lectura("veterano")).map(\.clave),
            [.identidad, .entreno, .dispositivos, .cuenta, .privacidad, .ayuda]
        )
    }

    func testCadaUnaLlevaSuSubtituloReal() throws {
        let l = lectura("veterano")
        XCTAssertEqual(plano(try puerta(l, .identidad).descripcion), "Modalidad, objetivo · Mejorar mi marca de HYROX")
        XCTAssertEqual(try puerta(l, .entreno).descripcion, "Días, molestias, avisos de voz y pruebas del reloj")
        XCTAssertEqual(try puerta(l, .dispositivos).descripcion, "Apple Health, reloj, Garmin, Polar, COROS y más")
        XCTAssertEqual(try puerta(l, .cuenta).descripcion, "Apariencia, metodología y eliminar tu cuenta")
        XCTAssertEqual(try puerta(l, .privacidad).descripcion, "Movimiento del reloj, tus datos y la política de privacidad")
        XCTAssertEqual(try puerta(l, .ayuda).descripcion, "Sugerencias y términos")
    }

    func testDispositivosDiceQueHayConectadoOQueNoHayNada() throws {
        let veterano = estado(try puerta(lectura("veterano"), .dispositivos))
        XCTAssertEqual(veterano?.texto, "Apple Salud, Apple Watch y COROS conectados")
        XCTAssertEqual(veterano?.tono, .ok)
        let libre = estado(try puerta(lectura("libre"), .dispositivos))
        XCTAssertEqual(libre?.texto, "Apple Salud conectado")
        XCTAssertEqual(libre?.tono, .ok)
        let alta = estado(try puerta(lectura("alta"), .dispositivos))
        XCTAssertEqual(alta?.texto, "Ningún dispositivo conectado")
        XCTAssertEqual(alta?.tono, .invita)
    }

    func testElMovimientoDelRelojEsUnaDecisionSuyaNiVerdeNiRojoYCallaSiNuncaSePregunto() throws {
        XCTAssertEqual(estado(try puerta(lectura("reloj-retirado"), .privacidad))?.texto, "Movimiento del reloj: retirado")
        XCTAssertEqual(estado(try puerta(lectura("reloj-retirado"), .privacidad))?.tono, .neutro)
        XCTAssertEqual(estado(try puerta(lectura("veterano"), .privacidad))?.texto, "Movimiento del reloj: permitido")
        XCTAssertNil(try puerta(lectura("alta"), .privacidad).estado)
        XCTAssertFalse(try puerta(lectura("reloj-retirado"), .privacidad).atencion)
    }

    func testIdentidadJuntaLaParejaDeDoblesYLaSuscripcion() throws {
        // Una suscripción al día no es noticia: con pareja solo se cuenta la pareja.
        XCTAssertEqual(estado(try puerta(lectura("pareja"), .identidad))?.texto, "Dobles · con Biel")
        XCTAssertEqual(estado(try puerta(lectura("pareja"), .identidad))?.tono, .neutro)
        XCTAssertEqual(estado(try puerta(lectura("veterano"), .identidad))?.texto, "Suscripción activa")
        XCTAssertEqual(estado(try puerta(lectura("veterano"), .identidad))?.tono, .ok)
        let termina = try puerta(lectura("termina"), .identidad)
        XCTAssertEqual(estado(termina)?.texto, "Suscripción: termina el 12 oct")
        XCTAssertEqual(estado(termina)?.tono, .aviso)
        XCTAssertTrue(termina.atencion)
        let denso = try puerta(lectura("denso"), .identidad)
        XCTAssertEqual(estado(denso)?.tono, .peligro)
        XCTAssertTrue(denso.atencion)
        XCTAssertEqual(estado(try puerta(lectura("sin-pareja"), .identidad))?.texto, "Dobles · sin compañero/a")
        XCTAssertNotNil(estado(try puerta(lectura("invitacion"), .identidad))?.texto.range(of: "invitación enviada, caduca en 12 días"))
    }

    func testSinCoachSinSuscripcionEnIdentidadNiMetodologiaEnCuenta() throws {
        let l = lectura("libre")
        XCTAssertNil(try puerta(l, .identidad).estado)
        XCTAssertEqual(try puerta(l, .cuenta).descripcion, "Apariencia y eliminar tu cuenta")
        XCTAssertEqual(try puerta(lectura("libre-alta"), .identidad).descripcion, "Modalidad, objetivo e idioma")
    }

    func testEntrenoNoTieneEstadoQueContarConservaSuSubtituloQueEsElIndiceDeLoQueHayDentro() throws {
        for caso in CasosPerfil.todos { XCTAssertNil(try puerta(caso.lectura, .entreno).estado, caso.id) }
        XCTAssertNotNil(try puerta(lectura("veterano"), .entreno).descripcion.range(of: "molestias"))
    }

    func testEnFrioYEnErrorNoSeSabeElEstadoDeNadaCadaPuertaDiceLoQueHayDentro() {
        for id in ["cargando", "error"] {
            for p in DecidePerfil.puertas(lectura(id)) {
                XCTAssertNil(p.estado, "\(id) · \(p.clave)")
                XCTAssertFalse(p.atencion, "\(id) · \(p.clave)")
            }
        }
    }

    func testALaVistaLasQueSeUsanYLasQueDicenAlgoDelAtletaPlegadasLasQueNoDicenNada() {
        // El veterano decidió sobre el movimiento del reloj: Privacidad ya dice algo y se queda a la vista.
        let g = DecidePerfil.agruparPuertas(DecidePerfil.puertas(lectura("veterano")))
        XCTAssertEqual(g.visibles.map(\.clave), [.identidad, .entreno, .dispositivos, .privacidad])
        XCTAssertEqual(g.plegadas.map(\.clave), [.cuenta, .ayuda])
        // A quien nunca se le preguntó, Privacidad no tiene nada que decir y se pliega con Cuenta y Ayuda.
        let alta = DecidePerfil.agruparPuertas(DecidePerfil.puertas(lectura("alta")))
        XCTAssertEqual(alta.visibles.map(\.clave), [.identidad, .entreno, .dispositivos])
        XCTAssertEqual(alta.plegadas.map(\.clave), [.cuenta, .privacidad, .ayuda])
    }

    func testElMovimientoRetiradoSeVeALaPrimeraSinAbrirNada() {
        let g = DecidePerfil.agruparPuertas(DecidePerfil.puertas(lectura("reloj-retirado")))
        XCTAssertTrue(g.visibles.map(\.clave).contains(.privacidad))
    }

    func testUnaPuertaQuePideAlAtletaNuncaSePliega() {
        let cuentaConAviso = DecidePerfil.puertas(lectura("alta")).map { p in
            p.clave == .cuenta
                ? PuertaPerfil(clave: p.clave, titulo: p.titulo, corto: p.corto, descripcion: p.descripcion, estado: EstadoPuerta(texto: "algo", tono: .aviso))
                : p
        }
        let g = DecidePerfil.agruparPuertas(cuentaConAviso)
        XCTAssertEqual(g.visibles.map(\.clave), [.identidad, .entreno, .dispositivos, .cuenta])
        XCTAssertEqual(g.plegadas.map(\.clave), [.privacidad, .ayuda])
        XCTAssertEqual(g.visibles.count + g.plegadas.count, 6)
    }

    func testLaListaConYSeEscribeComoSeHabla() {
        XCTAssertEqual(TextosPerfil.listaConY([]), "")
        XCTAssertEqual(TextosPerfil.listaConY(["cuenta"]), "cuenta")
        XCTAssertEqual(TextosPerfil.listaConY(["cuenta", "ayuda"]), "cuenta y ayuda")
        XCTAssertEqual(TextosPerfil.listaConY(["cuenta", "privacidad", "ayuda"]), "cuenta, privacidad y ayuda")
    }

    // MARK: - Invariantes sobre los veinte casos

    /// Todo lo que llega a pantalla, dicho con las mismas funciones que lo pintan.
    private func textos(_ l: LecturaPerfil) -> [String] {
        var fuera: [String] = []
        for f in RendimientoEstados.filas(l) {
            fuera.append(f.etiqueta)
            switch f.estado {
            case let .valor(cifra, sufijo, pie): fuera += [cifra, sufijo, pie].compactMap { $0 }
            case let .vacio(invitacion): fuera.append(invitacion)
            case .cargando, .sinRespuesta: break
            }
            if let salida = f.salida { fuera.append(salida) }
        }
        for p in DecidePerfil.pendientes(l) {
            let t = TextosPerfil.pendiente(p)
            fuera += [t.titulo, t.detalle]
        }
        for p in DecidePerfil.puertas(l) {
            fuera += [p.titulo, p.descripcion]
            if let e = p.estado { fuera.append(e.texto) }
        }
        fuera.append(DecidePerfil.tituloIdentidad(l.identidad))
        if let s = DecidePerfil.subtituloIdentidad(l.identidad) { fuera.append(s) }
        if let a = DecidePerfil.apoyoDeIdentidad(l) { fuera.append(a) }
        return fuera
    }

    func testNingunaPiezaDeCoachLlegaSinCoachNiSiquieraVacia() {
        let libres = CasosPerfil.todos.filter { !$0.lectura.conCoach }
        XCTAssertGreaterThanOrEqual(libres.count, 2)
        for caso in libres {
            for t in textos(caso.lectura) {
                XCTAssertNil(t.range(of: "coach|tests|suscripci[oó]n|metodolog[ií]a|zonas de pulso", options: [.regularExpression, .caseInsensitive]), "\(caso.id): «\(t)»")
            }
        }
    }

    func testElSeparadorNuncaDejaUnPuntoMedioColgandoAlPrincipioDeUnaLinea() {
        for caso in CasosPerfil.todos {
            for t in textos(caso.lectura) { XCTAssertFalse(t.contains(" ·"), "\(caso.id): «\(t)»") }
        }
    }

    func testCeroGuionesLargosEnCualquierTextoQueLlegueAPantalla() {
        for caso in CasosPerfil.todos {
            var todos = textos(caso.lectura)
            if let aviso = caso.aviso { todos.append(aviso.texto) }
            for t in todos { XCTAssertNil(t.range(of: "—|–", options: .regularExpression), "\(caso.id): «\(t)»") }
        }
        for r in [RespuestaCoros.si, .no, .ahoraNo] {
            XCTAssertNil(TextosPerfil.avisoDeRespuesta(r).range(of: "—|–", options: .regularExpression))
        }
    }

    func testNingunTextoLlevaUnNombrePropioDelEquipoNiLaMarcaHeredada() {
        for caso in CasosPerfil.todos {
            for t in textos(caso.lectura) {
                XCTAssertNil(t.range(of: "pablo|fabrik|fahybrik", options: [.regularExpression, .caseInsensitive]), "\(caso.id): «\(t)»")
            }
        }
    }

    func testLaPreguntaDeCorosYSuAvisoDeSincronizacionSonExcluyentes() {
        for caso in CasosPerfil.todos {
            XCTAssertFalse(caso.lectura.corosPendiente != nil && caso.aviso != nil, caso.id)
        }
        XCTAssertEqual(CasosPerfil.caso("coros-importados").aviso, AvisoCoros(tono: .ok, texto: "Importados 2 entrenos de COROS."))
        XCTAssertEqual(CasosPerfil.caso("coros-fallo").aviso?.tono, .fallo)
        // Un aviso no es un acto: no entra en «Pendiente».
        XCTAssertEqual(DecidePerfil.pendientes(lectura("coros-importados")), [])
        XCTAssertEqual(DecidePerfil.pendientes(lectura("coros-fallo")), [])
    }

    func testCadaCasoTraeSuTituloNumeradoYLoQueHayQueMirar() {
        let circulos = Set("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳")
        for caso in CasosPerfil.todos {
            XCTAssertTrue(caso.titulo.first.map(circulos.contains) ?? false, caso.titulo)
            XCTAssertTrue(caso.titulo.dropFirst().hasPrefix(" "), caso.titulo)
            XCTAssertGreaterThan(caso.mira.count, 60, caso.id)
        }
    }

    func testLaFotoDeEjemploEsUnaURLQueSeLeeComoUnaFotoDeVerdad() {
        XCTAssertNotNil(URL(string: CasosPerfil.fotoDeEjemplo))
        XCTAssertTrue(FileManager.default.fileExists(atPath: URL(string: CasosPerfil.fotoDeEjemplo)?.path ?? ""))
    }

    // MARK: - Los textos de «Pendiente» y sus respuestas

    func testLaPreguntaDeCorosDiceLaHoraSoloSiLaTiene() {
        XCTAssertTrue(TextosPerfil.detalleCoros(inicio: "7:12").contains("en COROS, de las 7:12."))
        XCTAssertTrue(TextosPerfil.detalleCoros(inicio: nil).contains("en COROS. Si dices que no"))
    }

    func testAhoraNoDiceLaVerdadSeVuelveAPreguntar() {
        XCTAssertEqual(TextosPerfil.avisoDeRespuesta(.ahoraNo), "Vale. Te lo volvemos a preguntar la próxima vez que abras Perfil.")
        XCTAssertEqual(TextosPerfil.avisoDeRespuesta(.si), "Hecho: esa actividad es tu entreno de hoy.")
        XCTAssertEqual(TextosPerfil.avisoDeRespuesta(.no), "La actividad queda en el historial. El plan no se toca.")
    }

    func testLosTextosDeLaParejaNombranAQuienInvitaste() {
        XCTAssertEqual(
            TextosPerfil.pendiente(.pareja(.caducada, email: "aleix@ejemplo.es")).titulo,
            "La invitación a aleix@ejemplo.es caducó"
        )
        XCTAssertEqual(
            TextosPerfil.pendiente(.pareja(.rechazada, email: "aleix@ejemplo.es")).titulo,
            "aleix@ejemplo.es rechazó la invitación"
        )
        XCTAssertEqual(TextosPerfil.pendiente(.suscripcion(.pagoPendiente)).titulo, "Tu pago está pendiente")
        XCTAssertEqual(TextosPerfil.pendiente(.suscripcion(.cancelada)).titulo, "Tu suscripción está cancelada")
    }
}
