import os
import SwiftUI

private let catalogLog = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.fahybrid.app",
    category: "catalog"
)

// EL SELECTOR DE EJERCICIOS del constructor libre (fuerza, funcional y la hoja de «¿Qué hiciste?»).
//
// Un buscador sobre GET /api/athlete/exercises, con espera entre teclas, los resultados agrupados por su
// categoría en español y un toque para elegir. `preferredCategory` sólo ORDENA (su sección sube arriba),
// nunca filtra: quien apunta unos swings como fuerza los sigue encontrando en Funcional. Estados honestos
// (cargando con la forma de la lista, fallo con reintento, vacío con salida), en español natural. Cero
// texto libre: la búsqueda sólo consulta el catálogo.
struct FreeExercisePickerView: View {
    let bearer: String?
    /// El constructor que abrió el selector ("strength" | "functional"): ordena, NO restringe.
    let preferredCategory: String
    let onPick: (FreeExercise) -> Void
    let onClose: () -> Void

    @State private var searchText: String = ""
    @State private var all: [FreeExercise]
    @State private var phase: LoadPhase
    @State private var searchTask: Task<Void, Never>? = nil
    @State private var didStartLoad = false

    /// Espera antes de que una tecla lance la búsqueda: junta a quien escribe rápido y sigue sintiéndose
    /// en vivo.
    private static let searchDebounceNanos: UInt64 = 300_000_000

    enum LoadPhase: Equatable {
        case loading
        case loaded
        case failed
    }

    init(
        bearer: String?,
        preferredCategory: String,
        onPick: @escaping (FreeExercise) -> Void,
        onClose: @escaping () -> Void,
        catalogoInicial: [FreeExercise]? = nil,
        faseInicial: LoadPhase? = nil
    ) {
        self.bearer = bearer
        self.preferredCategory = preferredCategory
        self.onPick = onPick
        self.onClose = onClose
        _all = State(initialValue: catalogoInicial ?? [])
        _phase = State(initialValue: faseInicial ?? (catalogoInicial == nil ? .loading : .loaded))
        // Con un catálogo ya dado (las previas y la galería) no se pide nada a la red.
        _didStartLoad = State(initialValue: catalogoInicial != nil || faseInicial != nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CromoConstructorLibre(salida: .cerrar, alSalir: onClose)
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloPasoLibre(etiqueta: "Catálogo", titulo: "Añade un ejercicio",
                                apoyo: "Busca por nombre y toca para añadirlo.")
                searchField
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.m)
            content
        }
        .background(Theme.Color.background.ignoresSafeArea())
        // Tarea suelta, no `.task`: este selector vive dentro de la cubierta a pantalla completa del
        // constructor. SwiftUI cancela `.task` cuando esa cubierta se reordena, el GET vuelve con 200 y
        // el indicador no sale nunca de «Cargando…».
        .onAppear {
            guard !didStartLoad else { return }
            didStartLoad = true
            Task { await load(search: nil) }
        }
    }

    // MARK: - El buscador (la ÚNICA entrada de texto: consulta el catálogo, no escribe dosis)

    private var searchField: some View {
        HStack(spacing: Theme.Spacing.m) {
            IconoDia(.lupa, tam: 18)
                .foregroundStyle(Theme.Color.muted)
            TextField("Buscar ejercicio", text: $searchText)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .accessibilityLabel("Buscar ejercicio")
            if !searchText.isEmpty {
                Button {
                    Haptics.light()
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(.leading, Theme.Spacing.l)
        .padding(.trailing, searchText.isEmpty ? Theme.Spacing.l : 0)
        .frame(minHeight: Theme.Size.accion)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.hairline, lineWidth: 1))
        .onChange(of: searchText) { _, new in scheduleSearch(new) }
    }

    // MARK: - Los estados

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            EsqueletoCatalogoLibre()
        case .failed:
            ScrollView {
                SujetoDia(
                    tono: .peligro,
                    etiqueta: "No se han podido cargar los ejercicios. Revisa tu conexión y vuelve a intentarlo.",
                    anuncia: true
                ) {
                    KickerDia("Catálogo")
                    TituloDia("No se han podido cargar")
                    ApoyoDia("Revisa tu conexión e inténtalo de nuevo.")
                } abajo: {
                    Button {
                        Haptics.light()
                        let q = searchText
                        Task { await load(search: q) }
                    } label: {
                        AccionDia("Reintentar", glifo: .reintentar)
                    }
                    .buttonStyle(PressScaleStyle(escala: 0.96))
                }
                .padding(.horizontal, Theme.Spacing.pantalla)
            }
        case .loaded:
            if sections.isEmpty {
                vacio
            } else {
                list
            }
        }
    }

    /// Sin resultados: se dice qué se buscó y la salida es buscar otra cosa (o borrar la búsqueda).
    private var vacio: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text(emptyMessage)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if !searchText.isEmpty {
                Button {
                    Haptics.light()
                    searchText = ""
                } label: {
                    AccionDia("Ver todo el catálogo", glifo: nil)
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.top, Theme.Spacing.m)
    }

    private var list: some View {
        ScrollView {
            ListaCatalogoLibre(secciones: sections.map { ($0.label, $0.exercises) }, alElegir: { ex in
                Haptics.medium()
                onPick(ex)
            })
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    private var emptyMessage: String {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return q.isEmpty ? "No hay ejercicios en el catálogo." : "Nada para «\(q)». Prueba con otro nombre."
    }

    // MARK: - Grouping (biased, never filtered)

    private struct PickerSection: Equatable {
        let category: String
        let label: String
        let exercises: [FreeExercise]
    }

    /// El catálogo agrupado en secciones en español. La categoría preferida sube arriba, luego el resto
    /// por peso y, dentro de cada nivel, por orden alfabético: están todas las filas, sólo cambia el ORDEN.
    private var sections: [PickerSection] {
        let groups = Dictionary(grouping: all, by: { $0.category })
        return groups.keys
            .sorted { a, b in
                let wa = FreeExerciseCategory.sortWeight(a, preferred: preferredCategory)
                let wb = FreeExerciseCategory.sortWeight(b, preferred: preferredCategory)
                if wa != wb { return wa < wb }
                return FreeExerciseCategory.labelES(a) < FreeExerciseCategory.labelES(b)
            }
            .map { cat in
                let rows = (groups[cat] ?? []).sorted { $0.name < $1.name }
                return PickerSection(category: cat, label: FreeExerciseCategory.labelES(cat), exercises: rows)
            }
    }

    // MARK: - Fetch + debounce

    private func scheduleSearch(_ query: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanos)
            guard !Task.isCancelled else { return }
            await load(search: query)
        }
    }

    private func load(search: String?) async {
        if all.isEmpty { phase = .loading }
        do {
            let rows = try await FreeExerciseCatalogAPI.fetch(search: search, bearer: bearer)
            // Una BÚSQUEDA cancelada no pinta una consulta vieja. La primera carga va suelta (onAppear)
            // y la cubierta no la cancela. Nunca se tira una primera respuesta buena: eso es el
            // «Cargando…» infinito (GET 200 y el indicador se queda).
            if Task.isCancelled && !all.isEmpty { return }
            all = rows
            phase = .loaded
        } catch is CancellationError {
            if all.isEmpty { phase = .failed }
        } catch {
            if (error as? URLError)?.code == .cancelled {
                if all.isEmpty { phase = .failed }
                return
            }
            catalogLog.error("GET \(FreeExerciseCatalogAPI.path, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            if all.isEmpty { phase = .failed }
        }
    }
}

// MARK: - La lista del catálogo

/// Las secciones del catálogo con su cabecera fija y una fila por ejercicio. Es la cara que tiene el
/// selector con datos, y su esqueleto la imita.
struct ListaCatalogoLibre: View {
    let secciones: [(titulo: String, ejercicios: [FreeExercise])]
    let alElegir: (FreeExercise) -> Void

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
            ForEach(secciones, id: \.titulo) { seccion in
                Section {
                    ForEach(seccion.ejercicios) { ex in
                        fila(ex)
                        Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                            .padding(.leading, Theme.Spacing.pantalla)
                    }
                } header: {
                    Text(seccion.titulo)
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.top, Theme.Spacing.l)
                        .padding(.bottom, Theme.Spacing.s)
                        .background(Theme.Color.background)
                        .accessibilityAddTraits(.isHeader)
                }
            }
        }
    }

    private func fila(_ ex: FreeExercise) -> some View {
        Button { alElegir(ex) } label: {
            HStack(spacing: Theme.Spacing.m) {
                Text(ex.name)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.mas, tam: 18, peso: .bold)
                    .foregroundStyle(Theme.Color.accentText)
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .frame(minHeight: Theme.Size.accion)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Añadir \(ex.name)")
    }
}

/// Mientras llega el catálogo: una cabecera de sección y filas, con la misma forma que la lista.
struct EsqueletoCatalogoLibre: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SkeletonBar(width: 110, height: 15, radius: 5)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.m)
            ForEach(0..<7, id: \.self) { i in
                SkeletonBar(width: [180, 140, 210, 160, 190, 130, 170][i], height: 17, radius: 5)
                    .frame(minHeight: Theme.Size.accion, alignment: .leading)
                Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando ejercicios")
    }
}
