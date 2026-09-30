import XCTest
@testable import FAHYBRIK

// LO QUE DECIDE LA BANDEJA Y LO QUE DICE, sin pintar nada (`LecturaBandeja.swift`).
//
// El estado que toca es una decisión con un ORDEN de reglas (lo que hay gana a todo, luego «cargó y no hay
// nada», luego el fallo, luego el frío) y cada regla protege a una pantalla real: si se cambia el orden, un
// atleta con cosas en su bandeja vería «no pudimos cargar» solo porque falló una revalidación.
final class DecideBandejaTests: XCTestCase {

    private let conCosas = BandejaComunicados.agrupar(EscenariosComunicados.semanaFuerte)
    private let vacia = BandejaComunicados()

    // MARK: - El estado

    func test_conCosas_ganaAlFalloYALaCarga() {
        // Una revalidación que falla no le quita a nadie lo que ya tenía guardado.
        XCTAssertEqual(DecideBandeja.estado(conCosas, cargada: true, fallo: true), .conCosas(conCosas))
        XCTAssertEqual(DecideBandeja.estado(conCosas, cargada: false, fallo: false), .conCosas(conCosas))
    }

    func test_cargoYNoHayNada_esUnVacioHonesto() {
        XCTAssertEqual(DecideBandeja.estado(vacia, cargada: true, fallo: false), .vacia)
        // Cargó alguna vez: aunque la última revalidación haya fallado, lo cierto es que no hay nada.
        XCTAssertEqual(DecideBandeja.estado(vacia, cargada: true, fallo: true), .vacia)
    }

    func test_falloSinNadaGuardado_seDiceYNoSeDisfrazaDeVacio() {
        XCTAssertEqual(DecideBandeja.estado(vacia, cargada: false, fallo: true), .error)
    }

    func test_primeraCargaEnFrio_esElEsqueleto() {
        XCTAssertEqual(DecideBandeja.estado(vacia, cargada: false, fallo: false), .cargando)
    }

    // MARK: - La línea de cada fila

    func test_pendientes_dicenLoQueReclamaYNoLoQueHay() {
        XCTAssertEqual(DetalleDeFila.pendientes(0), "nada pendiente")
        XCTAssertEqual(DetalleDeFila.pendientes(1), "1 pendiente")
        XCTAssertEqual(DetalleDeFila.pendientes(3), "3 pendientes")
    }

    func test_preguntaRespondida_enseñaLoQueElegisteYSuConsecuencia() {
        let abierta = EscenariosComunicados.pregunta()
        XCTAssertEqual(DetalleDeFila.pregunta(abierta), abierta.body)

        let respondida = EscenariosComunicados.pregunta(state: .respondido, answered: "9002")
        XCTAssertEqual(DetalleDeFila.pregunta(respondida), "Le dijiste: Sábado 14. El plan se queda como está.")
    }

    func test_tareaAbierta_diceCuandoVenceYElPorque_yCerradaSoloElPorque() {
        let abierta = EscenariosComunicados.semanaFuerte.first { $0.id == "104" }!
        let linea = DetalleDeFila.tarea(abierta) ?? ""
        XCTAssertTrue(linea.hasSuffix("Sin ellos, los bloques 1 a 3 van con ritmos estimados."), linea)
        XCTAssertNotNil(abierta.venceTexto())
        XCTAssertTrue(linea.hasPrefix(abierta.venceTexto() ?? "?"), linea)

        let cerrada = EscenariosComunicados.alDia.first { $0.id == "103" }!
        XCTAssertEqual(DetalleDeFila.tarea(cerrada), "Necesita 4 a 6 semanas de carga.")
    }

    // MARK: - El pie de cada detalle

    func test_pieDeLaTarea_dicePorFaseQuienLaVe() {
        let abierta = EscenariosComunicados.semanaFuerte.first { $0.id == "103" }!
        XCTAssertEqual(PieDeDetalle.tarea(abierta), "Pablo verá que la has hecho.")
        let cerrada = EscenariosComunicados.alDia.first { $0.id == "103" }!
        XCTAssertEqual(PieDeDetalle.tarea(cerrada), "Pablo ya la ve cerrada.")
    }

    func test_pieDelProtocolo_cuentaLasCasillasQueFaltan() {
        // Cinco casillas y dos pasos de lectura: faltan CASILLAS, no pasos.
        XCTAssertEqual(PieDeDetalle.protocolo(EscenariosComunicados.protocolo(marcados: ["9101", "9102", "9104"])),
                       "Te quedan 2 pasos por marcar.")
        let casi = EscenariosComunicados.protocolo(marcados: ["9101", "9102", "9104", "9105"])
        XCTAssertEqual(PieDeDetalle.protocolo(casi), "Te queda 1 paso por marcar.")

        var completo = EscenariosComunicados.protocolo(marcados: ["9101", "9102", "9104", "9105", "9106"])
        XCTAssertEqual(PieDeDetalle.protocolo(completo), "Pablo verá que lo has hecho.")
        completo.aplicarHecho()
        XCTAssertEqual(PieDeDetalle.protocolo(completo), "Pablo ya lo ve cerrado.")
    }

    func test_pieDeLaPregunta_usaElNombreDelCoach_ysinEl_tuCoach() {
        let p = EscenariosComunicados.pregunta()
        XCTAssertEqual(PieDeDetalle.preguntaRespondida(p), "Respondido. Pablo lo verá.")
        XCTAssertEqual(
            PieDeDetalle.preguntaBloquea(p),
            "Mientras no lo digas, Pablo deja esta parte del plan a la espera."
        )
        XCTAssertEqual(Comunicado.nombreCoach(nil), "tu coach")
        XCTAssertEqual(Comunicado.nombreCoach("  "), "tu coach")
    }
}
