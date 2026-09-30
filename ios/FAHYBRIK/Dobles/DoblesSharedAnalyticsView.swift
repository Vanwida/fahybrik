import SwiftUI

// Dobles · analíticas compartidas. Las mejores marcas individuales cara a cara + la marca conjunta de Doubles,
// las barras de «quién aporta qué» y una comparación semanal amistosa («pique sano»).
//
// Piel de «El día»: cabecera fija con su ‹, teselas del kit para las cifras, `TituloSeccionDia` para cada
// bloque y tablas de `caraDobles`. El atleta es el acento del club y la pareja el azul de `Theme.Color.partner`.
// La marca conjunta —un logro compartido, no de un atleta— lee en el verde de éxito, sin teñir el dato.
//
// HUECO DEL SERVIDOR: `DoblesService.fetchSharedAnalytics` devuelve nil mientras no haya endpoint. Sin datos se
// pinta un vacío honesto: JAMÁS se inventan las marcas de ninguno. La comparación se pinta solo cuando llegan
// los resultados de los dos.
struct DoblesSharedAnalyticsView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var analytics: DoblesSharedAnalytics? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true

    private var partnerName: String {
        analytics?.partnerName ?? partner?.firstName ?? "tu compañero"
    }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDobles(titulo: "Vosotros dos", salida: .volver, alSalir: { dismiss() })
            contenido
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task(id: bearer) { await reload() }
    }

    // MARK: - Contenido por estado

    @ViewBuilder
    private var contenido: some View {
        if loading {
            ScrollView {
                DoblesAnaliticasEsqueleto()
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDisabled(true)
        } else if let analytics {
            ScrollView {
                DoblesAnaliticasCuerpo(
                    analytics: analytics,
                    partnerName: partnerName,
                    partnerInitials: partner?.initials ?? "·"
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollBounceBehavior(.basedOnSize)
        } else {
            CenteredScreen {
                EmptyView()
            } lead: {
                EmptyView()
            } content: {
                sinAnaliticas
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    @ViewBuilder
    private var sinAnaliticas: some View {
        if partner == nil {
            DoblesNoPartnerState(
                message: "El cara a cara necesita a dos: con un compañero conectado veréis vuestras marcas, la conjunta y quién aporta qué.",
                bearer: bearer,
                onInvited: { Task { await reload() } }
            )
        } else {
            RedesignEmptyState(
                symbol: "chart.bar.xaxis",
                title: "Sin analíticas compartidas",
                message: "Cuando tú y tu compañero registréis marcas veréis aquí el cara a cara, vuestra marca conjunta y quién aporta qué.",
                exit: .explained(note: "Se llena solo con lo que entrenéis los dos.")
            )
        }
    }

    /// El vínculo de pareja + las analíticas compartidas. Se repite tras una invitación para que una pareja
    /// recién emparejada deje de ver el estado sin pareja.
    private func reload() async {
        loading = true
        if let bearer {
            partner = try? await PartnerService.fetchPartner(bearer: bearer)
        }
        analytics = await DoblesService.fetchSharedAnalytics(bearer: bearer)
        loading = false
    }
}

// MARK: - El cuerpo con datos

/// Lo que hay bajo la cabecera con las analíticas de los dos: las mejores marcas, la conjunta, el cara a cara por
/// estación, quién aporta qué y la semana. Solo dibuja.
struct DoblesAnaliticasCuerpo: View {
    let analytics: DoblesSharedAnalytics
    let partnerName: String
    let partnerInitials: String

    /// Una fila de comparación solo existe si al menos uno de los dos tiene dato. Sin ninguno no es una fila
    /// «vacía»: no es una fila (§6.2).
    static func comparables(_ rows: [DoblesH2HRow]) -> [DoblesH2HRow] {
        rows.filter { $0.selfValue != nil || $0.partnerValue != nil }
    }

    var body: some View {
        let a = analytics
        let caraACara = Self.comparables(a.headToHead)
        let semana = Self.comparables(a.weekly)
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                // Las mejores marcas, cara a cara.
                if a.bestSelf != nil || a.bestPartner != nil {
                    TeselasDia {
                        mejorMarca(nombre: "Yo", valor: a.bestSelf, color: Theme.Color.accent, iniciales: "Yo")
                        mejorMarca(nombre: partnerName, valor: a.bestPartner, color: Theme.Color.partner, iniciales: partnerInitials)
                    }
                }
                // La marca conjunta de Doubles: un logro compartido.
                if let mark = a.doublesMark {
                    TeselasDia { marcaConjunta(mark, delta: a.doublesDelta) }
                }
            }

            // Por estación: la mejor carrera de cada uno, estación a estación; el más rápido, marcado.
            if !caraACara.isEmpty {
                seccion("Cara a cara", aparte: "por estación") {
                    DoblesTablaComparada(rows: caraACara, partnerName: partnerName, ausente: "sin marca", marcaAlMasRapido: true)
                }
            }

            // Quién aporta qué: las barras de reparto.
            if !a.contributions.isEmpty {
                seccion("Quién aporta qué") {
                    VStack(spacing: Theme.Spacing.s) {
                        ForEach(a.contributions) { c in
                            DoblesAporteFila(contribucion: c, partnerName: partnerName)
                        }
                    }
                    if let summary = a.contributionSummary {
                        Text(summary)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            // La semana: la rivalidad amistosa.
            if !semana.isEmpty {
                seccion("Esta semana", aparte: "pique sano") {
                    DoblesTablaComparada(rows: semana, partnerName: partnerName, ausente: "sin dato", marcaAlMasRapido: false)
                }
            }
        }
    }

    private func seccion<Contenido: View>(
        _ titulo: String,
        aparte: String? = nil,
        @ViewBuilder _ contenido: () -> Contenido
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo) {
                if let aparte {
                    Text(aparte).papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
            contenido()
        }
    }

    // La tarjeta existe porque al menos uno de los dos tiene marca; el que no la tiene lo dice y no finge una
    // cifra (§7).
    private func mejorMarca(nombre: String, valor: String?, color: SwiftUI.Color, iniciales: String) -> some View {
        TeselaDia(
            etiqueta: "\(nombre), mejor HYROX \(valor ?? "sin marca")",
            cabecera: {
                HStack(spacing: Theme.Spacing.s) {
                    DoblesAthleteAvatar(initials: iniciales, color: color, size: 32)
                    Text(nombre)
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
            },
            contenido: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Mejor HYROX").papel(.nota).foregroundStyle(Theme.Color.muted)
                    if let valor {
                        Text(valor)
                            .papel(.dato)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    } else {
                        Text("sin marca").papel(.cuerpo).foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        )
    }

    private func marcaConjunta(_ marca: String, delta: String?) -> some View {
        TeselaDia(rotulo: "Vuestra marca Doubles", etiqueta: "Vuestra marca Doubles, \(marca)\(delta.map { ", \($0)" } ?? "")") {
            VStack(alignment: .leading, spacing: 2) {
                Text(marca)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                if let delta {
                    HStack(spacing: Theme.Spacing.xs + 2) {
                        IconoDia(.sube, tam: 14, peso: .bold)
                        Text(delta).papel(.notaFuerte)
                    }
                    .foregroundStyle(Theme.Color.ok)
                }
            }
        }
    }
}

// MARK: - La tabla comparada

/// Una tabla de comparación (cara a cara por estación, o la semana): la métrica y, en dos columnas, el valor de
/// cada uno. `marcaAlMasRapido` señala con un triángulo al que tiene el MEJOR tiempo cuando los dos tienen uno
/// comparable. Con el texto del sistema en tamaños de accesibilidad cada fila se apila (métrica, tú, pareja).
struct DoblesTablaComparada: View {
    let rows: [DoblesH2HRow]
    let partnerName: String
    /// Lo que se escribe donde NO hay medida. No es un valor: es la razón de que falte, así que va en voz de
    /// texto y nunca como una raya (§4, §7).
    let ausente: String
    let marcaAlMasRapido: Bool

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    private static var columna: CGFloat { 76 }

    /// «M:SS» / «H:MM:SS» → segundos, para señalar al más rápido. Solo un auxiliar de pintado: la fuente del
    /// valor es el servidor; aquí únicamente se compara para el triángulo.
    static func seconds(from value: String?) -> Int? {
        guard let value, !value.isEmpty else { return nil }
        let parts = value.split(separator: ":").map { Int($0) }
        guard parts.allSatisfy({ $0 != nil }) else { return nil }
        let nums = parts.compactMap { $0 }
        switch nums.count {
        case 2: return nums[0] * 60 + nums[1]
        case 3: return nums[0] * 3600 + nums[1] * 60 + nums[2]
        default: return nil
        }
    }

    /// Menos tiempo = más rápido. Solo se señala cuando los dos lados tienen un tiempo comparable y distinto.
    static func atletaMasRapido(_ row: DoblesH2HRow) -> Bool? {
        guard let s = seconds(from: row.selfValue), let p = seconds(from: row.partnerValue), s != p else { return nil }
        return s < p
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Hairline() }
                fila(row)
            }
        }
        .caraDobles(.neutra, radio: Theme.Radius.fila)
    }

    @ViewBuilder
    private func fila(_ row: DoblesH2HRow) -> some View {
        let masRapido = marcaAlMasRapido ? Self.atletaMasRapido(row) : nil
        Group {
            if tamanoDeTexto.isAccessibilitySize {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text(row.metric).papel(.nota).foregroundStyle(Theme.Color.muted)
                    HStack(spacing: Theme.Spacing.s) {
                        Text("Tú").papel(.rotulo).foregroundStyle(Theme.Color.accentText)
                        valor(row.selfValue, color: Theme.Color.accentText, ventaja: masRapido == true)
                    }
                    HStack(spacing: Theme.Spacing.s) {
                        Text(partnerName).papel(.rotulo).foregroundStyle(Theme.Color.partner)
                        valor(row.partnerValue, color: Theme.Color.partner, ventaja: masRapido == false)
                    }
                }
            } else {
                HStack(spacing: Theme.Spacing.s) {
                    Text(row.metric)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    valor(row.selfValue, color: Theme.Color.accentText, ventaja: masRapido == true)
                        .frame(width: Self.columna, alignment: .trailing)
                    Text("·").papel(.nota).foregroundStyle(Theme.Color.muted)
                    valor(row.partnerValue, color: Theme.Color.partner, ventaja: masRapido == false)
                        .frame(width: Self.columna, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accesible(row, masRapido: masRapido))
    }

    /// El valor de un lado. Sin él dice que no lo hay («tú 7:18 · él sin marca» se lee, y la comparación sigue
    /// teniendo sentido). El triángulo marca al que va más rápido.
    @ViewBuilder
    private func valor(_ texto: String?, color: SwiftUI.Color, ventaja: Bool) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            if let texto {
                Text(texto).papel(.notaPesada).foregroundStyle(color)
            } else {
                Text(ausente).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            if ventaja {
                Image(systemName: "arrowtriangle.up.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(color)
                    .accessibilityHidden(true)
            }
        }
    }

    private func accesible(_ row: DoblesH2HRow, masRapido: Bool?) -> String {
        let base = "\(row.metric): tú \(row.selfValue ?? ausente), \(partnerName) \(row.partnerValue ?? ausente)"
        switch masRapido {
        case .some(true): return base + ". Más rápido tú."
        case .some(false): return base + ". Más rápido \(partnerName)."
        case .none: return base
        }
    }
}

// MARK: - Quién aporta qué

/// Una fila de «quién aporta qué»: el grupo de disciplinas, quién lo lleva y la barra de reparto. A ±8 puntos
/// del 50/50 lee «parejos»; si no, el nombre de quien lidera.
struct DoblesAporteFila: View {
    let contribucion: DoblesContribution
    let partnerName: String

    /// A esta distancia del 50/50 (en puntos) el reparto se lee «parejos».
    private static let bandaDeParidad = 8

    private var selfPct: Int { Int((max(0, min(1, contribucion.selfShare)) * 100).rounded()) }
    private var parejos: Bool { abs(selfPct - 50) <= Self.bandaDeParidad }
    private var lideraElAtleta: Bool { selfPct >= 50 }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Text(contribucion.group)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Theme.Spacing.s)
                if parejos {
                    Text("parejos").papel(.nota).foregroundStyle(Theme.Color.muted)
                } else {
                    HStack(spacing: Theme.Spacing.xs) {
                        Text(lideraElAtleta ? "Tú" : partnerName).papel(.notaPesada)
                        Image(systemName: "arrowtriangle.up.fill").font(.system(size: 10))
                    }
                    .foregroundStyle(lideraElAtleta ? Theme.Color.accentText : Theme.Color.partner)
                }
            }
            DoblesSplitBar(selfShare: contribucion.selfShare)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra, radio: Theme.Radius.fila)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parejos
            ? "\(contribucion.group): parejos"
            : "\(contribucion.group): aporta más \(lideraElAtleta ? "tú" : partnerName)")
    }
}

// MARK: - El esqueleto

/// Las analíticas mientras llegan: la misma silueta que lo que las sustituye (dos teselas, un bloque con su
/// título y sus filas), sin inventar ninguna marca.
struct DoblesAnaliticasEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            HStack(spacing: Theme.Spacing.m) {
                SkeletonBar(height: Theme.Size.tesela, radius: Theme.Radius.tarjeta)
                SkeletonBar(height: Theme.Size.tesela, radius: Theme.Radius.tarjeta)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 150, height: 24, radius: 6)
                SkeletonBar(height: 3 * 52, radius: Theme.Radius.fila)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 170, height: 24, radius: 6)
                ForEach(0..<2, id: \.self) { _ in
                    SkeletonBar(height: 64, radius: Theme.Radius.fila)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando vuestras analíticas")
    }
}
