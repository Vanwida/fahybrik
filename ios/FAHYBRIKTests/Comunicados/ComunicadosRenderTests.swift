import XCTest
import SwiftUI
@testable import FAHYBRIK

// «DEL COACH», DIBUJADO — la bandeja y las piezas de los detalles.
//
// Hermana de `HubChatAnaliticasRenderTests`, y por lo mismo: no es una prueba de
// píxeles, es la prueba de que la pantalla se SOSTIENE en sus estados y el sitio
// de donde salen las capturas para mirarla sin una sesión viva.
//
// Los tres estados que importan: la semana en la que se rehace el plan (una
// pregunta que bloquea, dos tareas —una vencida—, un protocolo a medias, el foco
// y el briefing), la misma bandeja resuelta, y el atleta recién dado de alta.
//
// OJO con el arnés: `ImageRenderer` no dibuja `ScrollView`, así que se dibuja
// `ListaComunicados` —que es EXACTAMENTE lo que la pantalla mete dentro del
// scroll— y no la pantalla entera. Por eso la lista vive en su propia pieza.
final class ComunicadosRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 900)
    /// Para la lista completa, que no cabe en una pantalla y se recorta.
    private static let lienzoLargo = CGSize(width: 402, height: 1500)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    /// El «hoy» de los escenarios, fijo: una captura que cambia de aspecto según
    /// el día en que se saque no sirve para comparar nada.
    private static let hoy = FechaES.fecha("2026-08-09")!

    // MARK: - La bandeja

    @MainActor
    func testBandejaDeLaSemanaQueSeRehaceElPlan() {
        let imagen = render(
            ListaComunicados(
                bandeja: BandejaComunicados.agrupar(Fixtures.semanaFuerte),
                onAbrir: { _ in },
                onMarcarTarea: { _ in }
            ),
            nombre: "coach-bandeja-semana-fuerte",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testBandejaAlDiaDiceQueEstaEnCalma() {
        let bandeja = BandejaComunicados.agrupar(Fixtures.alDia)
        XCTAssertTrue(bandeja.enCalma)
        let imagen = render(
            ListaComunicados(bandeja: bandeja, onAbrir: { _ in }, onMarcarTarea: { _ in }),
            nombre: "coach-bandeja-al-dia",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// El caso de diseño: el atleta recién dado de alta. Ni una tarjeta, y aun
    /// así con sujeto y con salida — la frontera con el chat se dice.
    @MainActor
    func testBandejaVaciaTieneSujetoYSalida() {
        let imagen = render(
            centrado {
                RedesignEmptyState(
                    symbol: "tray",
                    title: "Aquí no hay nada todavía",
                    message: "Cuando Pablo te publique un protocolo, una tarea o el porqué de tu plan, vivirá aquí. El día a día sigue en el chat.",
                    exit: .action(title: "Abrir el chat", perform: {}),
                    note: "Lo que se publica aquí lleva estado: Pablo ve si lo has hecho, no solo si lo has abierto."
                )
            },
            nombre: "coach-bandeja-vacia"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Los detalles

    @MainActor
    func testProtocoloPasosYAvance() {
        let p = Fixtures.protocolo(marcados: ["9101", "9102"])
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    MonoText(
                        text: "\(p.pasosHechos) de \(p.pasosMarcables.count)",
                        size: 13, weight: .bold, color: Theme.Color.muted
                    )
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p, tamano: 24)
                    BarraPasosProtocolo(hechos: p.pasosHechos, total: p.pasosMarcables.count)
                    CardSurface(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(p.items.enumerated()), id: \.element.id) { i, paso in
                                if i > 0 {
                                    Hairline().padding(.leading, Theme.Spacing.l + 44 + Theme.Spacing.m)
                                }
                                FilaPasoProtocolo(
                                    paso: paso,
                                    hecho: p.markedItemIds.contains(paso.id),
                                    anchoMarca: 44,
                                    reservaCasilla: p.tienePasosMarcables,
                                    onTap: {}
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-protocolo-a-medias"
        )
        XCTAssertNotNil(imagen)
    }

    /// Un protocolo de pura lectura: sin contador arriba, sin barra y sin CTA
    /// abajo. Pedirle que confirme lo que acaba de leer no mide nada.
    @MainActor
    func testProtocoloDeLecturaNoEnsenaAvanceNiCTA() {
        let p = Fixtures.protocoloDeLectura
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.puedeMarcarseHecho)
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    InsigniaComunicado(insignia: p.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p, tamano: 24)
                    CuerpoComunicado(texto: p.body, tamano: 13.5)
                    if let cierre = p.finalNote {
                        CardSurface(leftAccent: true) {
                            VStack(alignment: .leading, spacing: 6) {
                                LabelText(text: "Nota de \(p.nombreCoach)", size: 9.5)
                                Text(cierre)
                                    .scaledFont(13, relativeTo: .footnote)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-protocolo-lectura"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testPreguntaConSusConsecuencias() {
        let p = Fixtures.pregunta()
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    InsigniaComunicado(insignia: p.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p)
                    CuerpoComunicado(texto: p.body)
                    AvisoComunicado(
                        texto: "Mientras no lo digas, Pablo deja esta parte del plan a la espera."
                    )
                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(p.items) { opcion in
                            OpcionPreguntaCard(
                                opcion: opcion, elegida: false, apagada: false, onTap: {}
                            )
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-pregunta"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testNotaPorSecciones() {
        let n = Fixtures.nota
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: n, onVolver: {}) {
                    InsigniaComunicado(insignia: n.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: n)
                    CuerpoComunicado(texto: n.body, tamano: 13.5)
                    ForEach(n.items) { seccion in
                        CardSurface {
                            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                                if let etiqueta = seccion.label {
                                    LabelText(text: etiqueta, size: 10)
                                    Hairline()
                                }
                                Text(seccion.content)
                                    .scaledFont(14, relativeTo: .callout)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Escenarios

    enum Fixtures {
        static func comunicado(
            id: String,
            kind: ComunicadoTipo,
            title: String,
            body: String? = nil,
            finalNote: String? = nil,
            ancla: ComunicadoAncla = .general,
            state: ComunicadoEstado = .publicado,
            blocks: Bool = false,
            dueDate: String? = nil,
            items: [ComunicadoItem] = [],
            marcados: [String] = [],
            answered: String? = nil,
            publicado: String = "2026-08-09T07:00:00Z"
        ) -> Comunicado {
            let seen: Date? = state == .publicado ? nil : Date(timeIntervalSince1970: 1_000)
            let done: Date? = state == .hecho ? Date(timeIntervalSince1970: 2_000) : nil
            let answeredAt: Date? = state == .respondido ? Date(timeIntervalSince1970: 3_000) : nil
            return Comunicado(
                id: id, kind: kind, title: title, body: body, finalNote: finalNote,
                anchorKind: ancla, anchorRef: nil, dueDate: dueDate, expiresAt: nil,
                blocks: blocks,
                publishedAt: ISO8601DateFormatters.parse(publicado)!,
                coachName: "Pablo Amigo", items: items, state: state,
                seenAt: seen, doneAt: done, answeredItemId: answered, answeredAt: answeredAt,
                markedItemIds: marcados,
                claimsAttention: Comunicado.reclama(kind: kind, state: state)
            )
        }

        static func pregunta(state: ComunicadoEstado = .publicado, answered: String? = nil) -> Comunicado {
            comunicado(
                id: "101", kind: .pregunta,
                title: "¿Tu wave es el jueves o el sábado?",
                body: "El taper está montado contando con el sábado 14. Si tu wave es el jueves 12, todo se adelanta dos días.",
                ancla: .plan, state: state, blocks: true,
                items: [
                    ComunicadoItem(id: "9001", position: 0, label: nil, content: "Jueves 12",
                                   consequence: "Openers el martes 10 y carbos desde el lunes 9. El resto no cambia."),
                    ComunicadoItem(id: "9002", position: 1, label: nil, content: "Sábado 14",
                                   consequence: "El plan se queda como está."),
                ],
                answered: answered,
                publicado: "2026-08-08T09:12:00Z"
            )
        }

        static func paso(
            _ id: String, _ marca: String, _ texto: String, checkable: Bool = true
        ) -> ComunicadoItem {
            ComunicadoItem(
                id: id, position: 0, label: marca, content: texto,
                consequence: nil, checkable: checkable
            )
        }

        /// Siete pasos, y dos de ellos son para LEER (la hidratación y el gel):
        /// ponerle casilla a beber agua no mide si bebió, mide si tocó un
        /// círculo. Es el caso mezclado, que es el normal.
        static let pasos: [ComunicadoItem] = [
            paso("9101", "−40'", "Movilidad de cadera y tobillo, 5'."),
            paso("9102", "−35'", "Trote progresivo 10', acabando a tu ritmo de carrera."),
            paso("9103", "−30'", "Desde aquí, sorbos cortos de agua con sales.", checkable: false),
            paso("9104", "−25'", "3 × 30\" de skipping y técnica."),
            paso("9105", "−12'", "2 aceleraciones de 60 m."),
            paso("9106", "−8'", "Openers: 5 wall balls y 5 burpees, tranquilos."),
            paso("9107", "−5'", "El gel, con agua y sin prisa.", checkable: false),
        ]

        static func protocolo(marcados: [String] = []) -> Comunicado {
            comunicado(
                id: "102", kind: .protocolo,
                title: "Calentamiento del día de carrera",
                finalNote: "Nada de potenciación pesada: la evidencia no supera el efecto del propio calentamiento.",
                ancla: .carrera,
                state: marcados.isEmpty ? .publicado : .visto,
                items: pasos, marcados: marcados
            )
        }

        /// Un protocolo SIN un solo paso: título, cuerpo y nota final. Se lee y
        /// ya está — ni avance ni «hecho».
        static let protocoloDeLectura = comunicado(
            id: "107", kind: .protocolo,
            title: "Cómo comer la víspera",
            body: "Cena pronto y sin fibra: arroz, pollo y poco más. Desayuna 3 h antes de tu salida, con lo de siempre, y no estrenes nada.",
            finalNote: "Si te levantas con el estómago cerrado, tira de líquido y no fuerces el sólido.",
            ancla: .carrera
        )

        static let nota = comunicado(
            id: "106", kind: .nota,
            title: "Tu plan, rehecho para Singles Pro",
            body: "Por qué el objetivo son 1:15 a 1:18 y cómo se reparten las 12 semanas.",
            ancla: .plan,
            items: [
                ComunicadoItem(id: "9601", position: 0, label: "Qué ha cambiado",
                               content: "Pasar a Singles Pro rompe 5 de las 6 premisas del plan: haces el 100 % de cada estación, cada trineo lleva 50 kg más, los wall balls suben 3 kg y el remo va a damper 7.",
                               consequence: nil),
                ComunicadoItem(id: "9602", position: 1, label: "Tu objetivo",
                               content: "La banda se cierra con los tests de la semana 1. Tu referencia real es el Singles Open de hace un año, 1h09, y el salto de Open a Pro cuesta entre 5 y 9 minutos.",
                               consequence: nil),
            ]
        )

        static let foco = comunicado(
            id: "105", kind: .foco,
            title: "Dormir más de 6 horas",
            body: "Sigues en menos de 6 h desde mayo. Es lo único de esta lista que puede darte más minutos que cualquier sesión.",
            ancla: .checkin, state: .visto,
            publicado: "2026-05-04T07:00:00Z"
        )

        /// La semana en la que se rehace el plan: la pregunta bloquea, una tarea
        /// venció y otra vence el domingo, el protocolo va por tres de siete.
        static let semanaFuerte: [Comunicado] = [
            pregunta(),
            comunicado(
                id: "103", kind: .tarea, title: "Empieza la beta-alanina",
                body: "Necesita 4 a 6 semanas de carga y lleva pendiente desde mayo.",
                dueDate: "2026-08-09"
            ),
            protocolo(marcados: ["9101", "9102", "9103"]),
            comunicado(
                id: "104", kind: .tarea, title: "Haz los tests de la semana 1",
                body: "Sin ellos, los bloques 1 a 3 van con ritmos estimados.",
                ancla: .test, dueDate: "2026-08-16"
            ),
            foco,
            nota,
        ]

        /// Lo mismo, resuelto. La calma es información.
        static let alDia: [Comunicado] = [
            pregunta(state: .respondido, answered: "9002"),
            comunicado(
                id: "103", kind: .tarea, title: "Empieza la beta-alanina",
                body: "Necesita 4 a 6 semanas de carga.", state: .hecho, dueDate: "2026-08-09"
            ),
            comunicado(
                id: "104", kind: .tarea, title: "Haz los tests de la semana 1",
                ancla: .test, state: .hecho, dueDate: "2026-08-16"
            ),
            comunicado(
                id: "102", kind: .protocolo, title: "Calentamiento del día de carrera",
                ancla: .carrera, state: .hecho, items: pasos, marcados: pasos.map(\.id)
            ),
            foco,
            comunicado(
                id: "106", kind: .nota, title: "Tu plan, rehecho para Singles Pro",
                body: "Por qué el objetivo son 1:15 a 1:18.", ancla: .plan, state: .visto
            ),
        ]
    }

    // MARK: - Render

    @ViewBuilder
    private func centrado(@ViewBuilder _ vista: () -> some View) -> some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            vista()
            Spacer(minLength: 0)
        }
    }

    @MainActor
    private func render(_ vista: some View, nombre: String, alto: CGFloat? = nil) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                vista
            }
            .frame(width: Self.lienzo.width, height: alto ?? Self.lienzo.height)
            .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }

        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
