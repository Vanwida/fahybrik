import XCTest
@testable import FAHYBRIK

// EL CHECK-IN DE LA PORTADA — el paso a paso y lo que comparte con la hoja larga.
//
// El check-in ya no es solo una hoja: es el sujeto de Hoy, una pregunta cada vez. Esto fija lo que NO
// puede divergir entre las dos superficies (las preguntas, el sentido de cada respuesta, la nota) y la
// lógica del paso a paso, que es pura. El envío en sí (`CheckinAnswers.registrar`) es el de la hoja y
// no se repite aquí: toca la red y el almacén del dispositivo.

final class CheckinPasoAPasoTests: XCTestCase {

    // MARK: - Las preguntas, una sola fuente

    func testSonLasCincoPreguntasDeSiempreEnSuOrden() {
        XCTAssertEqual(
            CheckinPregunta.todas.map(\.titulo),
            ["Recuperación muscular", "Ánimo", "Motivación", "Energía", "Calidad del sueño"]
        )
        XCTAssertEqual(CheckinPregunta.todas.first?.izquierda, "1 dolorido")
        XCTAssertEqual(CheckinPregunta.todas.first?.derecha, "5 recuperado")
    }

    func testSoloElDolorYLaFatigaSeGuardanAlReves() {
        XCTAssertEqual(CheckinPregunta.todas.map(\.invertida), [true, false, false, true, false])
    }

    func testLaInversionEsSimetricaYElTresSeQuedaEnElTres() {
        let dolor = CheckinPregunta.todas[0]
        for pantalla in 1...5 {
            XCTAssertEqual(dolor.dePantalla(dolor.delModelo(pantalla)), pantalla)
        }
        XCTAssertEqual(dolor.delModelo(1), 5)
        XCTAssertEqual(dolor.delModelo(3), 3)
        let animo = CheckinPregunta.todas[1]
        XCTAssertEqual(animo.delModelo(4), 4, "una pregunta directa no se invierte")
    }

    // MARK: - El paso a paso

    func testEmpiezaEnLaPrimeraSinRespuestas() {
        let p = PasoAPasoCheckin()
        XCTAssertEqual(p.paso, 0)
        XCTAssertEqual(p.total, 5)
        XCTAssertNil(p.valorActual)
        XCTAssertFalse(p.esLaUltima)
    }

    func testCadaRespuestaSeQuedaEnSuPreguntaYSeVeAlVolver() {
        var p = PasoAPasoCheckin()
        p.elige(4)
        p.avanza()
        p.elige(2)
        p.retrocede()
        XCTAssertEqual(p.paso, 0)
        XCTAssertEqual(p.valorActual, 4, "al volver atrás, la respuesta sigue ahí")
        p.avanza()
        XCTAssertEqual(p.valorActual, 2)
    }

    func testNoSeSaleDeLosExtremos() {
        var p = PasoAPasoCheckin()
        p.retrocede()
        XCTAssertEqual(p.paso, 0)
        for _ in 0..<10 { p.avanza() }
        XCTAssertEqual(p.paso, 4)
        XCTAssertTrue(p.esLaUltima)
    }

    func testUnValorFueraDeLaEscalaNoSeAcepta() {
        var p = PasoAPasoCheckin()
        p.elige(0)
        p.elige(6)
        XCTAssertNil(p.valorActual)
    }

    // MARK: - Las respuestas que viajan

    private func contestado(_ valores: [Int]) -> PasoAPasoCheckin {
        var p = PasoAPasoCheckin()
        for (i, v) in valores.enumerated() {
            p.elige(v)
            if i < valores.count - 1 { p.avanza() }
        }
        return p
    }

    func testTodoLoMejorSumaCienConLasDosInvertidasBienGuardadas() {
        let r = contestado([5, 5, 5, 5, 5]).respuestas(nota: "")
        // Recuperado y con energía = dolor y fatiga BAJOS en el modelo (1), que es como los guarda.
        XCTAssertEqual(r.soreness, 1)
        XCTAssertEqual(r.fatigue, 1)
        XCTAssertEqual(r.mood, 5)
        XCTAssertEqual(r.motivation, 5)
        XCTAssertEqual(r.sleepQuality, 5)
        XCTAssertEqual(r.subScore, 100)
        XCTAssertTrue(r.allAnswered)
    }

    func testTodoLoPeorSumaCero() {
        let r = contestado([1, 1, 1, 1, 1]).respuestas(nota: "")
        XCTAssertEqual(r.soreness, 5)
        XCTAssertEqual(r.fatigue, 5)
        XCTAssertEqual(r.subScore, 0)
    }

    func testLaMismaContestacionPuntuaIgualQueLaHojaLarga() {
        // La hoja larga escribe el modelo con este mismo mapeo: el paso a paso y la hoja no pueden dar
        // una cifra distinta a las mismas cinco respuestas de pantalla.
        let pantalla = [2, 4, 3, 5, 1]
        let pasoAPaso = contestado(pantalla).respuestas(nota: "")
        let hoja = CheckinAnswers()
        for (pregunta, valor) in zip(CheckinPregunta.todas, pantalla) {
            hoja[keyPath: pregunta.campo] = pregunta.delModelo(valor)
        }
        XCTAssertEqual(pasoAPaso.subScore, hoja.subScore)
    }

    func testSinContestarTodoNoHayRespuestasCompletas() {
        var p = PasoAPasoCheckin()
        p.elige(3)
        XCTAssertFalse(p.respuestas(nota: "").allAnswered)
    }

    // MARK: - La nota no se pierde

    func testLaNotaViajaEnElEnvioComoEnLaHojaLarga() {
        let r = contestado([3, 3, 3, 3, 3]).respuestas(nota: "molestia en la pierna izquierda")
        XCTAssertEqual(r.notes, "molestia en la pierna izquierda")
        XCTAssertEqual(r.snapshot(score: r.subScore).notes, "molestia en la pierna izquierda")
        XCTAssertNil(contestado([3, 3, 3, 3, 3]).respuestas(nota: "").snapshot(score: 50).notes,
                     "sin nota no se manda una cadena vacía")
    }

    func testElBorradorDeLaNotaEsElMismoAlmacenQueLaHojaLarga() {
        let previa = CheckinStore.loadDraftNotes()
        defer { CheckinStore.saveDraftNotes(previa) }
        CheckinStore.saveDraftNotes("nota de prueba")
        XCTAssertEqual(CheckinStore.loadDraftNotes(), "nota de prueba")
        CheckinStore.saveDraftNotes("")
        XCTAssertEqual(CheckinStore.loadDraftNotes(), "")
    }
}
