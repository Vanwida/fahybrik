import SwiftUI

// CAPACIDAD — umbral, zonas, velocidad crítica, récords y lo que te da hoy
// (mapa v2). El umbral es el sujeto: de él cuelgan las zonas y el plan.
//
// EL ÚNICO NARANJA DE LA PANTALLA es el test de zonas, y SOLO existe cuando
// falta el ancla — aterriza directo en SU test por el mismo arranque que usan
// las tarjetas de la batería (jamás en la batería entera; regla escrita en
// DECISIONS 13-ago tarde).
//
// REUTILIZA, NO REESCRIBE: el umbral con su procedencia y la escalera de zonas
// son las piezas ya shipeadas de `DetalleDeCarrera` (leen del payload de
// progreso); la curva de esfuerzos es la de la tira. Lo nuevo de verdad — VC,
// récords calle/cinta, predictor — llega del endpoint de capacidad.

struct CorrerCapacidadView: View {
    let progreso: RunningProgressPayload
    /// El grupo de capacidad de las lecturas (velocidad crítica + depósito, con
    /// su cobertura y procedencia): es el pintor ÚNICO de la VC — un segundo
    /// bloque desde otro endpoint serían dos números para el mismo hecho.
    var analiticas: AnaliticasAtleta? = nil
    let bearer: String?

    @State private var capacidad: CapacidadDeCorrer?
    @State private var fallo = false
    /// El arranque del test de zonas (spinner mientras el /start viaja).
    @State private var preparandoTest = false
    @State private var testLaunch: WorkoutLaunch? = nil

    private static let dentro: CGFloat = 24
    private static let entre: CGFloat = 48

    private var h: RunningHistory { progreso.history }

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Self.entre) {
                umbralYZonas
                velocidadCritica
                mejoresEsfuerzos
                records
                predictor
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Capacidad")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: bearer ?? "") {
            guard let bearer else { return }
            fallo = false
            do {
                capacidad = try await CorrerService.fetchCapacidad(bearer: bearer)
            } catch {
                if capacidad == nil { fallo = true }
            }
        }
        .fullScreenCover(item: $testLaunch) { launch in
            WorkoutContainer(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { testLaunch = nil },
                onCompleted: { _ in testLaunch = nil }
            )
        }
    }

    // MARK: - El umbral y sus zonas (piezas shipeadas de DetalleDeCarrera)

    @ViewBuilder
    private var umbralYZonas: some View {
        VStack(alignment: .leading, spacing: Self.dentro) {
            if let umbral = h.umbral {
                BloqueDeLectura(etiqueta: "Tu umbral") {
                    UmbralDeRitmo(umbral: umbral)
                }
            } else {
                // SIN ANCLA: el hueco se declara porque el atleta puede llenarlo
                // con un acto concreto (§6.2 bis) — y el acto es SU test.
                BloqueDeLectura(etiqueta: "Tu umbral") {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        Text("Sin test de zonas todavía. Con uno, tu umbral y tus bandas quedan fijados al momento.")
                            .scaledFont(13, weight: .medium, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        if let test = capacidad?.testZonas {
                            botonDeTest(test)
                        }
                    }
                }
            }
            if !h.zonasRitmo.isEmpty {
                BloqueDeLectura(etiqueta: "Tus zonas de ritmo") {
                    EscaleraDeZonas(zonas: h.zonasRitmo)
                }
            }
        }
    }

    /// EL ÚNICO NARANJA. Aterriza en el test de zonas de correr por el mismo
    /// arranque de la batería (crea/reutiliza el assignment de HOY y lanza el
    /// flujo normal de sesión, con su guía y su audio).
    private func botonDeTest(_ test: TestDeZonas) -> some View {
        Button {
            Haptics.light()
            Task { await lanzarTest(test) }
        } label: {
            Text(preparandoTest ? "PREPARANDO…" : test.labelEs.uppercased())
                .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
                .tracking(0.6)
                .foregroundStyle(Theme.Color.accentOn)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, 11)
                .background(Theme.Color.accent)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(preparandoTest || bearer == nil)
    }

    private func lanzarTest(_ test: TestDeZonas) async {
        guard let bearer, !preparandoTest else { return }
        preparandoTest = true
        defer { preparandoTest = false }
        if let resp = try? await TestBatteryService.startTest(slug: test.slug, bearer: bearer) {
            testLaunch = WorkoutLaunch(assignmentId: resp.assignmentId, title: test.labelEs)
        }
    }

    // MARK: - Velocidad crítica (el grupo de lecturas ya shipeado)

    @ViewBuilder
    private var velocidadCritica: some View {
        if let a = analiticas {
            GrupoDeLecturas(
                etiqueta: GrupoLectura.capacidad.etiqueta ?? "Capacidad",
                lecturas: a.lecturas.deGrupo(.capacidad),
                ventana: a.ventanaEs,
                onSalida: nil
            )
        }
    }

    // MARK: - Mejores esfuerzos (la curva, mudada de la tira)

    @ViewBuilder
    private var mejoresEsfuerzos: some View {
        if !h.esfuerzos.isEmpty {
            BloqueDeLectura(etiqueta: "Mejores esfuerzos") {
                if let cinco = h.esfuerzos.first(where: { $0.metros == 5000 }) {
                    CifraDeBloque(valor: Formato.clock(cinco.segundos), unidad: "5 km", tam: 36) {
                        if let d = progreso.deltas.esfuerzos {
                            DeltaDeBloque(mejor: d.ganaS > 0,
                                          valor: "\(Int(abs(d.ganaS).rounded())) s",
                                          ventana: "1 mes")
                        }
                    }
                }
                CurvaDeEsfuerzos(hoy: h.esfuerzos, antes: h.esfuerzosAntes)
            }
        }
    }

    // MARK: - Récords — catálogo cerrado, calle y cinta separados

    @ViewBuilder
    private var records: some View {
        let calle = (capacidad?.records ?? []).filter { $0.contexto == "street" }
        let cinta = (capacidad?.records ?? []).filter { $0.contexto == "treadmill" }
        if !calle.isEmpty || !cinta.isEmpty {
            BloqueDeLectura(etiqueta: "Tus récords") {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    if !calle.isEmpty {
                        columnaDeRecords(titulo: "Aire libre", records: calle)
                    }
                    if !cinta.isEmpty {
                        // UN 5K EN CINTA JAMÁS BATE AL DE CALLE: el récord vive
                        // por contexto (decisión del catálogo, 13-ago).
                        columnaDeRecords(titulo: "En cinta", records: cinta)
                    }
                }
            }
        }
    }

    private func columnaDeRecords(titulo: String, records: [RecordDeCorrer]) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(titulo)
                .scaledFont(10, weight: .bold, relativeTo: .caption2)
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.faint)
            ForEach(records) { r in
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    Text(r.labelEs)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                    if r.reciente {
                        Image(systemName: "star.fill")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(Theme.Color.warning)
                            .accessibilityLabel("Récord reciente")
                    }
                    Spacer(minLength: Theme.Spacing.s)
                    if let fecha = r.fecha, let corta = FechaES.corta(fecha) {
                        Text(corta)
                            .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                    Text(valorDeRecord(r))
                        .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// La marca en su unidad: el Cooper vive en metros (más alto mejor); el
    /// resto, en tiempo. Una unidad desconocida no se disfraza de ninguna.
    private func valorDeRecord(_ r: RecordDeCorrer) -> String {
        switch r.unidad {
        case "seconds": return Formato.clock(r.valor)
        case "meters":  return Formato.distancia(r.valor) ?? "\(Int(r.valor.rounded())) m"
        default:        return Formato.esDecimal(r.valor, decimals: 0)
        }
    }

    // MARK: - El predictor — lo que te da hoy

    @ViewBuilder
    private var predictor: some View {
        if let predicciones = capacidad?.predictor, !predicciones.isEmpty {
            BloqueDeLectura(etiqueta: "Lo que te da hoy") {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(predicciones) { p in
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                            Text(nombreDeDistancia(p.distanciaM))
                                .scaledFont(12, weight: .medium, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                            Spacer(minLength: Theme.Spacing.s)
                            if let delta = p.deltaS, delta != 0 {
                                // En un tiempo previsto, bajar ES mejorar.
                                DeltaDeBloque(mejor: delta < 0,
                                              valor: "\(Int(abs(delta).rounded())) s",
                                              ventana: "4 sem")
                            }
                            Text(Formato.clock(p.segundos))
                                .font(.system(size: 13, weight: .bold, design: .monospaced).monospacedDigit())
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
                    Text("Proyección con tu forma actual, en llano.")
                        .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        } else if capacidad != nil && h.umbral == nil {
            // Sin base no se inventa un tiempo: se dice de qué saldría. El
            // botón ya vive arriba, en el umbral — uno, no dos.
            Text("Con un test de zonas te digo qué te dan hoy un 5, un 10, una media y una maratón.")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func nombreDeDistancia(_ metros: Int) -> String {
        switch metros {
        case 5000:  return "5 km"
        case 10000: return "10 km"
        case 21097: return "Media maratón"
        case 42195: return "Maratón"
        default:    return Formato.distancia(Double(metros)) ?? "\(metros) m"
        }
    }
}
