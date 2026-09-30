import SwiftUI

// «MI FUERZA» — el atleta ve sus PROPIOS máximos (el 1RM de cada levantamiento), igual que los lee su coach.
// Sale de GET /api/athlete/benchmarks (solo lectura) + POST /api/athlete/strength-test (registrar un test).
//
// Estados honestos (los de «Mis zonas»): esqueleto con la forma de la lista mientras carga, un vacío con
// su salida cuando aún no hay test (ni un máximo inventado) y un error con su reintento cuando falla la
// carga. El 1RM que se enseña es SIEMPRE el guardado por el servidor: la hoja de registrar enseña una
// estimación Epley al instante, pero el número de verdad vuelve del backend.
//
// AQUÍ SE QUEDA QUIÉN ERES, NO CÓMO HAS CAMBIADO. La evolución de cada 1RM (curva + delta) vive en
// Analíticas › Fuerza, que es la pestaña que existe para esa pregunta: lo que queda aquí es el peso de hoy,
// que es el que gobierna los porcentajes del próximo entreno.
//
// La vista se parte en CONTENEDOR (pide los datos) y `MyStrengthCuerpo` (pinta un estado ya resuelto), para
// poder montarla con datos de ejemplo en las `#Preview` y en la galería.

struct MyStrengthView: View {
    let bearer: String?
    /// FREE tier switch (athlete without coach) — the register-test note must
    /// not name a coach that does not exist.
    var hasCoach: Bool = true

    @State private var carga: CargaDePantallaPerfil<[StrengthMaxProfile]> = .cargando
    @State private var showRegister = false

    var body: some View {
        MyStrengthCuerpo(
            carga: carga,
            alRegistrar: { showRegister = true },
            alReintentar: { Task { await load() } }
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showRegister = true
                } label: {
                    Label("Registrar test", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .accessibilityLabel("Registrar un test de fuerza")
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterStrengthTestView(bearer: bearer, hasCoach: hasCoach) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        guard let bearer else { carga = .error; return }
        // Un reintento vuelve a esqueleto; un refresco con datos ya pintados no los tapa.
        if case .error = carga { carga = .cargando }
        do {
            carga = .datos(try await StrengthService.fetch(bearer: bearer))
        } catch {
            carga = .error
        }
    }
}

/// Lo que se pinta de «Mi fuerza» con el estado ya resuelto.
struct MyStrengthCuerpo: View {
    let carga: CargaDePantallaPerfil<[StrengthMaxProfile]>
    var alRegistrar: () -> Void = {}
    var alReintentar: () -> Void = {}

    var body: some View {
        switch carga {
        case .cargando:
            PantallaPerfil(titulo: "Mi fuerza") { EsqueletoDeFilasPerfil(filas: 4, conFicha: false) }
        case .error:
            PantallaPerfil(titulo: "Mi fuerza", alto: .llena) {
                ErrorDePantallaPerfil(kicker: "Mi fuerza", titulo: "No pudimos cargar tu fuerza", alReintentar: alReintentar)
            }
        case let .datos(maxes) where maxes.isEmpty:
            PantallaPerfil(titulo: "Mi fuerza", alto: .llena) {
                VacioDePantallaPerfil(
                    kicker: "Mi fuerza",
                    titulo: "Aún no has registrado tu fuerza",
                    apoyo: "Registra un test (peso × repeticiones) y calcularemos tu 1RM al momento.",
                    accion: ("Registrar test", .mas, alRegistrar)
                )
            }
        case let .datos(maxes):
            PantallaPerfil(titulo: "Mi fuerza") {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text("Tu fuerza máxima por levantamiento. Cuando un entreno te pide un % de tu 1RM, este es el peso real que te toca.")
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    // Lo que se llevó Analíticas se dice, y se dice dónde: una pantalla que pierde una
                    // lectura sin decir a dónde fue la deja huérfana.
                    NotaPerfil("Cómo ha ido subiendo cada uno, en Analíticas · Fuerza.")
                }
                GrupoPerfil {
                    ForEach(maxes) { FilaDeLevantamiento(max: $0) }
                }
            }
        }
    }
}

/// Un levantamiento y su peso de hoy (el dato, a 32 pt), con el origen del número debajo.
private struct FilaDeLevantamiento: View {
    let max: StrengthMaxProfile

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) { texto; Spacer(minLength: Theme.Spacing.s); dato }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) { texto; dato }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.l, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(max.exerciseLabel), \(max.oneRmLabel). \(origen ?? "")")
    }

    private var texto: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(max.exerciseLabel).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            if let origen {
                Text(origen).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var dato: some View {
        Text(max.oneRmLabel).papel(.dato).foregroundStyle(Theme.Color.foreground)
    }

    /// «130 kg × 3 · 20 jun 2026»: solo las partes que de verdad están.
    ///
    /// El sello de origen sale cuando el número NO lo midió el propio atleta. Un 1RM declarado al entrar llega
    /// sin peso ni repeticiones (no hubo test), así que sin sello se pintaba con la fecha a secas, idéntico a
    /// uno que sí se levantó. Misma grafía que en Marcas (`DataOrigin`).
    private var origen: String? {
        var parts: [String] = []
        if let w = max.testWeightKg, let r = max.testReps, w > 0, r > 0 {
            parts.append("\(Int(w.rounded())) kg × \(r)")
        }
        if let date = max.recordedDateLabel { parts.append(date) }
        if max.source != DataOrigin.athleteTest, let origin = DataOrigin.label(max.source) {
            parts.append(origin)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

#if DEBUG
extension StrengthMaxProfile {
    /// Un máximo de ejemplo para las `#Preview` y la galería (no es un dato de producción).
    static func ejemplo(_ slug: String, _ etiqueta: String, kg: Double, origen: String = "athlete_test", pesoTest: Double? = nil, reps: Int? = nil) -> StrengthMaxProfile {
        var json: [String: Any] = [
            "exercise_slug": slug, "exercise_label": etiqueta, "one_rm_kg": kg,
            "unit": "kg", "source": origen, "history": [Any](),
        ]
        if let pesoTest { json["test_weight_kg"] = pesoTest }
        if let reps { json["test_reps"] = reps }
        // swiftlint:disable:next force_try
        let datos = try! JSONSerialization.data(withJSONObject: json)
        // swiftlint:disable:next force_try
        return try! APIClient.makeJSONDecoder().decode(StrengthMaxProfile.self, from: datos)
    }
}

#Preview("Mi fuerza · datos") {
    EnAmbasDia {
        MyStrengthCuerpo(carga: .datos([
            .ejemplo("dl", "Peso muerto", kg: 165, pesoTest: 150, reps: 3),
            .ejemplo("sq", "Sentadilla", kg: 140, origen: "declared"),
        ]))
    }
}
#endif
