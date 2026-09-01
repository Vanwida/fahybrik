import XCTest
@testable import FAHYBRIK

// EL EMOM — el modo cambia de ronda a ronda sin que cambie el formato. Tests
// del guion PURO, centrados en el fallo que arregla esta noche: antes de
// `TareaEmom.modo`, TODA ronda viajaba `.ojeada` sin excepción — un EMOM de
// burpees pintaba controles que el atleta, en el suelo, no podía tocar.
final class GuionEmomTests: XCTestCase {

    private let maquinas: [GuionEmom.TareaEmom] = [
        GuionEmom.TareaEmom(texto: "Ski 45 s", modo: .ojeada, ergo: "Ski"),
        GuionEmom.TareaEmom(texto: "Bici 45 s", modo: .ojeada, ergo: "Bici"),
    ]
    private let pulso: [GuionEmom.TareaEmom] = [
        GuionEmom.TareaEmom(texto: "10 burpees", modo: .ciego, ergo: nil),
    ]

    // MARK: - El modo lo trae la TAREA, nunca el formato

    func testRondaDeMaquinaEsOjeada() {
        let e = GuionEmom.Estado(
            rondas: 20, ronda: 1, ventanaS: 60, trabajoS: 45, tareas: maquinas,
            enVentanaS: 12, hechaEnS: nil, maquina: true, metrosMaquina: 20,
            bpm: nil, zonaViva: nil
        )
        let p = GuionEmom.paginas(e).first!
        XCTAssertEqual(p.modo, .ojeada, "manos ocupadas en el ski, pero el cuerpo va estable")
    }

    func testRondaDePulsoEsCiega() {
        let e = GuionEmom.Estado(
            rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 60, tareas: pulso,
            enVentanaS: 9, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: nil, zonaViva: nil
        )
        let p = GuionEmom.paginas(e).first!
        XCTAssertEqual(p.modo, .ciego, "en el suelo, en pleno burpee — el reloj no puede pedir nada")
    }

    /// El pulso (segunda página) HEREDA el modo de la tarea del momento, no el
    /// `.ojeada` por defecto que trae `WatchPaginasComunes.pulso`.
    func testElPulsoHeredaElModoDeLaTareaAPulso() {
        let e = GuionEmom.Estado(
            rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 60, tareas: pulso,
            enVentanaS: 9, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: 150, zonaViva: nil
        )
        let paginas = GuionEmom.paginas(e)
        XCTAssertEqual(paginas.count, 2)
        XCTAssertEqual(paginas[1].modo, .ciego, "en el suelo no puedes mirar, estés en la página que estés")
    }

    /// La parada es SIEMPRE `.mando`, incluso si la tarea que se acaba de
    /// cerrar era `.ciego` — de pie, mirando el reloj, decidiendo si bebes.
    func testLaParadaEsMandoAunqueLaTareaFueraCiega() {
        let e = GuionEmom.Estado(
            rondas: 10, ronda: 4, ventanaS: 60, trabajoS: 45, tareas: pulso,
            enVentanaS: 50, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: nil, zonaViva: nil
        )
        XCTAssertEqual(GuionEmom.faseDe(e), .parada)
        XCTAssertEqual(GuionEmom.paginas(e).first!.modo, .mando)
    }

    // MARK: - El segundo nivel: máquina emparejada vs. dosis del coach

    func testSegundoNivelConMaquinaEmparejadaMuestraMetros() {
        let e = GuionEmom.Estado(
            rondas: 20, ronda: 1, ventanaS: 60, trabajoS: 45, tareas: maquinas,
            enVentanaS: 12, hechaEnS: nil, maquina: true, metrosMaquina: 96,
            bpm: nil, zonaViva: nil
        )
        let p = GuionEmom.paginas(e).first!
        XCTAssertEqual(p.segundoEtiqueta, "Ski")
        XCTAssertEqual(p.segundoValor, "96 m")
    }

    /// Sin máquina emparejada — la tarea es de máquina, pero no hay dato en
    /// vivo — cae a lo que escribió el coach, no a un contador a cero falso.
    func testSegundoNivelSinEmparejarCaeALaDosisDelCoach() {
        let e = GuionEmom.Estado(
            rondas: 20, ronda: 1, ventanaS: 60, trabajoS: 45, tareas: maquinas,
            enVentanaS: 12, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: nil, zonaViva: nil
        )
        let p = GuionEmom.paginas(e).first!
        XCTAssertNil(p.segundoEtiqueta)
        XCTAssertEqual(p.segundoValor, "Ski 45 s")
    }

    // MARK: - La nota, coherente con si hay máquina que emparejar

    func testNotaAPulsoDiceLoDicesTu() {
        let e = GuionEmom.Estado(
            rondas: 10, ronda: 1, ventanaS: 60, trabajoS: 60, tareas: pulso,
            enVentanaS: 5, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: nil, zonaViva: nil
        )
        XCTAssertEqual(GuionEmom.paginas(e).first!.nota, WatchNota.loDicesTu)
    }

    func testNotaConErgoSinEmparejarDiceSinMaquina() {
        let e = GuionEmom.Estado(
            rondas: 20, ronda: 1, ventanaS: 60, trabajoS: 45, tareas: maquinas,
            enVentanaS: 12, hechaEnS: nil, maquina: false, metrosMaquina: nil,
            bpm: nil, zonaViva: nil
        )
        XCTAssertEqual(GuionEmom.paginas(e).first!.nota, WatchNota.sinMaquina)
    }

    func testNotaConErgoEmparejadoDiceDelMovil() {
        let e = GuionEmom.Estado(
            rondas: 20, ronda: 1, ventanaS: 60, trabajoS: 45, tareas: maquinas,
            enVentanaS: 12, hechaEnS: nil, maquina: true, metrosMaquina: 20,
            bpm: nil, zonaViva: nil
        )
        XCTAssertEqual(GuionEmom.paginas(e).first!.nota, WatchNota.delMovil)
    }
}
