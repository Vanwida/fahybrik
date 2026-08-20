import XCTest
@testable import FAHYBRIK

// EL MODELO PURO, sin decodificador delante — mismo estilo que
// `LecturaDeCarreraTests`: construir el `Bloque` a mano y comprobar la regla.

final class LecturaDeSesionModeloTests: XCTestCase {

    // MARK: - tipoDeSesion

    func testUnaSolaModalidadDeCorrerEsCorrer() {
        let bloques = [Bloque(modalidad: .correr, etiqueta: "Rodaje", duracionS: 1800, distanciaM: 5000)]
        XCTAssertEqual(tipoDeSesion(bloques: bloques, formatosDeBloques: ["for_time"]), .correr)
    }

    func testUnaSolaModalidadDeFuerzaEsFuerza() {
        let bloques = [Bloque(modalidad: .fuerza, etiqueta: "Sentadilla", repsTotal: 25, kg: 100)]
        XCTAssertEqual(tipoDeSesion(bloques: bloques, formatosDeBloques: ["straight_sets"]), .fuerza)
    }

    /// EL FORMATO MANDA ANTES QUE LAS MODALIDADES: un bloque de fuerza sin
    /// ningún segmento logueado (formato `straight_sets`) sigue siendo fuerza,
    /// no el neutro «sin bloques».
    func testFormatoDeFuerzaGanaAunqueNoHayaBloquesLogueados() {
        XCTAssertEqual(tipoDeSesion(bloques: [], formatosDeBloques: ["straight_sets"]), .fuerza)
    }

    /// CORRER + OTRA MÁQUINA + RELOJ/TANDA = HYROX. Ni solo el formato ni solo
    /// las modalidades bastan por separado.
    func testCorrerMasErgometroEnEstructuraEsHyrox() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr", duracionS: 255, ronda: 1, distanciaM: 1000),
            Bloque(modalidad: .ergometro(.ski), etiqueta: "Ski erg", duracionS: 115, ronda: 1, distanciaM: 500),
        ]
        XCTAssertEqual(tipoDeSesion(bloques: bloques, formatosDeBloques: ["for_time"]), .hyrox)
    }

    /// LA MISMA MEZCLA SIN ESTRUCTURA (fuerza y trineos, card 118) es MIXTO, no
    /// HYROX: sin reloj/tanda no hay simulacro.
    func testMezclaSinEstructuraEsMixto() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Rodaje", duracionS: 357, distanciaM: nil),
            Bloque(modalidad: .fuerza, etiqueta: "Peso muerto", duracionS: 669),
            Bloque(modalidad: .funcional, etiqueta: "Trineos", duracionS: 260),
        ]
        XCTAssertEqual(tipoDeSesion(bloques: bloques, formatosDeBloques: ["free"]), .mixto)
    }

    func testSinBloquesElTipoEsElNeutro() {
        XCTAssertEqual(tipoDeSesion(bloques: [], formatosDeBloques: []), .funcional)
    }

    // MARK: - distanciaTotalDeSesion — LA REGLA QUE NO SE SALTA (card 124)

    /// DOS MÁQUINAS DE ERGÓMETRO DISTINTAS NO SE SUMAN: remar 500 m y esquiar
    /// 500 m son movimientos tan distintos como correr y remar.
    func testDosErgometrosDistintosNoSumanSuDistancia() {
        let bloques = [
            Bloque(modalidad: .ergometro(.ski), etiqueta: "Ski erg", duracionS: 115, distanciaM: 500),
            Bloque(modalidad: .ergometro(.row), etiqueta: "Remo", duracionS: 118, distanciaM: 500),
        ]
        XCTAssertNil(distanciaTotalDeSesion(bloques), "dos máquinas distintas: el total no la enseña")
    }

    /// CORRER + ERGÓMETRO tampoco se mezclan.
    func testCorrerYErgometroNoSeMezclan() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr", duracionS: 255, distanciaM: 1000),
            Bloque(modalidad: .ergometro(.row), etiqueta: "Remo", duracionS: 118, distanciaM: 500),
        ]
        XCTAssertNil(distanciaTotalDeSesion(bloques))
    }

    /// UNA SOLA CUBETA SÍ SUMA — dos tramos de correr sí son la misma modalidad.
    func testUnaSolaCubetaSiSuma() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr 1", duracionS: 255, distanciaM: 1000),
            Bloque(modalidad: .correr, etiqueta: "Correr 2", duracionS: 260, distanciaM: 1000),
        ]
        let total = try! XCTUnwrap(distanciaTotalDeSesion(bloques))
        XCTAssertEqual(total.metros, 2000)
        XCTAssertEqual(total.modo, "corriendo")
        XCTAssertEqual(total.ritmoSkm, (255.0 + 260.0) / 2.0)
    }

    /// SIN DISTANCIA MEDIDA (fuerza, funcional) no hay recuadro.
    func testSinDistanciaMedidaNoHayTotal() {
        let bloques = [Bloque(modalidad: .fuerza, etiqueta: "Sentadilla", repsTotal: 25, kg: 100)]
        XCTAssertNil(distanciaTotalDeSesion(bloques))
    }

    /// UN TRAMO SIN SU PROPIO CRONÓMETRO no puede dar un ritmo medio: el ritmo
    /// se calla, la distancia se sigue enseñando.
    func testDistanciaSinDuracionCompletaNoTieneRitmo() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr 1", duracionS: 255, distanciaM: 1000),
            Bloque(modalidad: .correr, etiqueta: "Correr 2", duracionS: nil, distanciaM: 1000),
        ]
        let total = try! XCTUnwrap(distanciaTotalDeSesion(bloques))
        XCTAssertEqual(total.metros, 2000)
        XCTAssertNil(total.ritmoSkm, "una duración incompleta no puede dar un ritmo medio")
    }

    // MARK: - ritmoMedioDeCorrer — independiente del total

    /// EN UN SIMULACRO, la distancia total se calla (correr + ergómetro), pero
    /// el ritmo de CORRER sigue teniendo una respuesta propia.
    func testRitmoDeCorrerExisteAunqueElTotalSeCalle() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr", duracionS: 255, distanciaM: 1000),
            Bloque(modalidad: .ergometro(.ski), etiqueta: "Ski erg", duracionS: 115, distanciaM: 500),
        ]
        XCTAssertNil(distanciaTotalDeSesion(bloques))
        XCTAssertEqual(ritmoMedioDeCorrer(bloques), 255)
    }

    func testSinCorrerNoHayRitmoDeCorrer() {
        let bloques = [Bloque(modalidad: .fuerza, etiqueta: "Sentadilla", repsTotal: 25, kg: 100)]
        XCTAssertNil(ritmoMedioDeCorrer(bloques))
    }

    // MARK: - volumenDeFuerza — DEGRADADO respecto al doble (sin series)

    /// SIN LA SERIE A SERIE, el volumen es reps totales × la carga más alta
    /// declarada — exacto en una carga uniforme.
    func testVolumenDeFuerzaSumaRepsPorCargaMaxima() {
        let bloques = [
            Bloque(modalidad: .fuerza, etiqueta: "Sentadilla", repsTotal: 25, kg: 100),
            Bloque(modalidad: .fuerza, etiqueta: "Press banca", repsTotal: 32, kg: 70),
            // Peso corporal: no hay carga que sumar (§7 — no se inventa el peso
            // del atleta).
            Bloque(modalidad: .fuerza, etiqueta: "Dominadas", repsTotal: 32, kg: nil),
        ]
        let (volumen, masPesada) = volumenDeFuerza(bloques)
        XCTAssertEqual(volumen, 25 * 100 + 32 * 70)
        XCTAssertEqual(masPesada?.etiqueta, "Sentadilla")
        XCTAssertEqual(masPesada?.kg, 100)
        XCTAssertEqual(masPesada?.reps, 25)
    }

    func testSinCargaEnNingunBloqueElVolumenEsCero() {
        let bloques = [Bloque(modalidad: .fuerza, etiqueta: "Dominadas", repsTotal: 32, kg: nil)]
        let (volumen, masPesada) = volumenDeFuerza(bloques)
        XCTAssertEqual(volumen, 0)
        XCTAssertNil(masPesada)
    }

    // MARK: - agruparPorRonda

    /// SIN RONDA EN NINGÚN BLOQUE (el cable de hoy, ver el decodificador) el
    /// agrupado es UN solo grupo con `ronda: nil` — lista plana.
    func testSinRondaEnNingunBloqueSalePlano() {
        let bloques = [
            Bloque(modalidad: .fuerza, etiqueta: "Peso muerto", duracionS: 669),
            Bloque(modalidad: .funcional, etiqueta: "Trineos", duracionS: 260),
        ]
        let grupos = agruparPorRonda(bloques)
        XCTAssertEqual(grupos.count, 1)
        XCTAssertNil(grupos[0].ronda)
        XCTAssertEqual(grupos[0].bloques.count, 2)
    }

    /// CON RONDA, agrupa bloques consecutivos de la MISMA ronda.
    func testConRondaAgrupaLosBloquesConsecutivos() {
        let bloques = [
            Bloque(modalidad: .correr, etiqueta: "Correr", duracionS: 255, ronda: 1),
            Bloque(modalidad: .ergometro(.ski), etiqueta: "Ski erg", duracionS: 115, ronda: 1),
            Bloque(modalidad: .correr, etiqueta: "Correr", duracionS: 260, ronda: 2),
            Bloque(modalidad: .funcional, etiqueta: "Burpee Broad Jump", duracionS: 75, ronda: 2),
        ]
        let grupos = agruparPorRonda(bloques)
        XCTAssertEqual(grupos.count, 2)
        XCTAssertEqual(grupos[0].ronda, 1)
        XCTAssertEqual(grupos[0].bloques.count, 2)
        XCTAssertEqual(grupos[1].ronda, 2)
    }
}
