import XCTest
@testable import FAHYBRIK

// LO QUE ESTE TEST DEFIENDE ES UNA FRASE: la media se gana el derecho a ser el
// sujeto sólo si la carrera fue una sola cosa. Todo lo demás son las maneras de
// romperla.
//
// Son los mismos casos que recorre el doble en
// `web/tests/design-twin/tramos.test.ts`, uno a uno y con los mismos números: si
// el teléfono y el doble discreparan sobre quién es el sujeto de una carrera, el
// diseño aprobado dejaría de describir la app.
//
// Los datos marcados «(real)» salen de la base. Los de muestras están generados
// aquí porque LA APP NO GUARDA NINGUNA SERIE DE RITMO — ni una: el polilínea de
// la ruta lleva coordenadas y ni un solo tiempo. Que el único caso que hoy se
// puede alimentar con producción sea el de «no se sabe» es, en sí, el hallazgo.

final class FormaDeCarreraTests: XCTestCase {

    // MARK: - Constructores

    /// Las ocho vueltas de correr de una carrera real. HYROX son 8 × 1 km, así que
    /// cada número es directamente un ritmo en s/km.
    private let hyrox44: [Double] = [227, 234, 247, 245, 258, 249, 250, 248]  // carrera 44 (real)
    private let hyrox45: [Double] = [263, 242, 251, 255, 248, 253, 250, 226]  // carrera 45 (real)

    private func comoVueltas(_ splits: [Double]) -> FormaDeCarrera.Carrera {
        FormaDeCarrera.Carrera(
            distanciaM: Double(splits.count) * 1000,
            duracionS: splits.reduce(0, +),
            marcados: splits.map {
                FormaDeCarrera.TramoMarcado(tipo: .fuerte, duracionS: $0, distanciaM: 1000)
            }
        )
    }

    /// Un fartlek con la forma que se vio en Instagram: 8 fuertes de 1' contra
    /// suaves de 1'30", con su calentamiento y su vuelta a la calma. El ruido es
    /// determinista (una sinusoide, no un aleatorio) para que el test no pueda
    /// fallar un día de cada veinte.
    private func fartlek(fuerteSkm: Double = 238,
                         suaveSkm: Double = 312,
                         reps: Int = 8,
                         cadaS: Double = 5) -> FormaDeCarrera.Carrera {
        var plan: [(dur: Double, skm: Double?)] = [(dur: 600, skm: 330)]
        for i in 0..<reps {
            plan.append((dur: 60, skm: fuerteSkm))
            if i < reps - 1 { plan.append((dur: 90, skm: suaveSkm)) }
        }
        plan.append((dur: 300, skm: 330))
        return conMuestras(plan, cadaS: cadaS)
    }

    private func conMuestras(_ plan: [(dur: Double, skm: Double?)],
                             cadaS: Double) -> FormaDeCarrera.Carrera {
        var muestras: [FormaDeCarrera.Muestra] = []
        var t: Double = 0
        var metros: Double = 0
        for paso in plan {
            var d: Double = 0
            while d < paso.dur {
                // ±4 s/km de ondulación: el ruido real de un ritmo por GPS.
                let ritmo = paso.skm.map { $0 + sin(t / 7) * 4 }
                muestras.append(FormaDeCarrera.Muestra(t: t, ritmoSkm: ritmo))
                if let ritmo { metros += (cadaS / ritmo) * 1000 }
                t += cadaS
                d += cadaS
            }
        }
        return FormaDeCarrera.Carrera(distanciaM: metros.rounded(), duracionS: t, muestras: muestras)
    }

    // MARK: - Sin serie de ritmo

    func testSinSerieNoInventaTramosYDelataLaMediaSiElCoachMandoContraste() {
        // Ejecución real: cinta en vivo, 1001,08 m en 361 s, UN solo segmento. Es
        // literalmente todo lo que la app guarda hoy de una carrera así.
        let l = FormaDeCarrera.lectura(de: .init(distanciaM: 1001.08,
                                                 duracionS: 361,
                                                 formaPrescrita: .conContraste))
        XCTAssertEqual(l.forma, .noSeSabe)
        XCTAssertEqual(l.motivo, .sinSerie)
        XCTAssertTrue(l.tramos.isEmpty)
        XCTAssertNil(l.certeza)
        // Lo que nos separa de Apple: no sabemos partirla, pero sabemos que miente.
        XCTAssertTrue(l.mediaEsMezcla)
        XCTAssertEqual(Int(l.mediaSkm!.rounded()), 361)
    }

    func testSinSerieYSinContrastePrescritoLaMediaNoSeAcusaDeNada() {
        let l = FormaDeCarrera.lectura(de: .init(distanciaM: 1001.08,
                                                 duracionS: 361,
                                                 formaPrescrita: .continua))
        XCTAssertEqual(l.forma, .noSeSabe)
        XCTAssertFalse(l.mediaEsMezcla)
    }

    func testUnasPocasMuestrasNoBastanParaResolverUnTramo() {
        XCTAssertEqual(FormaDeCarrera.lectura(de: fartlek(cadaS: 60)).motivo, .muestrasEscasas)
        let unaSola = FormaDeCarrera.Carrera(distanciaM: 5000,
                                             duracionS: 1500,
                                             muestras: [FormaDeCarrera.Muestra(t: 0, ritmoSkm: 300)])
        XCTAssertEqual(FormaDeCarrera.lectura(de: unaSola).motivo, .muestrasEscasas)
    }

    // MARK: - Tramos marcados

    func testCincoFuertesMarcadosYUnaRecuperacionQueNadieGraboSIEsContraste() {
        // El caso de producción hasta el 29-jul: el motor grababa los tramos de
        // trabajo y tiraba los de recuperación, así que un 5×1000 llega con cinco
        // fuertes sueltos. Llamar «uniforme» a eso absolvería a una media que
        // promedia lo que tenemos con lo que perdimos.
        let l = FormaDeCarrera.lectura(de: .init(
            distanciaM: 9500,
            duracionS: 2700,
            marcados: [250, 249, 248, 247, 246].map {
                FormaDeCarrera.TramoMarcado(tipo: .fuerte, duracionS: $0, distanciaM: 1000)
            }
        ))
        XCTAssertEqual(l.forma, .conContraste)
        XCTAssertEqual(l.certeza, .marcados)
        XCTAssertEqual(l.fuerte?.n, 5)
        XCTAssertTrue(l.mediaEsMezcla)
        // Lo que no hay, no se pinta: no había suave que registrar.
        XCTAssertNil(l.suave)
        XCTAssertNil(l.contrasteSkm)
    }

    func testOchoVueltasRealesQueCubrenLaSesionEnteraSonUnaSolaCosa() {
        let l = FormaDeCarrera.lectura(de: comoVueltas(hyrox44))
        XCTAssertEqual(l.forma, .uniforme)
        XCTAssertFalse(l.mediaEsMezcla)
        XCTAssertEqual(Int(l.mediaSkm!.rounded()), 245)
    }

    func testElAguanteSaleDeLasMitadesYLosExtremosSeDicenTalCual() {
        let a = FormaDeCarrera.lectura(de: comoVueltas(hyrox44)).aguante!
        XCTAssertEqual(a.primeraSkm, 227)
        XCTAssertEqual(a.ultimaSkm, 248)
        XCTAssertEqual(a.derivaSkm, 13.0, accuracy: 0.05)   // 238,25 → 251,25
        XCTAssertEqual(a.veredicto, .seTeFue)

        // La misma carrera, otro atleta: bajar de ritmo no es un fallo, es negativo.
        let b = FormaDeCarrera.lectura(de: comoVueltas(hyrox45)).aguante!
        XCTAssertEqual(b.derivaSkm, -8.5, accuracy: 0.05)
        XCTAssertEqual(b.veredicto, .deMenosAMas)
    }

    func testConMenosDeCuatroRepeticionesElAguanteEsUnaAnecdotaYNoSeLee() {
        XCTAssertNil(FormaDeCarrera.lectura(de: comoVueltas(Array(hyrox44.prefix(3)))).aguante)
    }

    func testElRitmoDeUnGrupoEsTiempoEntreDistanciaNoLaMediaDeLosRitmos() {
        // A propósito con dos ritmos extremos, que es donde la diferencia se ve: la
        // media aritmética diría 5:00/km y la verdad es 4:27, porque el minuto
        // rápido cubre el doble de metros que el lento y pesa el doble.
        let l = FormaDeCarrera.lectura(de: .init(
            distanciaM: 2250,
            duracionS: 600,
            marcados: [
                FormaDeCarrera.TramoMarcado(tipo: .fuerte, duracionS: 300, distanciaM: 1500),
                FormaDeCarrera.TramoMarcado(tipo: .fuerte, duracionS: 300, distanciaM: 750),
            ]
        ))
        // Cubre la sesión entera y todo es fuerte: uniforme, y el ritmo vive en la media.
        XCTAssertEqual(l.forma, .uniforme)
        XCTAssertEqual(l.mediaSkm!, 266.67, accuracy: 0.05)
        XCTAssertNotEqual(l.mediaSkm!, 300, accuracy: 0.5)
    }

    // MARK: - Detección desde el ritmo

    func testUnFartlekLibreSeParteEnSusDosRitmosYNingunoEsLaMedia() {
        let l = FormaDeCarrera.lectura(de: fartlek())
        XCTAssertEqual(l.forma, .conContraste)
        XCTAssertEqual(l.certeza, .detectados)
        XCTAssertEqual(l.fuerte?.n, 8)
        XCTAssertEqual(l.fuerte!.ritmoSkm, 238, accuracy: 0.5)
        XCTAssertGreaterThan(l.suave!.ritmoSkm, 300)
        XCTAssertGreaterThan(l.contrasteSkm!, 60)
        // La media cae ENTRE los dos y no describe ni uno: es la enfermedad entera.
        XCTAssertGreaterThan(l.mediaSkm!, l.fuerte!.ritmoSkm)
        XCTAssertLessThan(l.mediaSkm!, l.suave!.ritmoSkm)
        XCTAssertTrue(l.mediaEsMezcla)
    }

    func testLosTramosSeNumeranDentroDeSuTipoYVanEnOrden() {
        let tramos = FormaDeCarrera.lectura(de: fartlek()).tramos.filter { $0.tipo == .fuerte }
        XCTAssertEqual(tramos.map(\.orden), Array(1...8))
        XCTAssertTrue(tramos.enumerated().allSatisfy { i, t in i == 0 || t.desdeS > tramos[i - 1].desdeS })
    }

    func testUnRodajeContinuoNoSeTroceaLaMediaEsHonestaYSeQuedaDeSujeto() {
        // La otra mitad de la ley. Un detector que parta esto en fuertes y suaves le
        // quitaría a la media el único caso en que dice la verdad.
        let l = FormaDeCarrera.lectura(de: conMuestras([(dur: 2400, skm: 300)], cadaS: 5))
        XCTAssertEqual(l.forma, .uniforme)
        XCTAssertFalse(l.mediaEsMezcla)
        XCTAssertNil(l.fuerte)
        XCTAssertNil(l.suave)
    }

    func testLosTrozosDeUnRodajeContinuoNoSonUnaLecturaYNoSePintan() {
        // El disparador trocea igualmente —lo necesita para concluir que NO hay
        // frontera— pero esos trozos no son repeticiones. Si la pantalla los
        // dibujara, enseñaría una estructura que el atleta no corrió.
        let l = FormaDeCarrera.lectura(de: conMuestras([(dur: 2400, skm: 300)], cadaS: 5))
        XCTAssertFalse(l.tramosSonLectura)
        XCTAssertNil(l.aguante)

        // En cambio un fartlek y unas vueltas marcadas SÍ son una lectura.
        XCTAssertTrue(FormaDeCarrera.lectura(de: fartlek()).tramosSonLectura)
        XCTAssertTrue(FormaDeCarrera.lectura(de: comoVueltas(hyrox44)).tramosSonLectura)
    }

    func testLaOndulacionDelTerrenoNoEsUnaFrontera() {
        // ±12 s/km de subidas y bajadas: variación real, pero por debajo del umbral
        // de contraste. Sigue siendo una sola cosa.
        let plan: [(dur: Double, skm: Double?)] = (0..<12).map { i in
            (dur: 200, skm: i % 2 == 1 ? 306 : 294)
        }
        XCTAssertEqual(FormaDeCarrera.lectura(de: conMuestras(plan, cadaS: 5)).forma, .uniforme)
    }

    func testUnSemaforoNoEsUnTramoSuaveNiEnsuciaLosRitmos() {
        let l = FormaDeCarrera.lectura(de: fartlek())
        // Ningún tramo `parado` cuenta como suave, y un parón no aparece con ritmo.
        XCTAssertTrue(l.tramos.filter { $0.tipo == .parado }.allSatisfy { $0.ritmoSkm == nil })

        // El mismo fartlek con 45 s de parón en medio: se aísla, no se reparte.
        let base = fartlek()
        var muestras = base.muestras
        let mitad = muestras.count / 2
        for i in mitad..<(mitad + 9) {
            muestras[i] = FormaDeCarrera.Muestra(t: muestras[i].t, ritmoSkm: nil)
        }
        let p = FormaDeCarrera.lectura(de: .init(distanciaM: base.distanciaM,
                                                 duracionS: base.duracionS,
                                                 muestras: muestras))
        XCTAssertTrue(p.tramos.contains { $0.tipo == .parado })
        XCTAssertEqual(p.fuerte!.ritmoSkm, 238, accuracy: 0.5)
    }

    func testUnTropiezoDeDiezSegundosSeAbsorbeEnSuVecino() {
        let c = conMuestras([(dur: 600, skm: 300), (dur: 10, skm: 210), (dur: 600, skm: 300)],
                            cadaS: 5)
        // Diez segundos rápidos no parten un rodaje en tres.
        XCTAssertLessThanOrEqual(FormaDeCarrera.lectura(de: c).tramos.count, 2)
        XCTAssertEqual(FormaDeCarrera.lectura(de: c).forma, .uniforme)
    }

    func testConSeparacionJustaElTramoSeDeclaraEstimadoNoDetectado() {
        // 26 s/km de contraste: pasa el umbral, pero no es la separación limpia de
        // un fartlek de verdad. La pantalla tiene que poder decir cuál es cuál.
        let l = FormaDeCarrera.lectura(de: fartlek(fuerteSkm: 280, suaveSkm: 306))
        if l.forma == .conContraste { XCTAssertEqual(l.certeza, .estimados) }
    }
}
