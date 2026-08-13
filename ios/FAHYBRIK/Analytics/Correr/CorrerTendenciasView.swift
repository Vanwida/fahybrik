import SwiftUI

// TENDENCIAS — tus números de correr por periodo (mapa v2; el Reports de
// Garmin, en nuestra voz). Un bloque por métrica: cifra del periodo, delta
// contra la ventana anterior DEL MISMO LARGO, y su serie debajo.
//
// HONESTIDAD EN DOS NIVELES: una métrica sin fuente en toda la ventana no
// existe (ni gris ni guion — el bloque no se pinta); y el delta solo sale si
// hay una ventana anterior completa que comparar («Todo» nunca la tiene).
//
// LOS DELTAS NO JUZGAN, salvo el VO₂máx: subir kilómetros o bajar el ritmo
// medio no es bueno ni malo por sí mismo (las series aceleran la media, el
// monte la frena). Del juicio ya se ocupa el Estado del hub.

struct CorrerTendenciasView: View {
    let bearer: String?
    /// Los grupos de volumen y terreno (kilómetros con desnivel, subida/llano/
    /// bajada): running puro que la tira colgaba al final y aquí es contexto
    /// natural de las series. Nulas si aún no llegaron.
    var analiticas: AnaliticasAtleta? = nil

    @State private var ventana: VentanaTendencias = .cuatroSemanas
    @State private var tendencias: TendenciasDeCorrer?
    @State private var fallo = false

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                selectorDeVentana
                if let tendencias {
                    contenido(tendencias)
                } else if fallo {
                    RedesignEmptyState(
                        symbol: "arrow.clockwise",
                        title: "No pudimos cargar tus tendencias",
                        message: "Revisa tu conexión e inténtalo de nuevo.",
                        exit: .action(title: "Reintentar") { Task { await cargar() } }
                    )
                } else {
                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(0..<3, id: \.self) { _ in AnalyticsSkeletonCard() }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Tendencias")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(bearer ?? "")|\(ventana.rawValue)") {
            await cargar()
        }
    }

    private func cargar() async {
        guard let bearer else { return }
        fallo = false
        do {
            tendencias = try await CorrerService.fetchTendencias(ventana: ventana, bearer: bearer)
        } catch {
            if tendencias == nil { fallo = true }
        }
    }

    // MARK: - La ventana

    private var selectorDeVentana: some View {
        HStack(spacing: 4) {
            ForEach(VentanaTendencias.allCases) { v in
                let activa = v == ventana
                Button {
                    guard !activa else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { ventana = v }
                } label: {
                    Text(v.label)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(activa ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(activa ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Periodo \(v.label)")
                .accessibilityAddTraits(activa ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    // MARK: - Los bloques

    @ViewBuilder
    private func contenido(_ t: TendenciasDeCorrer) -> some View {
        let b = t.buckets
        if b.isEmpty {
            RedesignEmptyState(
                symbol: "figure.run",
                title: "Nada que dibujar todavía",
                message: "Con unas semanas corriendo, tu año entero se lee aquí.",
                exit: .explained(note: "Cada salida suma sola: kilómetros, tiempo, ritmo y pulso.")
            )
        } else {
            VStack(alignment: .leading, spacing: 48) {
                bloqueSuma(etiqueta: "Kilómetros", unidad: "km", b: b,
                           valor: \.km, previo: t.prev?.km,
                           formato: { Formato.esDecimal($0, decimals: $0 >= 100 ? 0 : 1) })

                bloqueSuma(etiqueta: "Tiempo corriendo", unidad: nil, b: b,
                           valor: \.seconds, previo: t.prev?.seconds,
                           formato: { Formato.clock($0) })

                bloqueMedia(etiqueta: "Ritmo medio", b: b,
                            valor: \.ritmoMedioSKm, previo: t.prev?.ritmoMedioSKm,
                            mejorEsMenor: true,
                            formato: { Formato.ritmo($0, .porKm) },
                            pie: "Las series aceleran la media; el monte la frena.")

                bloqueMedia(etiqueta: "FC media", b: b,
                            valor: \.fcMedia, previo: t.prev?.fcMedia,
                            mejorEsMenor: true,
                            formato: { "\(Int($0.rounded())) \(Vocab.ppm)" },
                            pie: nil)

                bloqueSuma(etiqueta: "Desnivel", unidad: "m", b: b,
                           valor: { $0.desnivelM ?? 0 }, previo: t.prev?.desnivelM,
                           formato: { "\(Int($0.rounded()))" },
                           seCalla: b.allSatisfy { ($0.desnivelM ?? 0) <= 0 })

                bloqueMedia(etiqueta: "VO₂máx", b: b,
                            valor: \.vo2max, previo: t.prev?.vo2max,
                            mejorEsMenor: false, juzga: true,
                            formato: { Formato.esDecimal($0, decimals: 0) },
                            pie: nil)

                bloqueMedia(etiqueta: "Cadencia", b: b,
                            valor: \.cadenciaSpm, previo: nil,
                            mejorEsMenor: false,
                            formato: { Formato.esDecimal($0, decimals: 0) },
                            pie: nil)

                if let a = analiticas {
                    ForEach([GrupoLectura.volumen, .terreno], id: \.self) { grupo in
                        if let etiqueta = grupo.etiqueta {
                            GrupoDeLecturas(
                                etiqueta: etiqueta,
                                lecturas: a.lecturas.deGrupo(grupo),
                                ventana: a.ventanaEs,
                                onSalida: nil
                            )
                        }
                    }
                }
            }
        }
    }

    /// Un bloque de SUMA (km, tiempo, desnivel): el total del periodo y las
    /// barras por cubo. `seCalla` lo silencia entero cuando la fuente no da
    /// (desnivel sin altímetro): §7, ni gris ni guion.
    @ViewBuilder
    private func bloqueSuma(
        etiqueta: String,
        unidad: String?,
        b: [CuboDeTendencia],
        valor: (CuboDeTendencia) -> Double,
        previo: Double?,
        formato: @escaping (Double) -> String,
        seCalla: Bool = false
    ) -> some View {
        if !seCalla {
            let total = b.map(valor).reduce(0, +)
            BloqueDeLectura(etiqueta: etiqueta, apunte: apunteDeVentana) {
                CifraDeBloque(valor: formato(total), unidad: unidad, tam: 44) {
                    if let previo, previo > 0 {
                        let pct = Int(((total - previo) / previo * 100).rounded())
                        DeltaDeBloque(mejor: nil,
                                      valor: "\(pct > 0 ? "+" : "")\(pct) %",
                                      ventana: "vs anterior")
                    }
                }
                BarrasSemanales(puntos: b.map { PuntoSemana(semana: $0.start, valor: valor($0)) })
            }
        }
    }

    /// Un bloque de MEDIA (ritmo, FC, VO₂máx, cadencia): la media del periodo
    /// ponderada la trae cada cubo; aquí la cifra titular es el último cubo con
    /// dato y la línea enseña el recorrido. Sin un solo cubo con dato, el
    /// bloque no existe.
    @ViewBuilder
    private func bloqueMedia(
        etiqueta: String,
        b: [CuboDeTendencia],
        valor: (CuboDeTendencia) -> Double?,
        previo: Double?,
        mejorEsMenor: Bool,
        juzga: Bool = false,
        formato: @escaping (Double) -> String,
        pie: String?
    ) -> some View {
        let puntos = b.compactMap { cubo -> PuntoSemana? in
            guard let v = valor(cubo) else { return nil }
            return PuntoSemana(semana: cubo.start, valor: v)
        }
        if let ultimo = puntos.last {
            BloqueDeLectura(etiqueta: etiqueta, apunte: apunteDeVentana) {
                CifraDeBloque(valor: formato(ultimo.valor), unidad: nil, tam: 44) {
                    if let previo {
                        let delta = ultimo.valor - previo
                        if delta != 0 {
                            let mejor = juzga ? (mejorEsMenor ? delta < 0 : delta > 0) : nil
                            DeltaDeBloque(mejor: mejor,
                                          valor: formato(abs(delta)),
                                          ventana: "vs anterior")
                        }
                    }
                }
                LineaDeProgreso(puntos: puntos,
                                mejorEsMenor: mejorEsMenor,
                                formato: { formato($0) })
                if let pie {
                    Text(pie)
                        .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
    }

    /// «4 sem» / «6 meses» — sobre qué ventana habla cada bloque. Sin ella,
    /// doce semanas y dos años se dibujan igual de largos (regla del bloque).
    private var apunteDeVentana: String { ventana.label }
}
