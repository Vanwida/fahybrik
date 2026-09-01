import XCTest
@testable import FAHYBRIK

// LO POCO QUE DECIDE LA PANTALLA DE «¿ESTOY MEJORANDO?».
//
// El veredicto, los deltas y el porcentaje en banda llegan servidos y no se
// prueban aquí: probarlos sería probar el servidor desde el móvil. Lo que sí es
// nuestro —qué se calla, qué botón sale, y bajo qué gráfico se apoya el
// veredicto— se prueba entero, porque es donde una pantalla honesta se separa de
// una que rellena.
final class ProgresoDeCarreraTests: XCTestCase {

    // MARK: - Qué se calla y qué se declara

    /// «AÚN NO» Y «NO APLICA» NO SON LO MISMO. Al recién llegado le falta tiempo y
    /// se le dibuja el plazo; al que nunca corrió cansado no le falta nada, y
    /// enseñarle un hueco prometiéndole esa lectura es ruido con forma de dato.
    func testSoloSeCallanLasFaltasQueNoAplican() {
        XCTAssertTrue(ProgresoDeCarrera.seCalla(.ocasion))
        XCTAssertTrue(ProgresoDeCarrera.seCalla(.intencion))
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.ancla))
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.sensor))
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.historia(llevas: 3, hacen: 6)))
    }

    /// Un botón que no lleva a ningún sitio es peor que ninguno: esperar no es una
    /// acción, así que la falta de historia no tiene salida.
    func testSoloTienenSalidaLasFaltasQueElAtletaPuedeResolver() {
        XCTAssertEqual(ProgresoDeCarrera.salidaDe(.ancla), "Hacer el test de zonas")
        XCTAssertEqual(ProgresoDeCarrera.salidaDe(.sensor), "Conectar banda de pulso")
        XCTAssertNil(ProgresoDeCarrera.salidaDe(.historia(llevas: 3, hacen: 6)))
        XCTAssertNil(ProgresoDeCarrera.salidaDe(.ocasion))
        XCTAssertNil(ProgresoDeCarrera.salidaDe(.intencion))
    }

    /// EL CASO QUE DA SENTIDO A `faltaComun`: sin test de umbral se caen forma y
    /// reparto por LA MISMA razón, y el atleta tiene que ver UN botón, no dos
    /// textos pidiéndole el mismo test.
    func testDosLecturasQueEsperanLoMismoDanUnSoloBoton() {
        let cobertura = Cobertura(forma: .ancla, esfuerzos: nil, volumen: nil,
                                  reparto: .ancla, pedido: .intencion, cansado: .ocasion)
        XCTAssertEqual(ProgresoDeCarrera.salidaDeLaPantalla(cobertura), "Hacer el test de zonas")
    }

    /// Y si esperan cosas DISTINTAS no se elige una por el atleta: no sale botón.
    func testFaltasDistintasNoEligenUnaSalidaPorElAtleta() {
        let cobertura = Cobertura(forma: .sensor, esfuerzos: nil, volumen: nil,
                                  reparto: .ancla, pedido: nil, cansado: nil)
        XCTAssertNil(ProgresoDeCarrera.salidaDeLaPantalla(cobertura))
    }

    /// Dos faltas de historia con distinto plazo siguen esperando LO MISMO —
    /// tiempo—, así que cuentan como una sola razón aunque sus números difieran.
    func testLaMismaRazonConDistintoPlazoSigueSiendoLaMisma() {
        let comun = ProgresoDeCarrera.faltaComun([
            .historia(llevas: 2, hacen: 6), .historia(llevas: 4, hacen: 6),
        ])
        XCTAssertNotNil(comun, "el plazo cambia; la razón no")
    }

    // MARK: - Bajo qué gráfico se apoya el veredicto

    /// Los dos peldaños fuertes tienen gráfico propio y la marca cuelga de él.
    func testLosPeldanosFuertesCuelganDeSuPropioGrafico() {
        let c = todoDisponible
        XCTAssertEqual(
            ProgresoDeCarrera.soporte(veredicto(.alPulso(ganaSKm: 11, semanas: 8)),
                                      cobertura: c, history: historia()),
            .forma)
        XCTAssertEqual(
            ProgresoDeCarrera.soporte(veredicto(.esfuerzos(ganaS: 42, metros: 5000)),
                                      cobertura: c, history: historia()),
            .esfuerzos)
    }

    /// EL TERCER PELDAÑO NO TIENE GRÁFICO PROPIO, así que baja al que exista — los
    /// esfuerzos antes que el volumen, porque una curva de esfuerzos habla de
    /// rendimiento y las barras solo de cuánto se corrió. Un bloque propio le
    /// daría al peldaño MÁS DÉBIL más peso visual que a los fuertes.
    func testElTercerPeldanoBajaAlGraficoQueExista() {
        // Sin test de umbral: forma apagada, pero la curva de esfuerzos está.
        let sinAncla = Cobertura(forma: .ancla, esfuerzos: nil, volumen: nil,
                                 reparto: .ancla, pedido: nil, cansado: .ocasion)
        XCTAssertEqual(
            ProgresoDeCarrera.soporte(veredicto(.mismoTipo(ganaSKm: 4, semanas: 7)),
                                      cobertura: sinAncla, history: historia()),
            .esfuerzos)

        // Y sin esfuerzos con los que dibujar la curva, quedan las barras.
        let sinEsfuerzos = Cobertura(forma: .ancla, esfuerzos: .historia(llevas: 3, hacen: 6),
                                     volumen: nil, reparto: .ancla, pedido: nil, cansado: .ocasion)
        XCTAssertEqual(
            ProgresoDeCarrera.soporte(veredicto(.mismoTipo(ganaSKm: 4, semanas: 7)),
                                      cobertura: sinEsfuerzos, history: historia(esfuerzos: [])),
            .volumen)
    }

    /// SI NO QUEDA NINGÚN GRÁFICO, EL VEREDICTO NO SE DA. Afirmar «vas mejor» sin
    /// nada que enseñar es pedirle al atleta que se fíe, y esta pantalla existe
    /// para no hacer eso.
    ///
    /// **Contra el servidor real este estado no se alcanza hoy** —la serie semanal
    /// llega rellena de ceros por `generate_series`, así que siempre quedan las
    /// barras—, y aun así la regla se implementa y se prueba: es una decisión de
    /// producto, no una guarda defensiva, y el día que esa consulta deje de
    /// rellenar la pantalla degrada sola en vez de afirmar a ciegas.
    func testSinNingunGraficoElVeredictoNoSeDa() {
        let sinNada = Cobertura(forma: .ancla, esfuerzos: .historia(llevas: 1, hacen: 6),
                                volumen: .historia(llevas: 1, hacen: 6), reparto: .ancla,
                                pedido: .intencion, cansado: .ocasion)
        let v = veredicto(.mismoTipo(ganaSKm: 4, semanas: 7))
        let h = historia(esfuerzos: [], semanasKm: [])

        XCTAssertNil(ProgresoDeCarrera.soporte(v, cobertura: sinNada, history: h))
        XCTAssertTrue(ProgresoDeCarrera.degradaPorFaltaDeGrafico(v, cobertura: sinNada, history: h))
    }

    /// Una serie entera a cero no es un gráfico: el atleta que nunca corrió tiene
    /// doce barras de cero, y sobre eso no se sostiene ninguna afirmación.
    func testDoceSemanasAceroNoSostienenUnVeredicto() {
        let sinNada = Cobertura(forma: .ancla, esfuerzos: .historia(llevas: 1, hacen: 6),
                                volumen: nil, reparto: .ancla, pedido: .intencion, cansado: .ocasion)
        let aCero = (0..<12).map { PuntoSemana(semana: "2026-06-\(10 + $0)", valor: 0) }
        let v = veredicto(.mismoTipo(ganaSKm: 4, semanas: 7))
        XCTAssertTrue(ProgresoDeCarrera.degradaPorFaltaDeGrafico(
            v, cobertura: sinNada, history: historia(esfuerzos: [], semanasKm: aCero)))
    }

    /// Sin peldaño no hay nada que degradar: el veredicto ya dice «aún no».
    func testSinPeldanoNoHayNadaQueDegradar() {
        let v = Veredicto(clase: .aunNo, frase: "Aún no", peldano: nil,
                          plazo: .init(llevas: 3, hacen: 6))
        XCTAssertFalse(ProgresoDeCarrera.degradaPorFaltaDeGrafico(
            v, cobertura: todoDisponible, history: historia()))
    }

    // MARK: - Piezas

    private var todoDisponible: Cobertura {
        Cobertura(forma: nil, esfuerzos: nil, volumen: nil,
                  reparto: nil, pedido: nil, cansado: nil)
    }

    private func veredicto(_ p: Peldano) -> Veredicto {
        Veredicto(clase: .mejor, frase: "Vas mejor", peldano: p, plazo: nil)
    }

    private func historia(
        esfuerzos: [Esfuerzo] = [.init(metros: 1000, segundos: 210),
                                 .init(metros: 5000, segundos: 1152)],
        semanasKm: [PuntoSemana] = [.init(semana: "2026-08-03", valor: 38),
                                    .init(semana: "2026-08-10", valor: 44)]
    ) -> RunningHistory {
        RunningHistory(
            semanas: 28, zonasMedidas: true, conPulso: true, ppmReferencia: 148,
            zonaReferencia: 2, vo2: nil, alPulso: [], esfuerzos: esfuerzos,
            esfuerzosAntes: [], semanasKm: semanasKm, zonasS: [:], segundosCorriendo: 0,
            pedido: nil, cansado: [], carrera: nil, mismoTipo: nil,
            // Las cuatro lecturas de DENSIDAD (umbral, zonas de ritmo, cadencia y
            // medias por tipo) no alimentan el veredicto, así que aquí van vacías:
            // lo que estas pruebas fijan es la escalera de evidencia.
            umbral: nil, zonasRitmo: [], cadencia: [], porTipo: []
        )
    }
}
