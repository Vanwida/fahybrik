import SwiftUI

// LAS SECCIONES DEL RESUMEN AL TERMINAR — cada una pinta UNA `LecturaResumen.Seccion`.
//
// Ninguna decide si existe: eso lo dice la lectura (`LecturaResumen.desde`). Aquí solo se
// pinta, con las piezas del día y las de `ResumenPiezas`. Los textos son los de siempre; lo
// que cambia es la piel (papeles de 15 pt en adelante, tarjetas del día, toques de 48 pt).

// MARK: - El sujeto: el registro que se va a guardar

struct SujetoResumen: View {
    let lectura: LecturaResumen
    /// El nombre de la sesión: lo que se va a guardar, dicho en palabras.
    let titulo: String
    /// La imagen del resumen para compartir; nil mientras no se ha podido pintar.
    let compartir: URL?

    private var textoTitulo: String {
        switch lectura.sujeto {
        case .tiempo(let reloj): return reloj
        case .registrar:         return "Registrar entreno"
        }
    }

    private var etiquetaAccesible: String {
        let estado = lectura.aMedias ? "A medias. " : ""
        return "\(lectura.kicker). \(estado)\(textoTitulo). \(titulo)"
    }

    var body: some View {
        SujetoDia(tono: lectura.aMedias ? .aviso : .ok, etiqueta: etiquetaAccesible) {
            KickerDia(lectura.kicker) {
                HStack(spacing: Theme.Spacing.s) {
                    if lectura.aMedias { InfoPill(text: "A medias", estilo: .velo) }
                    if let compartir { BotonCompartirResumen(url: compartir) }
                }
            }
            TituloDia(textoTitulo)
            if !titulo.isEmpty { ApoyoDia(titulo) }
        }
    }
}

/// Compartir la imagen del resumen: la chapita redonda del cromo con su nombre accesible.
struct BotonCompartirResumen: View {
    let url: URL

    var body: some View {
        ShareLink(item: url) {
            ChapitaDia {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 18, weight: .semibold))
            }
            .frame(width: Theme.Size.toque, height: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
        .accessibilityLabel("Compartir entreno")
    }
}

// MARK: - Lo que se midió

struct RecorridoResumen: View {
    let polyline: String

    var body: some View {
        TarjetaResumen(etiqueta: "Tu recorrido") {
            RouteMiniMap(polyline: polyline)
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                    .strokeBorder(Theme.Color.hairline, lineWidth: 1))
        }
    }
}

/// La barra de zonas. Abarca la SESIÓN, no la parte medida: los segundos que la banda no pudo
/// clasificar son su propio tramo (`ZoneCoverage`), así que anchos y leyenda responden «dónde
/// estuvo este entreno» y no «dónde estuvo la parte que se midió».
struct ZonasResumen: View {
    let cobertura: ZoneCoverage
    /// El UMBRAL contra el que se midieron, con «estimado» cuando nadie lo midió: el atleta tiene
    /// que distinguir unas bandas de su test de unas deducidas de su edad.
    let umbral: String?

    private static let altoBarra: CGFloat = 16

    var body: some View {
        TarjetaResumen(etiqueta: "Zonas") {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                if let umbral {
                    Text(umbral)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        ForEach(cobertura.bands) { banda in
                            Rectangle().fill(ZoneBandStyle.fill(banda))
                                .frame(width: max(0, geo.size.width * CGFloat(banda.pct) / 100))
                        }
                    }
                }
                .frame(height: Self.altoBarra)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                // La leyenda baja de línea cuando no cabe: seis bandas a 15 pt no caben en una.
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: Theme.Spacing.s, alignment: .leading)],
                          alignment: .leading, spacing: Theme.Spacing.xs) {
                    ForEach(cobertura.bands) { banda in
                        Text("\(banda.label) \(banda.pct)%")
                            .papel(.notaPesada)
                            .foregroundStyle(ZoneBandStyle.text(banda))
                    }
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(ZoneBandStyle.spoken(cobertura) + (umbral.map { ". \($0)" } ?? ""))
        }
    }
}

/// Las FC que midió el reloj, una tesela cada una. La que falta no deja casilla vacía: baja a
/// `FCDeclarableResumen`, que es donde el atleta puede hacer algo con ella.
struct FCMedidaResumen: View {
    let medidas: [(MetricaFCResumen, Int)]

    var body: some View {
        TeselasDia {
            ForEach(Array(medidas.enumerated()), id: \.offset) { _, medida in
                let (metrica, ppm) = medida
                TeselaDia(rotulo: metrica.etiqueta, altoMinimo: 104, etiqueta: "\(metrica.etiqueta) \(ppm) \(Vocab.ppm)") {
                    HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs) {
                        Text("\(ppm)")
                            .papel(.dato)
                            .foregroundStyle(Theme.Color.foreground)
                        Text(Vocab.ppm)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }
        }
    }
}

/// Lo que el reloj no dejó y el atleta sí sabe. Se ofrece POR MÉTRICA: la que falta, aunque haya la
/// otra. Anotar una nunca pisa la medida (el envío rellena hueco a hueco, `ManualSegmentOverlay`).
struct FCDeclarableResumen: View {
    let metricas: [MetricaFCResumen]
    let sinPulsometro: Bool
    let valor: (MetricaFCResumen) -> Binding<Int?>

    var body: some View {
        TarjetaResumen(etiqueta: "Frecuencia cardiaca") {
            Text(sinPulsometro
                 ? "Sin pulsómetro. Anótala a mano si la conoces."
                 : "Esta el reloj no la dejó. Anótala si la conoces.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(metricas, id: \.self) { m in
                CampoCifraResumen(etiqueta: m.etiqueta, unidad: Vocab.ppm, valor: valor(m))
            }
        }
    }
}

// MARK: - Tu resultado

/// La puntuación del formato: el tiempo final (mm:ss; los minutos pueden pasar de 60 en un
/// simulacro HYROX) o las rondas y las reps de la ronda a medias.
struct ResultadoResumen: View {
    let puntuacion: LecturaResumen.Puntuacion
    @Binding var tiempo: Int?
    @Binding var rondas: Int?
    @Binding var reps: Int?

    var body: some View {
        TarjetaResumen(etiqueta: "Resultado") {
            switch puntuacion {
            case .tiempo:
                CampoTiempoResumen(etiqueta: "Tiempo final", segundos: $tiempo)
            case .rondas(let etiqueta, let etiquetaReps):
                CampoCifraResumen(etiqueta: etiqueta, valor: $rondas)
                if let etiquetaReps {
                    CampoCifraResumen(etiqueta: etiquetaReps, valor: $reps)
                }
            }
        }
    }
}

/// «Ya lo hice» en un formato que no puntúa por tiempo: la duración que el reloj habría medido.
struct DuracionManualResumen: View {
    @Binding var segundos: Int?

    var body: some View {
        TarjetaResumen(etiqueta: "Duración") {
            CampoTiempoResumen(etiqueta: "Tiempo total", segundos: $segundos)
        }
    }
}

// MARK: - Cómo fue

/// Cronómetro de box: los movimientos se dicen DESPUÉS del trabajo, cuando el atleta sabe qué hizo
/// y no tiene prisa. Una invitación, nunca un aviso: el entreno se guarda igual.
struct QueHicisteResumen: View {
    let pendiente: Bool
    let resumen: String?
    let alTocar: () -> Void

    var body: some View {
        TarjetaResumen(etiqueta: "Qué hiciste", pendiente: pendiente, hecho: !pendiente) {
            if let resumen {
                Text(resumen)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("El entreno se guarda igual. Si dices qué hiciste, cuenta también en tus ejercicios.")
                    .papel(.nota)
                    .foregroundStyle(TarjetaResumen<EmptyView>.apoyo(pendiente: pendiente))
                    .fixedSize(horizontal: false, vertical: true)
            }
            BotonContornoResumen(titulo: pendiente ? "Añadir movimientos" : "Editar", alTocar: alTocar)
        }
    }
}

/// El esfuerzo percibido. Empieza VACÍO y así se queda hasta que el atleta elige: un RPE puesto de
/// antes se guardaría como si lo hubiera dicho. Tocar otra vez el elegido lo quita, para que un
/// toque perdido no deje un esfuerzo que nadie sintió. Diez toques de 48 pt en dos filas de cinco:
/// en una sola fila eran círculos de 26 pt.
struct EsfuerzoResumen: View {
    @Binding var rpe: Int?

    private static let columnas = Array(repeating: GridItem(.flexible(), spacing: Theme.Spacing.s), count: 5)

    var body: some View {
        TarjetaResumen(etiqueta: "RPE", pendiente: rpe == nil, hecho: rpe != nil) {
            if rpe == nil {
                Text("Del 1 (muy suave) al 10 (a tope). Si no lo marcas, se guarda sin RPE.")
                    .papel(.nota)
                    .foregroundStyle(TarjetaResumen<EmptyView>.apoyo(pendiente: true))
                    .fixedSize(horizontal: false, vertical: true)
            }
            LazyVGrid(columns: Self.columnas, spacing: Theme.Spacing.s) {
                ForEach(1...10, id: \.self) { n in
                    let elegida = rpe == n
                    OpcionResumen(
                        titulo: "\(n)",
                        elegida: elegida,
                        etiquetaAccesible: "Esfuerzo percibido \(n) de 10",
                        pista: elegida ? "Toca otra vez para quitarlo" : nil
                    ) { rpe = elegida ? nil : n }
                }
            }
        }
    }
}

struct NotasResumen: View {
    @Binding var notas: String

    var body: some View {
        TarjetaResumen(etiqueta: "Notas") {
            CampoTextoResumen(marcador: "Opcional", etiquetaAccesible: "Notas del entreno", texto: $notas)
        }
    }
}
