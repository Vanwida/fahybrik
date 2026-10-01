import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL KIT DE «EL DÍA» — lo que tiene lógica, afirmado.
//
// Lo visual se REVISA (`GaleriaDiaRenderTests` deja los PNG); esto es lo que se puede AFIRMAR sin
// mirar: que el acento del club llega a cada papel, que ningún color de estado lo hereda, que el
// texto pasa AA sobre el fondo real que le toca con cualquier acento, que el suelo tipográfico
// aguanta y que ningún fichero del kit vuelve a clavar un naranja.
//
// El acento vive en un almacén global (`ClubThemeStore`, persistido en UserDefaults): cada prueba
// que lo toca lo deja limpio al terminar, o la siguiente heredaría el club de la anterior.

private extension UIFont.TextStyle {
    /// El estilo de SwiftUI en el de UIKit, para pedirle al sistema cuánto escala.
    init(_ estilo: Font.TextStyle) {
        switch estilo {
        case .largeTitle: self = .largeTitle
        case .title:      self = .title1
        case .title2:     self = .title2
        case .title3:     self = .title3
        case .headline:   self = .headline
        case .subheadline: self = .subheadline
        case .body:       self = .body
        case .callout:    self = .callout
        case .footnote:   self = .footnote
        case .caption:    self = .caption1
        case .caption2:   self = .caption2
        @unknown default: self = .body
        }
    }
}

final class DiaKitTests: XCTestCase {

    private static let apariencias: [UIUserInterfaceStyle] = [.light, .dark]
    /// El acento de fábrica (`nil`) y cuatro clubs con tintas y luminosidades opuestas.
    private static let clubes: [(nombre: String, club: ClubTheme?)] = {
        var lista: [(nombre: String, club: ClubTheme?)] = [("fábrica", nil)]
        for club in ClubTheme.acentosDePrueba { lista.append((club.accent?.fill ?? "?", club)) }
        return lista
    }()

    override func setUp() {
        super.setUp()
        ClubThemeStore.clear()
    }

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private func rgba(_ c: SwiftUI.Color, _ e: UIUserInterfaceStyle) -> [Double] {
        let v = Contraste.rgba(c, en: e)
        return [v.r, v.g, v.b, v.a].map { ($0 * 1000).rounded() / 1000 }
    }

    // MARK: - El contraste (la herramienta)

    func testContrasteMideComoWCAG() {
        let blanco = SwiftUI.Color.white, negro = SwiftUI.Color.black
        XCTAssertEqual(Contraste.razon(texto: negro, fondo: blanco, en: .light), 21, accuracy: 0.01)
        XCTAssertEqual(Contraste.razon(texto: blanco, fondo: blanco, en: .light), 1, accuracy: 0.001)
        // Un texto translúcido se mide compuesto sobre su fondo: negro al 50 % sobre blanco = gris medio.
        XCTAssertEqual(Contraste.razon(texto: negro.opacity(0.5), fondo: blanco, en: .light), 4.0, accuracy: 0.6)
    }

    // MARK: - La escala tipográfica

    func testLaEscalaEsLaDelContrato() {
        typealias P = Theme.Typography.Papel
        XCTAssertEqual(P.etiqueta.medidas.tamano, 15)
        XCTAssertEqual(P.cuerpo.medidas.tamano, 17)
        XCTAssertEqual(P.seccion.medidas.tamano, 24)
        XCTAssertEqual(P.dato.medidas.tamano, 32)
        XCTAssertEqual(P.sujeto.medidas.tamano, 44)
        XCTAssertEqual(P.cuenta.medidas.tamano, 80)
    }

    func testNingunPapelBajaDelSueloDeQuinceYElSueloEsUnoSolo() {
        XCTAssertEqual(Theme.Typography.suelo, 15)
        for papel in Theme.Typography.Papel.allCases {
            XCTAssertGreaterThanOrEqual(papel.medidas.tamano, Theme.Typography.suelo, "\(papel) baja del suelo de 15 pt")
        }
        // El vivo tira de la misma cifra: no hay un segundo suelo que pueda derivar.
        XCTAssertEqual(VivoTokens.TI.suelo, Theme.Typography.suelo)
        XCTAssertEqual(VivoTokens.TI.cuerpo, Theme.Typography.Papel.cuerpo.medidas.tamano)
    }

    func testConElTextoDelSistemaMuyPequenoNingunPapelBajaDeSuSueloYConUnoGrandeCrece() {
        for papel in Theme.Typography.Papel.allCases {
            let m = papel.medidas
            let metricas = UIFontMetrics(forTextStyle: UIFont.TextStyle(m.estilo))
            let pequeno = metricas.scaledValue(for: m.tamano, compatibleWith: UITraitCollection(preferredContentSizeCategory: .extraSmall))
            let accesible = metricas.scaledValue(for: m.tamano, compatibleWith: UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge))
            XCTAssertLessThan(pequeno, m.tamano, "el sistema SÍ baja \(papel) con el texto en «Muy pequeño»: sin suelo se leería por debajo")
            XCTAssertEqual(papel.tamanoEfectivo(escalado: pequeno), m.tamano, "\(papel) tiene que aguantar su medida base")
            XCTAssertGreaterThan(accesible, m.tamano)
            if let tope = m.tope {
                XCTAssertEqual(papel.tamanoEfectivo(escalado: accesible), m.tamano * tope, accuracy: 0.001,
                               "\(papel) es grande: crece con el texto del sistema, pero hasta su tope")
            } else {
                XCTAssertEqual(papel.tamanoEfectivo(escalado: accesible), accesible, "\(papel) tiene que crecer con el texto accesible")
            }
        }
    }

    func testSoloLosPapelesGrandesLlevanTopeYElTextoDeLecturaNo() {
        typealias P = Theme.Typography.Papel
        for p in P.allCases {
            // 22 pt: la cifra de una fila en columna (`.cifra`) también lleva tope; el texto de lectura (≤ 20 pt) no.
            let grande = p.medidas.tamano >= 22
            XCTAssertEqual(p.medidas.tope != nil, grande, "\(p): el tope es de los papeles grandes (≥ 22 pt), no del texto que se lee")
        }
    }

    func testLosPapelesGrandesSonCursivaDeMarcaYLosDeTextoNo() {
        typealias P = Theme.Typography.Papel
        for p in [P.seccion, .saludo, .dato, .sujeto, .cuentaHoy, .cuenta, .accion] {
            XCTAssertTrue(p.medidas.cursiva, "\(p) es voz de marca: cursiva pesada")
            XCTAssertEqual(p.medidas.peso, .heavy)
        }
        for p in [P.etiqueta, .rotulo, .nota, .notaFuerte, .cuerpo, .cuerpoFuerte] {
            XCTAssertFalse(p.medidas.cursiva, "\(p) es texto de lectura: recto")
        }
        // Las cifras que cambian en vivo van tabulares: que 39 no baile al pasar a 38.
        for p in [P.dato, .cuenta, .cuentaHoy, .notaPesada] { XCTAssertTrue(p.medidas.tabular, "\(p)") }
        // Sólo las etiquetas van en mayúsculas.
        XCTAssertEqual(P.allCases.filter(\.medidas.mayusculas).count, 2)
    }

    // MARK: - Los radios y medidas por papel

    func testRadiosYMedidasPorPapel() {
        XCTAssertEqual(Theme.Radius.sujeto, 28)
        XCTAssertEqual(Theme.Radius.tarjeta, 22)
        XCTAssertEqual(Theme.Radius.fila, 16)
        XCTAssertGreaterThan(Theme.Radius.sujeto, Theme.Radius.tarjeta)
        XCTAssertGreaterThan(Theme.Radius.tarjeta, Theme.Radius.fila)
        XCTAssertGreaterThanOrEqual(Theme.Size.toque, 44, "área táctil mínima de la HIG")
        XCTAssertGreaterThanOrEqual(Theme.Size.accion, 44)
        XCTAssertEqual(Theme.Spacing.pantalla, VivoTokens.margen)
    }

    // MARK: - El tinte del acento del club

    func testSinClubElTinteEsElDeFabrica() {
        XCTAssertNil(ClubThemeStore.current)
        XCTAssertEqual(Theme.Color.accentSoftAlpha, 0.14, accuracy: 1e-9)
        for e in Self.apariencias {
            let fill = Contraste.rgba(Theme.Color.accent, en: e)
            let tinte = Contraste.rgba(Theme.Color.accentTint, en: e)
            XCTAssertEqual(tinte.r, fill.r, accuracy: 0.002, "el tinte es el hex del relleno…")
            XCTAssertEqual(tinte.g, fill.g, accuracy: 0.002)
            XCTAssertEqual(tinte.a, 0.14, accuracy: 0.002, "…con el alfa de fábrica")
        }
    }

    func testConClubElTinteEsSuRellenoConSuAlfa() throws {
        ClubThemeStore.update(ClubTheme(name: nil, logoUrl: nil, accent: ClubAccentPayload(
            fill: "#2c5f9e", onFill: "#f5f5f5", press: "#255186", text: "#5982b3", softAlpha: 0.10)))
        XCTAssertEqual(Theme.Color.accentSoftAlpha, 0.10, accuracy: 1e-9)
        let tinte = Contraste.rgba(Theme.Color.accentTint, en: .dark)
        XCTAssertEqual(tinte.r, Double(0x2c) / 255, accuracy: 0.002)
        XCTAssertEqual(tinte.g, Double(0x5f) / 255, accuracy: 0.002)
        XCTAssertEqual(tinte.b, Double(0x9e) / 255, accuracy: 0.002)
        XCTAssertEqual(tinte.a, 0.10, accuracy: 0.002)
        // El borde crece con el tinte (×3): si el servidor lo sube, sube con él.
        XCTAssertEqual(Contraste.rgba(Theme.Color.accentTintBorde, en: .dark).a, 0.30, accuracy: 0.002)
    }

    func testUnAlfaRotoNoEstropeaLaInterfaz() {
        func alfa(_ v: Double) -> Double {
            ClubAccentPayload(fill: "#2c5f9e", onFill: "#f5f5f5", press: "#255186", text: "#5982b3", softAlpha: v).softAlphaSeguro
        }
        XCTAssertEqual(alfa(0), ClubAccentPayload.rangoSuave.lowerBound, "0 no es un tinte: es invisible")
        XCTAssertEqual(alfa(1), ClubAccentPayload.rangoSuave.upperBound, "1 es un relleno, no un tinte")
        XCTAssertEqual(alfa(.nan), Theme.Color.alfaSuaveDeFabrica)
        XCTAssertEqual(alfa(0.12), 0.12, "lo que el servidor manda de verdad pasa tal cual")
    }

    func testTinteMezclaComoElColorMixDelDoble() {
        // 50 % de blanco sobre negro = gris medio; y el resultado es OPACO (no deja ver lo de debajo).
        let medio = Theme.Color.tinte(.white, 0.5, sobre: .black)
        for e in Self.apariencias {
            let v = Contraste.rgba(medio, en: e)
            XCTAssertEqual(v.r, 0.5, accuracy: 0.01)
            XCTAssertEqual(v.a, 1, accuracy: 0.001)
        }
        // Cada apariencia mezcla contra SU superficie: el mismo tinte no es el mismo color en claro y en oscuro.
        let sobreElevada = Theme.Color.tinte(Theme.Color.info, 0.16, sobre: Theme.Color.surfaceElevated)
        XCTAssertNotEqual(rgba(sobreElevada, .light), rgba(sobreElevada, .dark))
    }

    // MARK: - El tono: qué papeles hereda del club y cuáles no

    func testElTonoAccionEsElAcentoDelClubEnAmbasApariencias() {
        for (nombre, club) in Self.clubes {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                let p = TonoDia.accion.papeles
                XCTAssertEqual(rgba(p.fondo, e), rgba(Theme.Color.accent, e), "fondo de acción ≠ acento (\(nombre), \(e.rawValue))")
                XCTAssertEqual(rgba(p.tinta, e), rgba(Theme.Color.accentOn, e), "tinta de acción ≠ accentOn (\(nombre))")
            }
        }
        // Y con un club, NO es el naranja de fábrica.
        ClubThemeStore.update(.pruebaAzul)
        let azul = rgba(TonoDia.accion.papeles.fondo, .dark)
        ClubThemeStore.clear()
        XCTAssertNotEqual(azul, rgba(TonoDia.accion.papeles.fondo, .dark))
    }

    func testLosTonosDeEstadoNoLosTocaElTenant() {
        let semanticos: [TonoDia] = [.info, .ok, .soporte, .aviso, .peligro]
        for e in Self.apariencias {
            ClubThemeStore.clear()
            let base = semanticos.map { t -> [[Double]] in
                let p = t.papeles
                return [rgba(p.fondo, e), rgba(p.borde, e), rgba(p.tinta, e), rgba(p.deco.color, e)]
            }
            ClubThemeStore.update(.pruebaAmarillo)
            let conClub = semanticos.map { t -> [[Double]] in
                let p = t.papeles
                return [rgba(p.fondo, e), rgba(p.borde, e), rgba(p.tinta, e), rgba(p.deco.color, e)]
            }
            XCTAssertEqual(base, conClub, "un tono de estado cambió con el club (\(e.rawValue))")
        }
    }

    func testElTonoAcentoSiguePorSuTinteYElNeutroNo() {
        for e in Self.apariencias {
            ClubThemeStore.clear()
            let neutroAntes = rgba(TonoDia.neutro.papeles.fondo, e)
            let acentoAntes = rgba(TonoDia.acento.papeles.fondo, e)
            ClubThemeStore.update(.pruebaAzul)
            XCTAssertEqual(neutroAntes, rgba(TonoDia.neutro.papeles.fondo, e))
            XCTAssertNotEqual(acentoAntes, rgba(TonoDia.acento.papeles.fondo, e), "el tono acento tiene que teñirse del club")
        }
    }

    func testLasTirasDelAcentoAclaranODesaclaranSegunLaTintaQueLlevanEncima() {
        // Naranja de fábrica: tinta marrón (oscura) → las tiras ACLARAN, que sube el contraste del texto.
        XCTAssertEqual(TonoDia.accion.papeles.deco.mezcla, .plusLighter)
        // Un azul con tinta CLARA: aclarar le bajaría el contraste → las tiras OSCURECEN.
        ClubThemeStore.update(.pruebaAzul)
        XCTAssertEqual(TonoDia.accion.papeles.deco.mezcla, .normal)
        XCTAssertEqual(Array(rgba(TonoDia.accion.papeles.deco.color, .dark).prefix(3)), [0, 0, 0])
        // Un amarillo con tinta OSCURA: vuelve a aclarar.
        ClubThemeStore.update(.pruebaAmarillo)
        XCTAssertEqual(TonoDia.accion.papeles.deco.mezcla, .plusLighter)
    }

    // MARK: - El texto pasa AA sobre el fondo real que le toca (§4.2), con cualquier acento

    func testLaTintaDeCadaTonoPasaAASobreSuFondoEnClaroYEnOscuroConCualquierClub() {
        for (nombre, club) in Self.clubes {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                for tono in TonoDia.allCases {
                    let p = tono.papeles
                    let razon = Contraste.razon(texto: p.tinta, fondo: p.fondo, en: e)
                    XCTAssertGreaterThanOrEqual(razon, Contraste.aaTexto,
                        "tono \(tono) con club \(nombre) en \(e.rawValue): \(String(format: "%.2f", razon)):1")
                }
            }
        }
    }

    func testLaTintaDelTemaPasaAASobreLosTintesDelAcento() {
        // Sobre un tinte del acento el texto es la tinta del tema. `muted` NO está aquí a propósito: sobre el
        // tinte de un acento claro (amarillo, verde) en oscuro mide 4,1-4,4:1, y por eso las piezas del kit
        // (`TeselaDia.realce`, `InfoPill.acento`) cambian el gris por la tinta cuando van sobre un tinte.
        for (nombre, club) in Self.clubes {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                for superficie in [Theme.Color.surface, Theme.Color.surfaceElevated] {
                    let fondo = Theme.Color.accentTint(sobre: superficie)
                    XCTAssertGreaterThanOrEqual(
                        Contraste.razon(texto: Theme.Color.foreground, fondo: fondo, en: e), Contraste.aaTexto,
                        "foreground sobre el tinte de \(nombre) en \(e.rawValue)")
                }
            }
        }
    }

    func testElAcentoSobreSuTintaYLaTintaSobreElAcentoPasanAA() {
        // Las pastillas `.solido` (tinta sobre acento) y `.sobreAccion` (acento sobre tinta) son el mismo par.
        for (nombre, club) in Self.clubes {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                XCTAssertGreaterThanOrEqual(
                    Contraste.razon(texto: Theme.Color.accentOn, fondo: Theme.Color.accent, en: e), Contraste.aaTexto,
                    "accentOn sobre accent con \(nombre)")
            }
        }
    }

    func testElAcentoComoTextoPasaAAEnOscuroConCualquierClub() {
        // El servidor deriva `text` para el lienzo OSCURO (club-accent.ts), que es donde vive: en el póster
        // (siempre oscuro) y en el tema oscuro.
        for (nombre, club) in Self.clubes {
            ClubThemeStore.update(club)
            // Sobre el lienzo y la tarjeta, que es donde el kit pone el acento como texto. La tarjeta ELEVADA
            // (#1C1C1F) queda fuera: el servidor deriva `text` contra #161618 como la superficie más clara y la
            // app llega a #1C1C1F, donde un azul medio mide 4,3:1. Está en el informe del kit.
            for fondo in [Theme.Color.background, Theme.Color.surface] {
                XCTAssertGreaterThanOrEqual(
                    Contraste.razon(texto: Theme.Color.accentText, fondo: fondo, en: .dark), Contraste.aaTexto,
                    "accentText de \(nombre) sobre el lienzo oscuro")
            }
        }
    }

    /// HALLAZGO, fijado para que no se pierda: el payload del club trae UN solo `text` (el del lienzo
    /// oscuro) y `Theme.Color.accentText` lo usa también en claro, donde un acento claro ya no se lee
    /// (un amarillo sobre blanco mide ~1,6:1). El naranja de fábrica no lo sufre porque su `accentText`
    /// claro (#B5430B) sí es propio. Se arregla en el servidor (mandar el rol claro), no aquí: cuando
    /// llegue, esta prueba salta y hay que borrarla junto con la nota del contrato.
    func testHallazgoElAccentTextDeUnClubClaroNoSeLeeSobreLienzoClaro() {
        ClubThemeStore.update(.pruebaAmarillo)
        let sobreBlanco = Contraste.razon(texto: Theme.Color.accentText, fondo: Theme.Color.background, en: .light)
        XCTAssertLessThan(sobreBlanco, Contraste.aaGrande, "si esto pasa a AA, el servidor ya manda el rol claro")
        ClubThemeStore.clear()
        XCTAssertGreaterThanOrEqual(
            Contraste.razon(texto: Theme.Color.accentText, fondo: Theme.Color.background, en: .light), Contraste.aaTexto,
            "el de fábrica sí pasa")
    }

    // MARK: - El póster: el velo protege el PEOR caso de foto

    /// Una foto con un píxel BLANCO (los focos y muros de luz de las del catálogo) tras el filtro de la
    /// propia foto, compuesta con el velo en cada parada. Es el peor píxel posible: si el texto se lee ahí,
    /// se lee en cualquier foto.
    func testElVeloDelPosterProtegeElPeorPixelDeLaFoto() {
        for densidad in [PosterDia<EmptyView>.Densidad.portada, .pantalla] {
            let brillo = min(1, densidad.brillo)
            let foto = min(1, (brillo - 0.5) * 1.06 + 0.5)   // contraste 1,06 alrededor del gris medio
            let fondo = Contraste.rgba(Theme.Color.background, en: .dark)
            for parada in densidad.velo {
                let a = Contraste.rgba(parada.color, en: .dark).a
                let compuesto = SwiftUI.Color(.sRGB,
                    red: fondo.r * a + foto * (1 - a), green: fondo.g * a + foto * (1 - a),
                    blue: fondo.b * a + foto * (1 - a), opacity: 1)
                let tinta = Contraste.razon(texto: Theme.Color.foreground, fondo: compuesto, en: .dark)
                let cerrado = a >= 0.8
                if cerrado {
                    // Donde el velo ya cerró van la cuenta atrás en acento (texto GRANDE, 3:1) y la fase y la
                    // simulación en la tinta del tema (15-17 pt: AA normal).
                    XCTAssertGreaterThanOrEqual(tinta, Contraste.aaTexto, "\(densidad) @\(parada.location): tinta \(tinta)")
                    for (nombre, club) in Self.clubes {
                        ClubThemeStore.update(club)
                        let cuenta = Contraste.razon(texto: Theme.Color.accentText, fondo: compuesto, en: .dark)
                        XCTAssertGreaterThanOrEqual(cuenta, Contraste.aaGrande, "cuenta de \(nombre) @\(parada.location): \(cuenta)")
                    }
                    ClubThemeStore.clear()
                } else {
                    // Arriba, donde la foto se ve: el kicker y el nombre, grandes y en la tinta del tema.
                    XCTAssertGreaterThanOrEqual(tinta, Contraste.aaGrande, "\(densidad) @\(parada.location): tinta \(tinta)")
                }
            }
        }
    }

    // MARK: - Lógica pequeña de las piezas

    func testLaCuentaAtrasDiceHoyElDiaDeLaCarreraYSingularizaElUno() {
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: 42), "42")
        XCTAssertEqual(CuentaAtrasDia.unidad(dias: 42), "días")
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: 1), "1")
        XCTAssertEqual(CuentaAtrasDia.unidad(dias: 1), "día")
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: 0), "Hoy")
        XCTAssertNil(CuentaAtrasDia.unidad(dias: 0), "el día de la carrera es una palabra, no una cifra con unidad")
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: -3), "Hoy", "una carrera pasada no cuenta hacia atrás")
    }

    func testLaRegletaAcotaYPasaABarraContinua() {
        XCTAssertEqual(RegletaDia.llenos(n: 3, de: 8), 3)
        XCTAssertEqual(RegletaDia.llenos(n: 9, de: 4), 4, "N mayor que M se acota")
        XCTAssertEqual(RegletaDia.llenos(n: -1, de: 4), 0)
        XCTAssertEqual(RegletaDia.segmentosMaximos, 12)
    }

    func testLaInsigniaDice9MasDesdeDiez() {
        XCTAssertEqual(InsigniaDia.texto(1), "1")
        XCTAssertEqual(InsigniaDia.texto(9), "9")
        XCTAssertEqual(InsigniaDia.texto(10), "9+")
        XCTAssertEqual(InsigniaDia.texto(250), "9+")
    }

    func testTodoGlifoEsUnSFSymbolQueExiste() {
        for glifo in GlifoDia.allCases {
            XCTAssertNotNil(UIImage(systemName: glifo.simbolo), "\(glifo) → «\(glifo.simbolo)» no existe")
        }
        for estado in SelloEstadoDia.Estado.allCases {
            XCTAssertNotNil(UIImage(systemName: estado.simbolo), "sello \(estado) → «\(estado.simbolo)» no existe")
        }
        XCTAssertEqual(Set(GlifoDia.allCases.map(\.simbolo)).count, GlifoDia.allCases.count, "dos ideas con el mismo símbolo")
    }

    // MARK: - Nada de naranja clavado, nada por debajo del suelo (lo que el diseño prohíbe, vigilado)

    func testLosFicherosDelKitNoClavanColoresNiTextoPorDebajoDe15() throws {
        // `#filePath` es la ruta de ESTE fichero al compilar: de ahí se llega a `Theme/Dia`. Si el código
        // se ejecuta donde no está el árbol de fuentes, no hay nada que vigilar.
        let raiz = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("FAHYBRIK/Theme")
        let rutas = [raiz.appendingPathComponent("Dia"), raiz.appendingPathComponent("Theme+Dia.swift"),
                     raiz.appendingPathComponent("Theme+Tipo.swift")]
        try XCTSkipUnless(FileManager.default.fileExists(atPath: rutas[0].path), "sin el árbol de fuentes")

        var ficheros: [URL] = []
        for ruta in rutas {
            var esDir: ObjCBool = false
            FileManager.default.fileExists(atPath: ruta.path, isDirectory: &esDir)
            if esDir.boolValue {
                ficheros += (try FileManager.default.contentsOfDirectory(at: ruta, includingPropertiesForKeys: nil))
                    .filter { $0.pathExtension == "swift" }
            } else {
                ficheros.append(ruta)
            }
        }
        XCTAssertGreaterThan(ficheros.count, 8)

        // El fichero de fixtures de preview es el único sitio donde se escriben los hex de un club de mentira.
        let prohibidos: [(patron: String, motivo: String)] = [
            (#"0x[0-9A-Fa-f]{6}"#, "hex literal"),
            (##"\"#[0-9A-Fa-f]{6}\""##, "hex en cadena"),
            (#"Color\(red:"#, "color por componentes"),
            (#"\.orange\b"#, "naranja del sistema"),
            (#"\.system\(size:\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
        ]
        for fichero in ficheros where fichero.lastPathComponent != "PreviewDia.swift" {
            let texto = try String(contentsOf: fichero, encoding: .utf8)
            // Sin comentarios: en ellos se cita el hex de fábrica a propósito.
            let codigo = texto.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            for (patron, motivo) in prohibidos {
                let regex = try NSRegularExpression(pattern: patron)
                let n = regex.numberOfMatches(in: codigo, range: NSRange(codigo.startIndex..., in: codigo))
                XCTAssertEqual(n, 0, "\(fichero.lastPathComponent): \(motivo) (\(patron))")
            }
        }
    }
}
