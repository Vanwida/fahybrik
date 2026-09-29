import SwiftUI

// EL CAMINO — un póster. La única fotografía de la portada vive aquí: la carrera hacia la que va todo
// el plan, con la cuenta atrás en cifras enormes.
//
// Contraste MEDIDO (CONTRATO-UI §4.2): el texto va SIEMPRE sobre foto oscurecida, también con el tema
// claro. Eso lo resuelve `PosterDia` (superficie oscura anidada con dos capas entre la foto y el texto,
// ajustadas con una auditoría de píxeles); aquí solo se compone lo que va encima.
//
// La foto es la de siempre para cada carrera (`BrandImagery`, por identidad): esta pieza no elige foto.
//
// Estados: fijada (con o sin objetivo de tiempo, con o sin fase) · sin objetivo (invitación con su
// salida) · en frío (esqueleto de la misma forma) · sin coach o con error de carga NO se pinta: no
// sabemos qué carrera toca. El texto de proximidad de antes («Afina y descansa», que cableaba 7 y 21
// días) NO vuelve: eran días de método del coach.

struct HoyCamino: View {
    let lectura: LecturaHoy
    let acciones: HoyAcciones

    /// El alto del póster de la portada (`PosterDia(.portada)`); el esqueleto ocupa lo mismo.
    private static let altoDelPoster: CGFloat = 256

    var body: some View {
        if lectura.cargando {
            esqueleto
        } else {
            switch lectura.camino {
            case .fijada(let carrera)?: fijada(carrera)
            case .sinObjetivo?: invitacion
            case nil: EmptyView()
            }
        }
    }

    // MARK: - Carrera fijada

    private func fijada(_ c: CarreraDelCamino) -> some View {
        PosterDia(
            foto: c.foto,
            etiqueta: etiquetaAccesible(c),
            alTocar: { acciones.abrirPestana(.carreras) }
        ) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Camino a la carrera").papel(.kicker).foregroundStyle(Theme.Color.foreground)
                    .frame(minHeight: 32)
                Text(c.nombre).papel(.seccion).foregroundStyle(Theme.Color.foreground)
            }
            Spacer(minLength: 10)
            HStack(alignment: .bottom) {
                CuentaAtrasDia(dias: c.dias)
                Spacer(minLength: 12)
                if let meta = c.meta {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(Vocab.objetivo).papel(.rotulo)
                        Text(meta).papel(.accion)
                    }
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .panelSobreFoto()
                }
            }
            Spacer(minLength: 10)
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                if let fase = c.fase {
                    Text(fase).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    if let semana = c.semana { RegletaDia(n: semana.n, de: semana.m) }
                }
                if let simulacion = lectura.simulacion { lineaDeSimulacion(simulacion) }
            }
        }
    }

    private func etiquetaAccesible(_ c: CarreraDelCamino) -> String {
        [
            "Camino a \(c.nombre)",
            c.dias <= 0 ? "es hoy" : "faltan \(c.dias) \(c.dias == 1 ? "día" : "días")",
            c.fase,
            c.meta.map { "Objetivo \($0)" },
            lectura.simulacion.map(Self.textoDeSimulacion),
            "Ver carreras",
        ]
        .compactMap { $0 }
        .joined(separator: ". ")
    }

    // MARK: - Sin objetivo: una invitación

    private var invitacion: some View {
        PosterDia(
            foto: BrandImagery.raceCardBackgroundDefault,
            etiqueta: "Camino a la carrera. Elige tu carrera objetivo. Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo. Busca tu carrera",
            alTocar: acciones.buscarCarrera
        ) {
            Text("Camino a la carrera").papel(.kicker).foregroundStyle(Theme.Color.foreground)
                .frame(minHeight: 32)
            Text("Elige tu carrera objetivo")
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text("Fíjala y tu plan tendrá un destino: cuenta atrás, fase y objetivo de tiempo.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 10)
            AccionDia("Busca tu carrera", glifo: .lupa)
            if let s = lectura.simulacion, s.esProgramada { lineaDeSimulacion(s) }
        }
    }

    // MARK: - La simulación

    static func textoDeSimulacion(_ s: Simulacion) -> String {
        switch s {
        case .programada(let dia, let hoy): return hoy ? "Simulación HYROX hoy" : "Simulación HYROX \(dia)"
        case .abierta: return "Una simulación afina tu predicho"
        }
    }

    /// La línea de abajo del póster: la simulación programada o la puerta honesta que afila la previsión.
    private func lineaDeSimulacion(_ s: Simulacion) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            IconoDia(s.esProgramada ? .calendario : .diana, tam: 18).foregroundStyle(Theme.Color.accentText)
            Text(Self.textoDeSimulacion(s)).papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 10)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.foreground.opacity(0.22)).frame(height: 1)
        }
    }

    // MARK: - En frío

    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: 10) {
            SkeletonBar(width: 170, height: 15, radius: 5).frame(minHeight: 32)
            SkeletonBar(height: 28, radius: 8).frame(maxWidth: 220)
            Spacer(minLength: 10)
            SkeletonBar(width: 128, height: 72, radius: 12)
            Spacer(minLength: 10)
            SkeletonBar(height: 17, radius: 6).frame(maxWidth: 250)
            SkeletonBar(height: 6, radius: 3)
            SkeletonBar(height: 15, radius: 5).frame(maxWidth: 170)
        }
        .padding(EdgeInsets(top: 16, leading: 20, bottom: 18, trailing: 20))
        .frame(maxWidth: .infinity, minHeight: Self.altoDelPoster, alignment: .topLeading)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
            .strokeBorder(Theme.Color.hairline, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu camino a la carrera")
    }
}
