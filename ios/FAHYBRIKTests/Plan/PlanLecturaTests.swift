import XCTest
@testable import FAHYBRIK

// «PLAN · REHECHO», CLAVADO SOBRE SUS CASOS — la traducción a XCTest de
// `web/tests/design-twin/plan-rehecho.test.ts` y `plan-rehecho-modelo.test.ts`.
//
// Mismos casos, mismos resultados: así la app y el doble no pueden divergir sin que salte una prueba.
// La pestaña cambia de sujeto según el día que la card muestra, y eso no se ve mirando una captura:
// aquí se fija, caso a caso, la escalera de `vista()`, la honestidad del dato y los siete fallos del
// Swift anterior que el diseño encontró (cada uno tiene su prueba, señalada con «FALLO n»).
//
// Los casos son personas inventadas (`EjemplosPlan`, solo DEBUG); ninguna sale de producción.

final class PlanLecturaTests: XCTestCase {

    private let hoy = EjemplosPlan.hoy

    override func setUp() {
        super.setUp()
        // El estado de una sesión une al servidor las marcas optimistas locales (UserDefaults): se limpian
        // para que un test que marcó una sesión no contamine al siguiente.
        for caso in EjemplosPlan.casosPlan { limpiarMarcas(caso.lectura) }
    }

    private func limpiarMarcas(_ l: LecturaPlan) {
        for s in [l.actual] + l.hojeadas.values.map({ if case let .llego(x) = $0 { return x } else { return nil } }) {
            for dia in s?.dias ?? [] { for ses in dia.sesiones { CompletedAssignmentsStore.unmark(ses.assignmentId) } }
        }
    }

    private func lectura(_ id: String) -> LecturaPlan { EjemplosPlan.casoPlan(id).lectura }
    private func abre(_ id: String) -> NavegacionPlan { EjemplosPlan.casoPlan(id).nav }

    /// Cada string visible de una lectura: lo único que el atleta puede llegar a leer de un caso.
    private func textos(_ l: LecturaPlan) -> [String] {
        var t: [String] = [l.coach, l.companero, l.muro].compactMap { $0 }
        let semanas = [l.actual] + l.hojeadas.values.map { if case let .llego(s) = $0 { return s } else { return nil } }
        for s in semanas.compactMap({ $0 }) {
            t += [s.intencion, s.nombreBloque, s.posicion?.texto].compactMap { $0 }
            for dia in s.dias {
                for ses in dia.sesiones {
                    t += [ses.title, ses.shortPrescription, DuracionDeSesion.texto(ses)].compactMap { $0 }
                }
            }
        }
        for d in l.desgloses.values {
            guard let d = d.listo else { continue }
            t += [d.formato, d.notaDelDia].compactMap { $0 }
            for p in d.partes { t.append(p.titulo); t += p.nombresEjercicios }
        }
        return t
    }

    private func todasLasSesiones(_ l: LecturaPlan) -> [AthleteWeekDaySession] {
        var semanas = [l.actual]
        semanas += l.hojeadas.values.map { if case let .llego(s) = $0 { return s } else { return nil } }
        return semanas.compactMap { $0 }.flatMap(\.dias).flatMap(\.sesiones)
    }

    // MARK: - Los casos

    func testSon18CasosConCoachConIdUnico() {
        XCTAssertEqual(EjemplosPlan.casosPlan.count, 18)
        XCTAssertEqual(Set(EjemplosPlan.casosPlan.map(\.id)).count, 18)
    }

    func testNingunTextoLlevaGuionLargoNiNombrePropioNiJergaDeDispositivo() throws {
        let prohibido = try NSRegularExpression(pattern: #"[—–]|pablo|fabrik|fahybrik|\bHR\b|\bbpm\b|PM5|FTMS"#, options: [.caseInsensitive])
        for caso in EjemplosPlan.casosPlan {
            for t in textos(caso.lectura) {
                XCTAssertNil(prohibido.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)), "\(caso.id): «\(t.prefix(60))»")
            }
        }
    }

    func testNingunaDuracionEscritaEsUnCeroYTodoDesglosePerteneceAUnaSesionReal() {
        for caso in EjemplosPlan.casosPlan {
            let l = caso.lectura
            let sesiones = todasLasSesiones(l)
            for s in sesiones { if let m = s.estDurationMinutes { XCTAssertGreaterThan(m, 0, caso.id) } }
            let ids = Set(sesiones.map(\.assignmentId))
            for id in l.desgloses.keys { XCTAssertTrue(ids.contains(id), "\(caso.id): \(id)") }
        }
    }

    func testLaSemanaSiempreSonSieteDiasDeLunesADomingoYHoyCaeDondeDiceIndiceHoy() {
        for caso in EjemplosPlan.casosPlan {
            let l = caso.lectura
            var semanas = [l.actual]
            semanas += l.hojeadas.values.map { if case let .llego(s) = $0 { return s } else { return nil } }
            for s in semanas.compactMap({ $0 }) {
                XCTAssertEqual(s.dias.count, 7, caso.id)
                XCTAssertEqual(s.dias.map(\.diaSemana), [1, 2, 3, 4, 5, 6, 7], caso.id)
                XCTAssertEqual(FechasDelPlan.diasEntre(s.dias[0].isoDate, s.dias[6].isoDate), 6, caso.id)
                XCTAssertEqual(s.indiceHoy, s.dias.firstIndex { $0.isoDate == l.hoyIso }, caso.id)
            }
        }
    }

    // MARK: - La escalera de vista()

    private struct Esperado {
        let vista: String
        let cuerpo: String?
        let tono: TonoDia
        let accion: String?
    }

    private func cuerpo(_ c: CuerpoPlan) -> String {
        switch c {
        case .sesion: return "sesion"
        case .descanso: return "descanso"
        case .semanaCargando: return "semana-cargando"
        case .semanaFalla: return "semana-falla"
        case .semanaVacia: return "semana-vacia"
        }
    }

    private func nombre(_ v: VistaPlan) -> String {
        switch v {
        case .cargando: return "cargando"
        case .error: return "error"
        case .pausa: return "pausa"
        case .sinPlan: return "sin-plan"
        case .semana: return "semana"
        }
    }

    private func nombre(_ a: AccionAnclada?) -> String? {
        switch a {
        case nil: return nil
        case .empezar?: return "empezar"
        case .verHecho?: return "ver-hecho"
        case .verSiguiente?: return "ver-siguiente"
        case .escribirAlCoach?: return "escribir-al-coach"
        case .reintentar?: return "reintentar"
        case .verSemanaQueViene?: return "ver-semana-que-viene"
        case .volverAEstaSemana?: return "volver-a-esta-semana"
        }
    }

    /// Qué pinta cada uno de los dieciocho escenarios con coach al abrirse.
    private var esperado: [String: Esperado] {
        let sesion = "sesion"
        return [
            "lleno": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "doble": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "hecho-manana": Esperado(vista: "semana", cuerpo: sesion, tono: .ok, accion: "ver-hecho"),
            "a-medias": Esperado(vista: "semana", cuerpo: sesion, tono: .aviso, accion: "ver-hecho"),
            "sin-hacer": Esperado(vista: "semana", cuerpo: sesion, tono: .neutro, accion: "empezar"),
            "otro-dia": Esperado(vista: "semana", cuerpo: sesion, tono: .acento, accion: "empezar"),
            "descanso": Esperado(vista: "semana", cuerpo: "descanso", tono: .soporte, accion: "ver-siguiente"),
            "sin-reloj": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "empieza-despues": Esperado(vista: "sin-plan", cuerpo: nil, tono: .acento, accion: "ver-semana-que-viene"),
            "alta": Esperado(vista: "sin-plan", cuerpo: nil, tono: .neutro, accion: "escribir-al-coach"),
            "pausa": Esperado(vista: "pausa", cuerpo: nil, tono: .neutro, accion: "escribir-al-coach"),
            "hyrox": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "horizonte": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "sin-red": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "plan-directo": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "denso": Esperado(vista: "semana", cuerpo: sesion, tono: .accion, accion: "empezar"),
            "cargando": Esperado(vista: "cargando", cuerpo: nil, tono: .neutro, accion: nil),
            "error": Esperado(vista: "error", cuerpo: nil, tono: .peligro, accion: "reintentar"),
        ]
    }

    func testLaTablaCubreExactamenteLosEscenarios() {
        XCTAssertEqual(Set(esperado.keys), Set(EjemplosPlan.casosPlan.map(\.id)))
    }

    func testVistaSobreLosDieciochoEscenariosConCoach() {
        for caso in EjemplosPlan.casosPlan {
            let e = esperado[caso.id]!
            let v = caso.lectura.vista(caso.nav)
            XCTAssertEqual(nombre(v), e.vista, caso.id)
            if case let .semana(_, _, c) = v { XCTAssertEqual(cuerpo(c), e.cuerpo, caso.id) }
            XCTAssertEqual(v.tono, e.tono, caso.id)
            XCTAssertEqual(nombre(v.accion(en: caso.lectura)), e.accion, caso.id)
        }
    }

    func testLaEscaleraRespetaElOrdenCargandoPausaErrorSemanaSinPlan() {
        let base = lectura("lleno")
        var l = base; l.cargando = true; l.actual = nil
        XCTAssertEqual(nombre(l.vista(NavegacionPlan())), "cargando")
        // Con la semana en memoria (caché) no se vuelve a esqueleto por estar revalidando.
        l = base; l.cargando = true
        XCTAssertEqual(nombre(l.vista(NavegacionPlan())), "semana")
        l = base; l.pausa = PausaDelPlan(desde: nil); l.errorCarga = true; l.actual = nil
        XCTAssertEqual(nombre(l.vista(NavegacionPlan())), "pausa")
        l = base; l.errorCarga = true; l.actual = nil
        XCTAssertEqual(nombre(l.vista(NavegacionPlan())), "error")
        // Un fallo con la semana en caché no tapa la semana.
        l = base; l.errorCarga = true
        XCTAssertEqual(nombre(l.vista(NavegacionPlan())), "semana")
    }

    func testUnPlanPausadoNoEnseñaSesionesAunqueLaSemanaLlegue() {
        XCTAssertEqual(nombre(lectura("pausa").vista(NavegacionPlan())), "pausa")
    }

    // MARK: - FALLO 1 · el vacío con inicio futuro era un callejón sin salida

    func testFallo1_ElVacioConInicioFuturoDiceLaFechaExacta() {
        let v = lectura("empieza-despues").vista(NavegacionPlan())
        XCTAssertEqual(v, .sinPlan(motivo: .empiezaDespues, inicio: "2026-10-05"))
        XCTAssertEqual(FechaES.conDia("2026-10-05"), "lunes 5 de octubre")
    }

    func testFallo1_VerLaSemanaQueVieneLLEGAaLaSemanaQueViene() throws {
        let l = lectura("empieza-despues")
        let v = l.vista(NavegacionPlan(offset: 1))
        guard case let .semana(_, semana, cuerpo) = v else { return XCTFail("debería haber semana, no otra vez el vacío") }
        guard case .sesion = cuerpo else { return XCTFail("debería enseñar la card de un día con sesión") }
        XCTAssertEqual(semana?.posicion, PosicionEnBloque(semana: 1, total: 4))
        XCTAssertEqual(nombre(v.accion(en: l)), "empezar")
    }

    func testSinMasAdelanteNoHayAccionSoloLaFraseDeQueAparecera() {
        var l = lectura("empieza-despues")
        let a = l.actual!
        l.actual = SemanaDelPlan(dias: a.dias, indiceHoy: a.indiceHoy, intencion: a.intencion, nombreBloque: a.nombreBloque,
                                 planStartsOn: a.planStartsOn, hasNextWeek: false, peekBlockedByHorizon: false)
        XCTAssertNil(l.vista(NavegacionPlan()).accion(en: l))
    }

    func testUnAltaSinFechaDeInicioSeDicePreparandoYSaleEscribiendoAlCoach() {
        let l = lectura("alta")
        let v = l.vista(NavegacionPlan())
        XCTAssertEqual(v, .sinPlan(motivo: .preparando, inicio: nil))
        XCTAssertEqual(v.accion(en: l)?.texto(coach: "Mar"), "Escribir a Mar")
        XCTAssertEqual(AccionAnclada.escribirAlCoach.texto(coach: nil), "Escribir a tu coach")
    }

    // MARK: - FALLO 2 · cargar y fallar se leían como «tu coach no la ha llenado»

    func testFallo2_CargandoYFalloSonEstadosPropios() {
        let l = lectura("sin-red")
        let cargando = l.vista(NavegacionPlan(offset: 1, cargando: true))
        XCTAssertEqual(cargando, .semana(offset: 1, semana: nil, cuerpo: .semanaCargando))
        let falla = l.vista(NavegacionPlan(offset: 1))
        XCTAssertEqual(falla, .semana(offset: 1, semana: nil, cuerpo: .semanaFalla))
        XCTAssertEqual(falla.tono, .peligro)
        XCTAssertEqual(nombre(falla.accion(en: l)), "reintentar")
    }

    func testUnaSemanaQueLlegaVaciaEsUnHechoConSalidaAVolver() {
        var l = lectura("lleno")
        l.hojeadas[1] = .llego(EjemplosPlan.semana(lunes: EjemplosPlan.lunesQueViene, hoy: hoy, dias: [[], [], [], [], [], [], []]))
        let v = l.vista(NavegacionPlan(offset: 1))
        guard case let .semana(_, _, c) = v else { return XCTFail() }
        XCTAssertEqual(c, .semanaVacia)
        XCTAssertEqual(nombre(v.accion(en: l)), "volver-a-esta-semana")
    }

    func testLaSemanaQueVieneNoTieneHoyYMuestraElPrimerDiaConAlgo() throws {
        let v = lectura("lleno").vista(NavegacionPlan(offset: 1))
        guard case let .semana(_, semana, .sesion(dia, _, _, _)) = v else { return XCTFail("debería haber sesión") }
        XCTAssertNil(semana?.indiceHoy)
        XCTAssertEqual(dia.isoDate, "2026-10-05")
        XCTAssertFalse(dia.esHoy)
        XCTAssertEqual(v.tono, .acento)
    }

    /// GENERALIZACIÓN (el doble solo pinta un salto): se sigue hojeando mientras cada semana diga que hay una más.
    func testSeSigueHojeandoMientrasCadaSemanaDigaQueHayUnaMas() {
        var l = lectura("lleno")
        let dos = EjemplosPlan.semana(
            lunes: "2026-10-12", hoy: hoy, dias: [[EjemplosPlan.d(.series400)], [], [], [], [], [], []],
            datos: EjemplosPlan.DatosSemana(posicion: (5, 6)))
        l.hojeadas[2] = .llego(dos)
        guard case let .semana(offset, _, c) = l.vista(NavegacionPlan(offset: 2)), case let .sesion(dia, _, _, _) = c else { return XCTFail() }
        XCTAssertEqual(offset, 2)
        XCTAssertEqual(dia.isoDate, "2026-10-12")
        XCTAssertEqual(tituloDeSemana(dos.posicion, offset: 2), "Semana 5 de 6")
        XCTAssertEqual(tituloDeSemana(nil, offset: 2), "En 2 semanas")
    }

    // MARK: - FALLO 3 · el sujeto de un día de varias sesiones es la primera PENDIENTE

    func testFallo3_ConAMHechaYPMPorHacerElSujetoEsLaPM() throws {
        let l = lectura("doble")
        let dia = try XCTUnwrap(l.actual?.diaMostrado(seleccion: nil))
        let p = try XCTUnwrap(dia.sesionPrincipal)
        XCTAssertEqual(p.franja, "PM")
        XCTAssertEqual(p.title, "Fuerza tren superior")
        XCTAssertEqual(dia.secundarias(de: p).map(\.title), ["Remo 5×1000"])
        guard case let .empezar(sesion, _)? = l.vista(NavegacionPlan()).accion(en: l) else { return XCTFail("debería ofrecer Empezar") }
        XCTAssertEqual(sesion.title, "Fuerza tren superior", "«Empezar» apunta a la que toca, no a la hecha")
    }

    func testConLasDosHechasElSujetoEsLaPrimeraYLaOtraBajaCompacta() throws {
        let semana = EjemplosPlan.semana(
            lunes: EjemplosPlan.lunes, hoy: hoy,
            dias: [[], [], [], [EjemplosPlan.d(.remo5x1000, .hecha, franja: "AM"), EjemplosPlan.d(.fuerzaSuperior, .hecha, franja: "PM")], [], [], []])
        XCTAssertEqual(semana.dias[3].sesionPrincipal?.franja, "AM")
    }

    func testConTresSesionesEnUnDiaNingunaQuedaHuerfana() throws {
        let l = lectura("denso")
        let dia = try XCTUnwrap(l.actual?.diaMostrado(seleccion: nil))
        XCTAssertEqual(dia.sesiones.count, 3)
        let p = try XCTUnwrap(dia.sesionPrincipal)
        XCTAssertEqual(1 + dia.secundarias(de: p).count, 3)
    }

    // MARK: - FALLO 4 · «Ayer» y «Mañana» son la distancia real

    func testFallo4_SeRotulaPorLaDistanciaReal() {
        XCTAssertEqual(FechasDelPlan.rotulo(de: "2026-09-30", hoy: hoy), "Ayer")
        XCTAssertEqual(FechasDelPlan.rotulo(de: "2026-10-02", hoy: hoy), "Mañana")
        XCTAssertEqual(FechasDelPlan.rotulo(de: "2026-09-29", hoy: hoy), "Martes 29")
        XCTAssertEqual(FechasDelPlan.rotulo(de: "2026-10-03", hoy: hoy), "Sábado 3")
        XCTAssertEqual(FechasDelPlan.rotulo(de: hoy, hoy: hoy), "Hoy")
    }

    func testLaUltimaSesionAntesDeHoyPuedeSerDeHaceTresDias() throws {
        let s = EjemplosPlan.semana(
            lunes: EjemplosPlan.lunes, hoy: hoy,
            dias: [[EjemplosPlan.d(.remo5x1000, .hecha)], [], [], [], [EjemplosPlan.d(.series400)], [], []])
        let ant = try XCTUnwrap(s.sesionDeAyer)
        XCTAssertEqual(ant.dia.isoDate, "2026-09-28")
        XCTAssertEqual(FechasDelPlan.rotulo(de: ant.dia.isoDate, hoy: hoy), "Lunes 28")
        XCTAssertEqual(s.sesionDeManana?.dia.isoDate, "2026-10-02")
    }

    func testLaCardDeUnDiaHojeadoNoDiceHoy() {
        XCTAssertEqual(FechasDelPlan.etiqueta(de: hoy, hoy: hoy), "Hoy · Jueves 1")
        XCTAssertEqual(FechasDelPlan.etiqueta(de: "2026-09-30", hoy: hoy), "Ayer · Miércoles 30")
        XCTAssertEqual(FechasDelPlan.etiqueta(de: "2026-10-02", hoy: hoy), "Mañana · Viernes 2")
        XCTAssertEqual(FechasDelPlan.etiqueta(de: "2026-10-03", hoy: hoy), "Sábado 3")
        XCTAssertEqual(FechasDelPlan.etiqueta(de: "2026-09-28", hoy: hoy), "Lunes 28")
    }

    func testElEscenarioOtroDiaSeAbreEnElSabadoYNoDiceHoy() throws {
        let c = EjemplosPlan.casoPlan("otro-dia")
        guard case let .semana(_, _, .sesion(dia, _, _, _)) = c.lectura.vista(c.nav) else { return XCTFail("debería haber sesión") }
        XCTAssertEqual(dia.isoDate, "2026-10-03")
        XCTAssertFalse(dia.esHoy)
        XCTAssertFalse(FechasDelPlan.etiqueta(de: dia.isoDate, hoy: c.lectura.hoyIso).contains("Hoy"))
    }

    // MARK: - FALLO 5 · «Ver lo de mañana» no depende de haber tocado el chip de hoy

    func testFallo5_VerLoDeMananaSoloEnElDescansoDeHoyConOSinTocarElChipDeHoy() {
        let l = lectura("descanso")
        let sinTocar = l.vista(NavegacionPlan()).accion(en: l)
        let tocado = l.vista(NavegacionPlan(seleccion: hoy)).accion(en: l)
        guard case let .verSiguiente(_, _, cuando)? = sinTocar else { return XCTFail("debería ofrecer ver lo de mañana") }
        XCTAssertEqual(cuando, "mañana")
        XCTAssertEqual(tocado, sinTocar)
        // Un descanso hojeado (no es hoy) no ofrece otro salto.
        XCTAssertNil(l.vista(NavegacionPlan(seleccion: "2026-10-04")).accion(en: l))
    }

    func testElTextoDeCadaAccion() {
        let d = lectura("descanso")
        XCTAssertEqual(d.vista(NavegacionPlan()).accion(en: d)?.texto(coach: "Mar"), "Ver lo de mañana")
        let e = lectura("lleno")
        XCTAssertEqual(e.vista(NavegacionPlan()).accion(en: e)?.texto(coach: "Mar"), "Empezar")
        XCTAssertEqual(e.vista(NavegacionPlan(seleccion: "2026-09-28")).accion(en: e)?.texto(coach: "Mar"), "Ver lo que hiciste")
    }

    func testMananaSoloSiLoEsSiNoElDiaQueEs() {
        XCTAssertEqual(FechasDelPlan.cuandoDeSiguiente("2026-10-02", hoy: hoy), "mañana")
        XCTAssertEqual(FechasDelPlan.cuandoDeSiguiente("2026-10-03", hoy: hoy), "del sábado")
    }

    func testLaAccionSigueAlDiaMostrado() {
        let l = lectura("lleno")
        XCTAssertEqual(nombre(l.vista(NavegacionPlan(seleccion: "2026-09-28")).accion(en: l)), "ver-hecho")
        XCTAssertEqual(nombre(l.vista(NavegacionPlan(seleccion: "2026-10-03")).accion(en: l)), "empezar")
    }

    func testAMediasTambienSeVeLoHecho() {
        let l = lectura("a-medias")
        XCTAssertEqual(nombre(l.vista(NavegacionPlan()).accion(en: l)), "ver-hecho")
    }

    // MARK: - FALLO 6 · la card dice lo mismo que el carril

    func testFallo6_UnaPendientePasadaEsSinHacerEnLaCardIgualQueEnElCarril() {
        XCTAssertEqual(EstadoSesion.pendiente.efectivo(enDia: "2026-09-29", hoy: hoy), .saltada)
        XCTAssertEqual(EstadoSesion.pendiente.efectivo(enDia: hoy, hoy: hoy), .pendiente)
        XCTAssertEqual(EstadoSesion.hecha.efectivo(enDia: "2026-09-29", hoy: hoy), .hecha)
        XCTAssertEqual(EstadoSesion.pendiente.efectivo(enDia: "2026-09-29", hoy: hoy).etiqueta, "Sin hacer")
    }

    func testElDiaMostradoConLaSesionPasadaSinRegistrarLlevaElGrisNoElNaranja() {
        let v = lectura("lleno").vista(NavegacionPlan(seleccion: "2026-09-30"))
        guard case let .semana(_, _, .sesion(_, _, _, estado)) = v else { return XCTFail("debería haber sesión") }
        XCTAssertEqual(estado, .saltada)
        XCTAssertEqual(v.tono, .neutro)
    }

    func testElEstadoDeUnDiaSaleDeSusSesionesYDelReloj() {
        let s = EjemplosPlan.semana(
            lunes: EjemplosPlan.lunes, hoy: hoy,
            dias: [
                [EjemplosPlan.d(.rodaje8k, .hecha)],                                          // lun: hecha
                [EjemplosPlan.d(.rodaje8k, .hecha), EjemplosPlan.d(.series400, .pendiente, franja: "PM")], // mar: una hecha basta
                [EjemplosPlan.d(.rodaje8k, .parcial), EjemplosPlan.d(.series400, .saltada, franja: "PM")], // mié: a medias gana a sin hacer
                [EjemplosPlan.d(.rodaje8k)],                                                   // jue (hoy): por hacer
                [EjemplosPlan.d(.rodaje8k)],                                                   // vie: por hacer
                [],                                                                            // sáb: descanso
                [],
            ])
        XCTAssertEqual(s.dias.map(\.estado), [.hecha, .hecha, .parcial, .pendiente, .pendiente, .descanso, .descanso])
        let pasado = EjemplosPlan.semana(lunes: EjemplosPlan.lunes, hoy: hoy, dias: [[EjemplosPlan.d(.rodaje8k)], [], [], [], [], [], []])
        XCTAssertEqual(pasado.dias[0].estado, .saltada, "el día pasó y no quedó nada registrado: un hecho, no un juicio")
    }

    func testLasModalidadesQueMandanEnElDiaSonComoMuchoDosYDistintas() {
        let dia = EjemplosPlan.semana(
            lunes: EjemplosPlan.lunes, hoy: hoy,
            dias: [[EjemplosPlan.d(.remo5x1000), EjemplosPlan.d(.fuerzaInferior, franja: "PM"), EjemplosPlan.d(.fuerzaSuperior, franja: "AM"), EjemplosPlan.d(.series800, franja: "PM")], [], [], [], [], [], []]
        ).dias[0]
        XCTAssertEqual(dia.modalidades.map { Theme.Modality.kind($0) }, [.ergo, .strength])
    }

    // MARK: - FALLO 7 · el texto de pausa no supone el motivo

    func testFallo7_ElAvisoDePausaNoSuponeElMotivo() throws {
        let motivo = try NSRegularExpression(pattern: "recuper|lesi[oó]n|vacaciones|par[oó]n", options: [.caseInsensitive])
        let frases = [
            PlanTextos.Pausa.titulo, PlanTextos.Pausa.apoyo(coach: "Mar"), PlanTextos.Pausa.apoyo(coach: nil),
            PlanTextos.Pausa.nota(desde: "2026-09-14"), PlanTextos.Pausa.nota(desde: nil),
        ]
        for t in frases {
            XCTAssertNil(motivo.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)), t)
        }
        XCTAssertEqual(PlanTextos.Pausa.nota(desde: "2026-09-14"), "En pausa desde el 14 de septiembre.")
    }

    // MARK: - Honestidad del dato

    func testSoloUnaSesionTerminadaTraeMinutosMedidos() {
        for caso in EjemplosPlan.casosPlan {
            let l = caso.lectura
            for s in todasLasSesiones(l) {
                guard let d = l.desglose(de: s.assignmentId).listo else { continue }
                if s.estado.trabajada { XCTAssertGreaterThan(d.medidoMin ?? 0, 0, "\(caso.id) \(s.assignmentId)") }
                else { XCTAssertNil(d.medidoMin, "\(caso.id) \(s.assignmentId)") }
            }
        }
    }

    func testElDescansoDeHoyTieneAyerMedidoOSinRegistrar() throws {
        let l = lectura("descanso")
        let ayer = try XCTUnwrap(l.actual?.sesionDeAyer)
        XCTAssertEqual(ayer.dia.isoDate, "2026-09-30")
        XCTAssertEqual(l.desglose(de: ayer.sesion.assignmentId).listo?.medidoMin, 36)
    }

    func testUnDesgloseAusenteSeLeeSinDetalle() {
        let l = lectura("horizonte")
        let hoyId = l.actual!.dias[3].sesiones[0].assignmentId
        XCTAssertEqual(l.desglose(de: hoyId), .sinDetalle)
    }

    func testLosMinutosMedidosSeRedondeanYUnCeroNoEsUnaMedida() {
        XCTAssertEqual(DesgloseSesion.minutosMedidos(segundos: 2820), 47)
        XCTAssertEqual(DesgloseSesion.minutosMedidos(segundos: 20), 1, "nunca por debajo de un minuto")
        XCTAssertNil(DesgloseSesion.minutosMedidos(segundos: 0))
        XCTAssertNil(DesgloseSesion.minutosMedidos(segundos: nil))
    }

    // MARK: - La duración: el reloj escrito, o por qué no

    private func sesion(_ minutos: Int?, razon: String? = nil) throws -> AthleteWeekDaySession {
        var cable: [String: Any] = ["assignment_id": "x", "slot": "am", "title": "T", "status": "scheduled"]
        if let minutos { cable["est_duration_minutes"] = minutos }
        if let razon { cable["duration_unknown_reason"] = razon }
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AthleteWeekDaySession.self, from: JSONSerialization.data(withJSONObject: cable))
    }

    func testConMinutosEsUnSueloYSoloEntoncesLlevaNumero() throws {
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(45)), "desde 45 min")
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(70)), "desde 1 h 10")
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(120)), "desde 2 h")
        XCTAssertTrue(DuracionDeSesion.llevaNumero(try sesion(45)))
    }

    func testCadaUnaDeLasCuatroRazonesTieneSuFraseYNingunaLlevaCifra() throws {
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(nil, razon: "scored_by_time")), "Dura lo que tardes")
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(nil, razon: "until_failure")), "Hasta donde aguantes")
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(nil, razon: "work_not_timed")), "Según tu ritmo y tus descansos")
        XCTAssertEqual(DuracionDeSesion.texto(try sesion(nil, razon: "undosed")), "Sin detallar")
        XCTAssertFalse(DuracionDeSesion.llevaNumero(try sesion(nil, razon: "undosed")))
    }

    func testUnCeroEscritoNoEsUnRelojYSinDatoNoSePintaNada() throws {
        XCTAssertNil(DuracionDeSesion.texto(try sesion(0)))
        XCTAssertNil(DuracionDeSesion.texto(try sesion(nil)))
    }

    func testLaSemanaDelEscenarioSinRelojRecorreLasCuatroRazones() {
        let razones = Set(lectura("sin-reloj").actual!.dias.flatMap(\.sesiones).compactMap(\.durationUnknownReason))
        XCTAssertEqual(razones, [.scoredByTime, .workNotTimed, .untilFailure, .undosed])
    }

    // MARK: - La cabecera

    func testLaCabeceraDiceLaPosicionDelServidorONombraLaSemanaSinInventarUnTotal() {
        XCTAssertEqual(PosicionEnBloque(semana: 3, total: 6).texto, "Semana 3 de 6")
        XCTAssertEqual(PosicionEnBloque(semana: 5, total: nil).texto, "Semana 5")
        XCTAssertEqual(tituloDeSemana(nil, offset: 0), "Esta semana")
        XCTAssertEqual(tituloDeSemana(nil, offset: 1), "Semana que viene")
        XCTAssertEqual(tituloDeSemana(nil, offset: 3), "En 3 semanas")
        XCTAssertEqual(tituloDeSemana(PosicionEnBloque(semana: 4, total: 6), offset: 1), "Semana 4 de 6")
    }

    func testElRangoDeLaSemanaEsUnHechoDelCable() {
        XCTAssertEqual(FechasDelPlan.rango(desde: "2026-09-28", hasta: "2026-10-04"), "Del 28 sep al 4 oct")
    }

    func testElPlanDirectoNoLlevaNombreDeBloqueNiLineaDelCoachYNoSeInventan() throws {
        let s = try XCTUnwrap(lectura("plan-directo").actual)
        XCTAssertNil(s.nombreBloque)
        XCTAssertNil(s.intencion)
        XCTAssertEqual(s.posicion, PosicionEnBloque(semana: 5, total: nil))
    }

    func testElTituloDelSujetoBajaDeEscalonSinDejarDeSerElSujeto() throws {
        XCTAssertEqual(EscalonDeTitulo(titulo: "Series 6×800"), .grande)
        XCTAssertEqual(EscalonDeTitulo(titulo: "Chipper de piernas de los buenos"), .medio)
        let largo = try XCTUnwrap(lectura("denso").actual?.dias[3].sesiones[1].title)
        XCTAssertEqual(EscalonDeTitulo(titulo: largo), .chico)
    }

    // MARK: - El faltan-para-empezar y los textos de los estados

    func testFaltanParaEmpezarNuncaEsUnCero() {
        XCTAssertEqual(FechasDelPlan.faltanParaEmpezar(hoy: hoy, inicio: "2026-10-05"), "Faltan 4 días")
        XCTAssertEqual(FechasDelPlan.faltanParaEmpezar(hoy: hoy, inicio: "2026-10-02"), "Falta 1 día")
        XCTAssertNil(FechasDelPlan.faltanParaEmpezar(hoy: hoy, inicio: hoy))
        XCTAssertNil(FechasDelPlan.faltanParaEmpezar(hoy: hoy, inicio: "2026-09-20"))
    }

    // MARK: - El menú de una sesión

    private func claves(_ id: String, dia: Int, _ i: Int = 0) throws -> [ClaveAccion] {
        let s = try XCTUnwrap(lectura(id).actual?.dias[dia].sesiones[i])
        return s.acciones(conCoach: true).map(\.clave)
    }

    func testPendienteYSinHacerMoverMarcarComoHechaYCompletar() throws {
        XCTAssertEqual(try claves("lleno", dia: 3), [.tecnica, .preguntar, .mover, .marcarHecha, .completar])
        XCTAssertEqual(try claves("sin-hacer", dia: 3), try claves("lleno", dia: 3), "sin hacer se lee igual que por hacer")
    }

    func testAMediasCompletarODeshacerYHechaSoloDeshacerYNoSeMueve() throws {
        XCTAssertEqual(try claves("a-medias", dia: 3), [.tecnica, .preguntar, .mover, .completar, .deshacer])
        XCTAssertEqual(try claves("lleno", dia: 0), [.tecnica, .preguntar, .deshacer], "el servidor congela las hechas: no se mueven")
    }

    func testUnLibreSeEditaMientrasNoEsteHechoYSeBorraSiempreUnoDelCoachNoSeBorra() throws {
        let libreHoy = try XCTUnwrap(lectura("denso").actual?.dias[3].sesiones[2])
        XCTAssertTrue(libreHoy.isSelfOrigin)
        let a = libreHoy.acciones(conCoach: true).map(\.clave)
        XCTAssertTrue(a.contains(.editarLibre))
        XCTAssertTrue(a.contains(.borrarLibre))
        let libreHecho = try XCTUnwrap(lectura("denso").actual?.dias[1].sesiones[0])
        let b = libreHecho.acciones(conCoach: true).map(\.clave)
        XCTAssertFalse(b.contains(.editarLibre))
        XCTAssertTrue(b.contains(.borrarLibre))
        XCTAssertFalse(try claves("lleno", dia: 3).contains(.borrarLibre))
    }

    func testSinCoachNoHayAQuienPreguntar() throws {
        let s = try XCTUnwrap(lectura("lleno").actual?.dias[3].sesiones[0])
        XCTAssertFalse(s.acciones(conCoach: false).map(\.clave).contains(.preguntar))
    }

    func testLasDestructivasSonDeshacerYBorrar() throws {
        let s = try XCTUnwrap(lectura("denso").actual?.dias[1].sesiones[0])   // libre y hecho
        XCTAssertEqual(s.acciones(conCoach: true).filter(\.destructiva).map(\.clave), [.deshacer, .borrarLibre])
    }

    func testLosDestinosDeMoverSonLosOtrosSeisDiasConSuCarga() throws {
        let s = try XCTUnwrap(lectura("lleno").actual)
        let hoyS = s.dias[3].sesiones[0]
        XCTAssertEqual(s.diasDestino(de: hoyS).count, 6)
        XCTAssertEqual(s.etiquetaDeDiaDestino(s.dias[0]), "Lunes 28 · 1 sesión")
        XCTAssertEqual(s.etiquetaDeDiaDestino(s.dias[6]), "Domingo 4 · libre")
        let doble = try XCTUnwrap(lectura("doble").actual?.dias[3])
        XCTAssertEqual(try XCTUnwrap(lectura("doble").actual).etiquetaDeDiaDestino(doble), "Hoy · 2 sesiones")
    }

    // MARK: - Marcar como hecha: la semana se recalcula al momento

    func testMarcarHoyComoHechoCambiaElTonoDelSujetoDeAcentoAOk() throws {
        let resp = EjemplosPlan.respuesta(
            lunes: EjemplosPlan.lunes, hoy: hoy,
            dias: [[], [], [], [EjemplosPlan.d(.series800)], [], [], []])
        let id = EjemplosPlan.id(.series800, "2026-10-01")
        CompletedAssignmentsStore.unmark(id)
        defer { CompletedAssignmentsStore.unmark(id) }

        func tono() -> TonoDia {
            var l = lectura("lleno")
            l.actual = SemanaDelPlan.desde(resp)
            return l.vista(NavegacionPlan()).tono
        }
        XCTAssertEqual(tono(), .accion)
        CompletedAssignmentsStore.markCompleted(id)      // la marca optimista de «Marcar como hecha»
        XCTAssertEqual(tono(), .ok)
        CompletedAssignmentsStore.unmark(id)             // la reversión si el servidor falla
        XCTAssertEqual(tono(), .accion)
    }
}
