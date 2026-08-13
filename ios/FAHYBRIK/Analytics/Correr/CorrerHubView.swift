import SwiftUI

// EL HOGAR DEL RUNNING — nivel 0 (mapa v2, 13-ago).
//
// La pastilla Carrera deja de ser una tira: es un resumen CORTO donde cada
// bloque es una PUERTA a su propia vista. Se entra, se mira, se acciona. El
// acabado hereda la tira que sustituye (cero cajas, cero rayas, aire 24/48,
// cifras tabulares) — es la misma pantalla en otra composición.
//
// EL ESTADO VA ETIQUETADO, NO EN FRASE GIGANTE (Alex, 13-ago: «¿qué es esto?»).
// El concepto es nuestro Training Status; la presentación es la del mercado:
// etiqueta, valor compacto y LA EVIDENCIA debajo en una línea — el atleta lee
// qué es sin adivinarlo. Mismo motor servido; aquí no se calcula nada.
//
// AQUÍ NO HAY NINGÚN BOTÓN DE TESTS. La salida por falta de ancla vive en
// Capacidad, que es donde el hueco existe, y aterriza en SU test.

/// A dónde puede entrar el hub. Es el vocabulario del NavigationStack de la
/// pestaña: cada puerta empuja uno de estos y `AnalyticsView` resuelve la vista.
enum CorrerDestino: Hashable {
    case historial
    case tendencias
    case capacidad
    case porTipo
    case forma
    case adherencia
    case cansado
}

struct CorrerHubView: View {
    let progreso: RunningProgressPayload
    let bearer: String?
    /// La puerta «Mi carrera» cambia de pestaña (Carreras). No duplica nada:
    /// enlazar, no copiar, es la regla del mapa.
    var onAbrirCarreras: (() -> Void)?

    /// El mes del hub y las tres últimas salidas. Falla en silencio: las
    /// puertas que dependen de él se callan y el resto de la pantalla vive.
    @State private var historial: HistorialDeCorrer?
    /// El umbral para el titular de Capacidad. Mismo trato.
    @State private var capacidad: CapacidadDeCorrer?

    private static let dentro: CGFloat = 24
    private static let entre: CGFloat = 48

    private var h: RunningHistory { progreso.history }

    private func modo(_ l: ProgresoDeCarrera.Lectura) -> ProgresoDeCarrera.Modo {
        ProgresoDeCarrera.modo(progreso.coverage, l)
    }

    private var veredicto: Veredicto { ProgresoDeCarrera.veredictoEfectivo(progreso) }

    var body: some View {
        VStack(alignment: .leading, spacing: Self.entre) {
            estado

            VStack(alignment: .leading, spacing: Self.dentro) {
                esteMes
                tusCarreras
            }

            VStack(alignment: .leading, spacing: Self.dentro) {
                forma
                puertaCapacidad
                porTipo
            }

            VStack(alignment: .leading, spacing: Self.dentro) {
                loQueTePiden
                correrCansado
                miCarrera
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: bearer ?? "") {
            guard let bearer else { return }
            historial = try? await CorrerService.fetchHistorial(ventana: .mes, bearer: bearer)
            capacidad = try? await CorrerService.fetchCapacidad(bearer: bearer)
        }
    }

    // MARK: - El estado — etiquetado, compacto y con su evidencia

    private var estado: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Estado")
                .font(Theme.Typography.readoutLabel)
                .uppercaseTracked(1.98)
                .foregroundStyle(Theme.Color.muted)
            Text(veredicto.frase)
                .scaledFont(30, weight: .heavy, relativeTo: .title, italic: true)
                .tracking(-0.9)
                .foregroundStyle(AnaliticasCorrerView.tono(veredicto.clase))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            // LA EVIDENCIA, EN UNA LÍNEA: en qué se apoya la afirmación. Sin
            // ella el estado es una opinión; con ella es un dato comprobable.
            if let peldano = veredicto.peldano {
                Text(ProgresoDeCarrera.textoDeMarca(peldano))
                    .scaledFont(11, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
            }
            if let plazo = veredicto.plazo {
                PlazoDeSemanas(llevas: plazo.llevas, hacen: plazo.hacen)
                    .frame(maxWidth: 180)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Theme.Spacing.m)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Este mes → Tendencias

    @ViewBuilder
    private var esteMes: some View {
        // EL CONTADOR SE PINTA EN CERO (§6.2 bis): el mes sin salidas es
        // información — y es cuando más falta hace. Solo se calla mientras
        // el historial aún no ha contestado.
        if let agg = historial?.aggregates {
            PuertaDeCorrer(etiqueta: "Este mes", value: CorrerDestino.tendencias) {
                CifraDeBloque(valor: Formato.esDecimal(agg.km, decimals: agg.km >= 100 ? 0 : 1),
                              unidad: "km", tam: 44)
                HStack(spacing: Theme.Spacing.xl) {
                    DatoDePuerta(valor: "\(agg.salidas)",
                                 unidad: agg.salidas == 1 ? "salida" : "salidas")
                    DatoDePuerta(valor: Formato.clock(agg.seconds), unidad: "tiempo")
                    if let desnivel = agg.elevationM, desnivel > 0 {
                        DatoDePuerta(valor: "\(Int(desnivel.rounded())) m", unidad: "desnivel")
                    }
                }
            }
        }
    }

    // MARK: - Tus carreras → Historial

    @ViewBuilder
    private var tusCarreras: some View {
        let filas = Array((historial?.weeks ?? []).flatMap(\.rows).prefix(3))
        if !filas.isEmpty {
            PuertaDeCorrer(etiqueta: "Tus carreras", value: CorrerDestino.historial) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    ForEach(filas) { fila in
                        FilaCompactaDeCarrera(fila: fila)
                    }
                }
            }
        }
    }

    // MARK: - Forma → su vista

    @ViewBuilder
    private var forma: some View {
        if modo(.forma) != .nada {
            PuertaDeCorrer(etiqueta: "Forma", value: CorrerDestino.forma) {
                if modo(.forma) == .da {
                    if let vo2 = h.vo2 {
                        CifraDeBloque(valor: Formato.esDecimal(vo2.valor, decimals: 0),
                                      unidad: "VO₂máx", tam: 36) {
                            if let delta = vo2.delta, delta != 0 {
                                DeltaDeBloque(mejor: delta > 0,
                                              valor: Formato.esDecimal(abs(delta), decimals: 0),
                                              ventana: "\(vo2.ventanaSemanas) sem")
                            }
                        }
                    } else if let ultimo = h.alPulso.last {
                        CifraDeBloque(valor: Formato.ritmo(ultimo.valor, .porKm),
                                      unidad: "mismo pulso", tam: 36) {
                            if let d = progreso.deltas.forma {
                                DeltaDeBloque(mejor: d.ganaSKm > 0,
                                              valor: "\(Int(abs(d.ganaSKm).rounded())) s",
                                              ventana: "\(d.semanas) sem")
                            }
                        }
                    }
                } else {
                    LecturaApagada(alto: 44)
                }
            }
        }
    }

    // MARK: - Capacidad → su vista

    @ViewBuilder
    private var puertaCapacidad: some View {
        // El titular es el umbral; sin él, la velocidad crítica; sin ninguna,
        // la puerta igualmente ENTRA — dentro está la salida real (el test).
        PuertaDeCorrer(etiqueta: "Capacidad", value: CorrerDestino.capacidad) {
            if let umbral = capacidad?.umbral {
                CifraDeBloque(valor: Formato.ritmo(umbral.ritmoSKm, .porKm),
                              unidad: "umbral", tam: 36)
            } else if capacidad != nil {
                Text("Sin umbral todavía")
                    .scaledFont(12, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            } else {
                LecturaApagada(alto: 44)
            }
        }
    }

    // MARK: - Por tipo → su vista

    @ViewBuilder
    private var porTipo: some View {
        let tipos = historial?.tipos ?? []
        if !tipos.isEmpty {
            PuertaDeCorrer(etiqueta: "Por tipo", value: CorrerDestino.porTipo) {
                // Chips de dato, no controles: el control vive dentro.
                HStack(spacing: Theme.Spacing.s) {
                    ForEach(tipos.prefix(3)) { tipo in
                        Text("\(tipo.labelEs) \(tipo.count)")
                            .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Theme.Color.surfaceElevated)
                            .clipShape(Capsule())
                    }
                    if tipos.count > 3 {
                        Text("+\(tipos.count - 3)")
                            .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            }
        }
    }

    // MARK: - Lo que te piden → Adherencia

    @ViewBuilder
    private var loQueTePiden: some View {
        if modo(.pedido) == .da, let p = h.pedido, let pct = p.pctEnBanda {
            PuertaDeCorrer(etiqueta: "Lo que te piden", value: CorrerDestino.adherencia) {
                CifraDeBloque(valor: "\(Int(pct.rounded()))", unidad: "% en banda", tam: 36,
                              tono: p.juzgable
                                ? (pct >= progreso.method.goodInBandPct
                                   ? Theme.Color.ok : Theme.Color.warning)
                                : Theme.Color.foreground)
            }
        }
    }

    // MARK: - Correr cansado → su vista

    @ViewBuilder
    private var correrCansado: some View {
        if modo(.cansado) == .da, let ultimo = h.cansado.last {
            PuertaDeCorrer(etiqueta: "Correr cansado", value: CorrerDestino.cansado) {
                CifraDeBloque(valor: Formato.esDecimal(ultimo.costeSKm),
                              unidad: "s/km de más", tam: 36,
                              tono: (progreso.deltas.cansado?.mejoraSKm ?? 0) > 0
                                ? Theme.Color.ok : Theme.Color.warning)
            }
        } else if modo(.cansado) == .apagada {
            PuertaDeCorrer(etiqueta: "Correr cansado", value: CorrerDestino.cansado) {
                LecturaApagada(alto: 44)
            }
        }
    }

    // MARK: - Mi carrera → la pestaña Carreras (enlazar, no duplicar)

    @ViewBuilder
    private var miCarrera: some View {
        if let c = h.carrera {
            Button {
                Haptics.light()
                onAbrirCarreras?()
            } label: {
                FilaDePuerta(etiqueta: c.nombre) {
                    HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xl) {
                        CifraDeBloque(valor: "\(c.dias)", unidad: "días", tam: 36)
                        if let previsto = c.predichoS {
                            CifraDeBloque(valor: Formato.clock(previsto), unidad: "previsto",
                                          tam: 24, tono: AnaliticasCorrerView.tono(veredicto.clase))
                        }
                    }
                }
            }
            .buttonStyle(PressScaleStyle())
        }
    }
}

// MARK: - La puerta — el bloque atómico del hub

/// SIEMPRE la misma forma: etiqueta versalita, su contenido, y un chevron
/// discreto centrado a la derecha de TODO el bloque. Es el tratamiento único
/// que dice «esto se entra», igual en todas las puertas aunque el contenido
/// cambie. Sin caja: la puerta se delimita por aire, como todo en la pantalla.
struct PuertaDeCorrer<Contenido: View>: View {
    let etiqueta: String
    let value: CorrerDestino
    @ViewBuilder var contenido: Contenido

    var body: some View {
        NavigationLink(value: value) {
            FilaDePuerta(etiqueta: etiqueta) { contenido }
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// El cuerpo compartido de una puerta (lo usa también la que cambia de
/// pestaña, que no es un NavigationLink).
struct FilaDePuerta<Contenido: View>: View {
    let etiqueta: String
    @ViewBuilder var contenido: Contenido

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text(etiqueta)
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.98)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                contenido
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.faint)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// Un dato menor de una puerta: cifra pequeña + unidad, en línea con sus
/// hermanos. Es la fila de salidas/tiempo/desnivel de «Este mes».
struct DatoDePuerta: View {
    let valor: String
    let unidad: String

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 4) {
            Text(valor)
                .font(.system(size: 15, weight: .bold).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            Text(unidad)
                .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
        }
    }
}

/// Una salida del historial, compacta: día, tipo/dosis, km, ritmo y FC. La voz
/// de la fila la fija el mock del doble; el formato, `Formato` (§2).
struct FilaCompactaDeCarrera: View {
    let fila: CarreraDelHistorial

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(FechaES.corta(fila.fecha) ?? fila.fecha)
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 46, alignment: .leading)
            Text(titulo)
                .scaledFont(11, weight: .bold, relativeTo: .caption2)
                .tracking(0.88)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            Spacer(minLength: Theme.Spacing.s)
            if let distancia = Formato.distanciaCubierta(fila.km * 1000) {
                Text(distancia)
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            if let ritmo = fila.ritmoSKm {
                Text(Formato.ritmo(ritmo, .porKm))
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var titulo: String {
        if let dosis = fila.dosisLabel, !dosis.isEmpty { return dosis }
        if let slug = fila.tipoSlug,
           let nombre = PrescriptionScheme(canonicalizing: slug)?.nombreEs { return nombre }
        return fila.origen == "imported" ? "Del reloj" : "Carrera"
    }
}
