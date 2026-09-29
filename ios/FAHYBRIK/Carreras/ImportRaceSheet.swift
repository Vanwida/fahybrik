import SwiftUI

// Import an athlete's HYROX history into the Carreras hub. Espejo de `importar.tsx`.
//
// PRIMARY flow (name search): the athlete searches their NAME → picks their profile from candidates
// (nation + race count + PRO/ELITE chip disambiguate namesakes) → confirms ("¿Eres tú?") → we import
// their ENTIRE history (individual AND doubles/relay) via POST /race-results/import-all. The confirm
// step is the guard that stops importing a stranger's history, and "No soy yo" is its way out.
//
// SECONDARY flow (paste a link): kept for the one-off case — paste an official results.hyrox.com
// athlete link → POST /race-results/import (single race). The old endpoint + client pre-flight live
// unchanged in CarrerasService. Both flows are the SAME sheet, one step apart.
//
// Estados de cada paso: buscar (reposo, buscando, candidatos, sin resultados, error) · confirmar
// (listo, importando, error) · enlace (vacío, enlace que no es de HYROX, importando, error). Los textos
// de error son los de la app; en éxito se hace la háptica, se cierra y `onImported(result)` deja que
// quien abrió la hoja siembre el historial.
struct ImportRaceSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Called after a successful import so the parent can refresh the hub. The full-history import
    /// passes its result (the rich, doubles-aware races) so the hub can render them immediately; the
    /// single-link path passes nil (the hub just re-fetches the race-context overview).
    let onImported: (HyresultImportAllResult?) -> Void

    private enum Paso { case buscar, confirmar, enlace }
    private enum Campo { case nombre, enlace }

    @State private var paso: Paso = .buscar

    // Búsqueda.
    @State private var query = ""
    @State private var candidates: [HyresultCandidate] = []
    @State private var searching = false
    @State private var searched = false
    @State private var searchError: String? = nil
    @State private var searchTask: Task<Void, Never>? = nil

    // Confirmar.
    @State private var candidato: HyresultCandidate? = nil
    @State private var importando = false
    @State private var errorAlImportar: String? = nil

    // Enlace.
    @State private var enlace = ""
    @State private var errorDelEnlace: String? = nil

    @FocusState private var foco: Campo?

    /// Debounce window before a keystroke fires a search.
    private let debounceNanos: UInt64 = 350_000_000
    private let minQueryLength = 2

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var enlaceValido: Bool { HyroxImport.looksLikeResultURL(enlace) }

    var body: some View {
        Group {
            switch paso {
            case .buscar: buscar
            case .confirmar: confirmar
            case .enlace: pegarEnlace
            }
        }
        .presentationDetents([.large])
        .onAppear { foco = .nombre }
        .onDisappear { searchTask?.cancel() }
    }

    // MARK: - Paso 1: buscar tu nombre

    private var buscar: some View {
        MarcoDeHojaCarreras("Importar carrera", cerrar: { dismiss() }) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Busca tu nombre").subtituloCarreras()
                    Text("Importaremos todo tu historial de HYROX, individuales y dobles, desde tus resultados oficiales. Elige tu perfil de la lista.")
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                campoNombre
                resultados
                if candidates.isEmpty && searchError == nil && !searching && !(searched && trimmedQuery.count >= minQueryLength) {
                    comoFunciona
                    BotonTextoCarreras("¿Prefieres pegar el enlace de una carrera?", centrado: true, accion: irAlEnlace) {
                        IconoCarreras(.enlace, tam: 20)
                    }
                }
            }
        }
    }

    private var campoNombre: some View {
        CampoCarreras(
            "Tu nombre",
            enFoco: foco == .nombre,
            izquierda: { IconoDia(.lupa, tam: 20) },
            derecha: {
                if searching {
                    ProgressView()
                        .tint(Theme.Color.accentText)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .accessibilityLabel("Buscando")
                } else if !query.isEmpty {
                    Button {
                        Haptics.light()
                        clearSearch()
                    } label: {
                        IconoDia(.cerrar, tam: 18, peso: .bold)
                            .foregroundStyle(Theme.Color.muted)
                            .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Borrar búsqueda")
                }
            }
        ) {
            TextField("Nombre y apellidos", text: $query)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled(true)
                .submitLabel(.search)
                .focused($foco, equals: .nombre)
                .onChange(of: query) { _, _ in scheduleSearch() }
                .onSubmit { runSearchNow() }
                .accessibilityLabel("Tu nombre")
        }
    }

    @ViewBuilder
    private var resultados: some View {
        if let searchError {
            AvisoEnLinea(searchError)
        } else if !candidates.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("¿Cuál eres tú?").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                    .accessibilityAddTraits(.isHeader)
                ForEach(candidates) { c in FilaCandidato(candidato: c) { elige(c) } }
            }
        } else if searched && !searching && trimmedQuery.count >= minQueryLength {
            VStack(alignment: .leading, spacing: 10) {
                Text("Sin resultados").subtituloCarreras()
                Text("No encontramos ese nombre. Revisa que esté bien escrito y prueba con tu nombre completo, tal y como aparece en tus resultados de HYROX.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                // The other way in: paste the link of one official result page.
                SalidaAccionCarreras("Pegar el enlace de una carrera", accion: irAlEnlace) { IconoCarreras(.enlace, tam: 20) }
            }
            .padding(EdgeInsets(top: 18, leading: 18, bottom: 14, trailing: 18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .tarjetaCarreras()
        }
    }

    private var comoFunciona: some View {
        let pasos = [
            "Escribe tu nombre completo tal y como compites.",
            "Elige tu perfil de la lista (te ayudamos con tu país y tu número de carreras).",
            "Confirma e importamos todo tu historial: individuales y dobles.",
        ]
        return VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("Cómo funciona").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
            ForEach(Array(pasos.enumerated()), id: \.offset) { i, texto in
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    Text("\(i + 1)")
                        .papel(.notaPesada)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 28, height: 28)
                        .background(Theme.Color.accentTint, in: Circle())
                        .accessibilityHidden(true)
                    Text(texto)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaCarreras()
    }

    private func elige(_ c: HyresultCandidate) {
        foco = nil
        candidato = c
        errorAlImportar = nil
        withAnimation(.easeOut(duration: 0.2)) { paso = .confirmar }
    }

    private func irAlEnlace() {
        foco = nil
        errorDelEnlace = nil
        withAnimation(.easeOut(duration: 0.2)) { paso = .enlace }
    }

    // MARK: - Paso 2: «¿Eres tú?»

    private var confirmar: some View {
        MarcoDeHojaCarreras(
            "Importar carrera",
            atras: importando ? nil : { volverABuscar(limpiando: false) },
            cerrar: { dismiss() }
        ) {
            if let c = candidato {
                let carreras = c.races_count == 1 ? "tu carrera" : "tus \(c.races_count) carreras"
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Confirma tu perfil").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
                        HStack(spacing: 10) {
                            Text(c.name).papel(.seccion).foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                            if let nivel = c.level, !nivel.isEmpty { ChipCarreras(nivel.uppercased(), estilo: .acento) }
                        }
                        Text(metaCandidato(c)).papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .tarjetaCarreras(realce: true)
                    .accessibilityElement(children: .combine)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("¿Eres tú?").subtituloCarreras()
                        Text("Importaremos \(carreras), individuales y dobles, a tu historial. Si vuelves a importar, se actualizan sin duplicarse.")
                            .papel(.cuerpo)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let errorAlImportar { AvisoEnLinea(errorAlImportar) }
                }
            }
        } accion: {
            BotonPrimarioCarreras(
                titulo: "Sí, importar mi historial",
                ocupado: importando,
                textoOcupado: "Importando…",
                voz: "Importando historial",
                accion: importaPerfil
            )
            BotonTextoCarreras("No soy yo", tono: .suave, centrado: true, desactivado: importando, accion: { volverABuscar(limpiando: true) }) {
                IconoCarreras(.sinPersona, tam: 20)
            }
        }
    }

    private func volverABuscar(limpiando: Bool) {
        errorAlImportar = nil
        if limpiando { candidato = nil }
        withAnimation(.easeOut(duration: 0.2)) { paso = .buscar }
        foco = .nombre
    }

    private func importaPerfil() {
        guard let candidato, !importando else { return }
        errorAlImportar = nil
        importando = true
        Task { @MainActor in
            do {
                let result = try await CarrerasService.importAllRaces(slug: candidato.slug, bearer: bearer)
                importando = false
                Haptics.success()
                onImported(result)
                dismiss()
            } catch let err as HyresultImportError {
                importando = false
                Haptics.error()
                errorAlImportar = err.message
            } catch {
                importando = false
                Haptics.error()
                errorAlImportar = HyresultImportError.generic.message
            }
        }
    }

    // MARK: - Paso alternativo: pegar el enlace de una carrera

    private var pegarEnlace: some View {
        let desajuste = !enlace.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !enlaceValido
        return MarcoDeHojaCarreras(
            "Pegar enlace",
            atras: importando ? nil : {
                errorDelEnlace = nil
                withAnimation(.easeOut(duration: 0.2)) { paso = .buscar }
            },
            cerrar: { dismiss() }
        ) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Pega el enlace de tu resultado").subtituloCarreras()
                    Text("Copia el enlace de tu página de atleta en \(HyroxImport.resultsHost) e importamos esa carrera.")
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CampoCarreras("Enlace HYROX", enFoco: foco == .enlace, aviso: desajuste, izquierda: { IconoCarreras(.enlace, tam: 20) }, derecha: { EmptyView() }) {
                    TextField("https://\(HyroxImport.resultsHost)/…", text: $enlace)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.URL)
                        .submitLabel(.go)
                        .focused($foco, equals: .enlace)
                        .disabled(importando)
                        .monospaced()
                        .onChange(of: enlace) { _, _ in if errorDelEnlace != nil { errorDelEnlace = nil } }
                        .onSubmit { if enlaceValido { importaEnlace() } }
                        .accessibilityLabel("Enlace de tu resultado en HYROX")
                }
                if desajuste {
                    Text("El enlace debe empezar por https:// y ser de \(HyroxImport.resultsHost).")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let errorDelEnlace { AvisoEnLinea(errorDelEnlace) }
            }
        } accion: {
            BotonPrimarioCarreras(
                titulo: "Importar",
                activo: enlaceValido,
                ocupado: importando,
                textoOcupado: "Importando…",
                voz: "Importando carrera",
                accion: importaEnlace
            )
        }
        .onAppear { foco = .enlace }
    }

    private func importaEnlace() {
        guard enlaceValido, !importando else { return }
        foco = nil
        errorDelEnlace = nil
        importando = true
        let url = enlace.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { @MainActor in
            do {
                try await CarrerasService.importRace(resultURL: url, bearer: bearer)
                importando = false
                Haptics.success()
                onImported(nil)
                dismiss()
            } catch let err as CarrerasImportError {
                importando = false
                Haptics.error()
                errorDelEnlace = err.message
            } catch {
                importando = false
                Haptics.error()
                errorDelEnlace = CarrerasImportError.generic.message
            }
        }
    }

    // MARK: - Search driving

    /// Debounced search: cancel the in-flight task and start a fresh one that waits `debounceNanos`
    /// before hitting the network, so typing doesn't fire a request per keystroke. A query under the
    /// min length clears the list.
    private func scheduleSearch() {
        searchTask?.cancel()
        searchError = nil
        let q = trimmedQuery
        guard q.count >= minQueryLength else {
            candidates = []
            searched = false
            searching = false
            return
        }
        searchTask = Task { @MainActor in
            searching = true
            try? await Task.sleep(nanoseconds: debounceNanos)
            if Task.isCancelled { return }
            await performSearch(q)
        }
    }

    /// Fire immediately on submit (skip the debounce).
    private func runSearchNow() {
        searchTask?.cancel()
        let q = trimmedQuery
        guard q.count >= minQueryLength else { return }
        searchTask = Task { @MainActor in
            searching = true
            await performSearch(q)
        }
    }

    @MainActor
    private func performSearch(_ q: String) async {
        do {
            let hits = try await CarrerasService.searchAthletes(query: q, bearer: bearer)
            if Task.isCancelled { return }
            candidates = hits
            searchError = nil
        } catch is CancellationError {
            return
        } catch let err as HyresultSearchError {
            candidates = []
            searchError = err.message
        } catch {
            candidates = []
            searchError = HyresultSearchError.generic.message
        }
        searched = true
        searching = false
    }

    private func clearSearch() {
        searchTask?.cancel()
        query = ""
        candidates = []
        searched = false
        searchError = nil
        searching = false
        foco = .nombre
    }
}

#if DEBUG
// LOS ESTADOS DE LA HOJA, para la galería de `#Preview` y las capturas: cada uno arranca la hoja ya en
// ese punto, sin red ni toques (el doble los alcanza con el teclado; aquí no hay teclado que escribir).
extension ImportRaceSheet {
    enum VistaDePrueba {
        case reposo, buscando, candidatos, sinResultados, errorDeBusqueda
        case confirmar, importando, errorAlImportar
        case enlaceVacio, enlaceMalo, enlaceImportando, enlaceConError
    }

    init(vista: VistaDePrueba) {
        self.init(bearer: nil, onImported: { _ in })
        let perfil = CasosCarreras.candidatos[0]
        switch vista {
        case .reposo: break
        case .buscando:
            _query = State(initialValue: "marc")
            _searching = State(initialValue: true)
        case .candidatos:
            _query = State(initialValue: "marc")
            _candidates = State(initialValue: CasosCarreras.candidatos)
            _searched = State(initialValue: true)
        case .sinResultados:
            _query = State(initialValue: "zzz")
            _searched = State(initialValue: true)
        case .errorDeBusqueda:
            _query = State(initialValue: "error")
            _searchError = State(initialValue: HyresultSearchError.unavailable.message)
            _searched = State(initialValue: true)
        case .confirmar, .importando, .errorAlImportar:
            _paso = State(initialValue: .confirmar)
            _candidato = State(initialValue: perfil)
            _importando = State(initialValue: vista == .importando)
            _errorAlImportar = State(initialValue: vista == .errorAlImportar ? HyresultImportError.unreadable.message : nil)
        case .enlaceVacio, .enlaceMalo, .enlaceImportando, .enlaceConError:
            _paso = State(initialValue: .enlace)
            _enlace = State(initialValue: vista == .enlaceMalo ? "https://ejemplo.com/resultado" : vista == .enlaceVacio ? "" : "https://\(HyroxImport.resultsHost)/season-8/athlete?idp=1")
            _importando = State(initialValue: vista == .enlaceImportando)
            _errorDelEnlace = State(initialValue: vista == .enlaceConError ? CarrerasImportError.unreadable.message : nil)
        }
    }
}
#endif

/// «ESP · 5 carreras»: país y número de carreras, lo que ayuda a distinguir a los homónimos.
private func metaCandidato(_ c: HyresultCandidate) -> String {
    [c.nation.flatMap { $0.isEmpty ? nil : $0.uppercased() }, c.races_count == 1 ? "1 carrera" : "\(c.races_count) carreras"]
        .compactMap { $0 }
        .joined(separator: " · ")
}

// MARK: - Un perfil de la búsqueda

private struct FilaCandidato: View {
    let candidato: HyresultCandidate
    let alElegir: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            alElegir()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Theme.Spacing.s) {
                        Text(candidato.name).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                            .multilineTextAlignment(.leading)
                        if let nivel = candidato.level, !nivel.isEmpty { ChipCarreras(nivel.uppercased(), estilo: .acento) }
                    }
                    Text(metaCandidato(candidato)).papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .tarjetaCarreras()
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(candidato.name)\(candidato.level.map { ", \($0)" } ?? ""), \(metaCandidato(candidato))")
        .accessibilityAddTraits(.isButton)
    }
}
