import SwiftUI

// PRÓXIMAS — los objetivos que NO son el sujeto, en orden de día. Espejo de `proximas.tsx`.
//
// El principal (cuando no manda el sujeto) va el primero y lleva el realce del acento; cada tarjeta
// es UNA puerta al detalle y sus acciones raras (preguntar al coach, hacer principal, eliminar)
// cuelgan de un ⋯ de 48 pt —y de la pulsación larga, que ya existía—. Con más de cuatro se pliega a
// tres y un «Ver N más».
//
// Estados: con datos · en frío (esqueleto con la forma de la tarjeta) · vacío con salida (la fila
// «Buscar…», que dice qué pasa al fijar una carrera) · en error no se pinta (el sujeto ya lo dice).

/// Las acciones raras de una carrera (el ⋯ y la pulsación larga).
enum AccionCarrera: Equatable {
    case preguntar
    case hacerPrincipal
    case quitar
}

/// Los botones del menú de una carrera. UNA sola lista para los dos sitios donde se ofrece (el ⋯,
/// que abre un diálogo, y la pulsación larga): «Hacer objetivo principal» solo si no lo es ya (no hay
/// nada que promover), «Preguntar al coach» solo con coach, y «Eliminar carrera» pasa por su
/// confirmación.
struct BotonesAccionesCarrera: View {
    let esPrincipal: Bool
    let conCoach: Bool
    let elige: (AccionCarrera) -> Void

    var body: some View {
        if conCoach {
            Button { elige(.preguntar) } label: { Label("Preguntar al coach", systemImage: "message") }
        }
        if !esPrincipal {
            Button { elige(.hacerPrincipal) } label: { Label("Hacer objetivo principal", systemImage: GlifoDia.estrella.simbolo) }
        }
        Button(role: .destructive) { elige(.quitar) } label: { Label("Eliminar carrera", systemImage: GlifoDia.papelera.simbolo) }
    }
}

struct ProximasCarreras: View {
    let lectura: LecturaCarreras
    let items: [ProximaCarrera]
    let principalId: Int?
    /// Cuando NO queda ninguna, qué dice la fila de salida (depende de si el sujeto ya es una carrera).
    let invitacion: (titulo: String, detalle: String)
    let alAbrir: (ProximaCarrera) -> Void
    let alElegir: (AccionCarrera, ProximaCarrera) -> Void
    let alAcciones: (ProximaCarrera) -> Void
    let alBuscar: () -> Void

    @State private var abierto = false

    /// Desde cuántas tarjetas se pliega, y cuántas quedan a la vista al plegar.
    static let plegarDesde = 4
    static let visiblesPlegado = 3

    var body: some View {
        if lectura.cargaHub == .fria {
            frio
        } else if items.isEmpty {
            vacio
        } else {
            lista
        }
    }

    // MARK: En frío

    private var frio: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SkeletonBar(width: 120, height: 26, radius: 8).frame(minHeight: 44, alignment: .leading)
            EsqueletoTarjetaProxima()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tus próximas carreras")
        .accessibilityAddTraits(.updatesFrequently)
    }

    // MARK: Vacío con salida

    private var vacio: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Próximas")
            Button {
                Haptics.light()
                alBuscar()
            } label: {
                HStack(spacing: 14) {
                    FichaDia(tono: .realce) { IconoDia(.lupa, tam: 22) }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(invitacion.titulo).papel(.accion).foregroundStyle(Theme.Color.foreground)
                        Text(invitacion.detalle).papel(.nota).foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m + 2)
                .frame(minHeight: 76)
                .background(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous).strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
            }
            .buttonStyle(PressScaleStyle(escala: 0.98))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(invitacion.titulo). \(invitacion.detalle)")
            .accessibilityAddTraits(.isButton)
        }
    }

    // MARK: Con datos

    private var lista: some View {
        let plegable = items.count >= Self.plegarDesde
        let visibles = plegable && !abierto ? Array(items.prefix(Self.visiblesPlegado)) : items
        return VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Próximas") {
                PastillaSeccionDia("Buscar carrera", glifo: .lupa, accion: alBuscar)
            }
            VStack(spacing: Theme.Spacing.m) {
                ForEach(visibles) { c in
                    TarjetaProxima(
                        carrera: c,
                        hoy: lectura.hoy,
                        esPrincipal: c.raceId == principalId,
                        conCoach: lectura.conCoach,
                        alAbrir: { alAbrir(c) },
                        alElegir: { alElegir($0, c) },
                        alAcciones: { alAcciones(c) }
                    )
                }
            }
            if plegable {
                BotonTextoDia(
                    abierto ? "Ver menos" : "Ver \(items.count - Self.visiblesPlegado) más",
                    expandido: abierto,
                    accion: { withAnimation(.easeOut(duration: 0.2)) { abierto.toggle() } },
                    icono: { EmptyView() },
                    derecha: { GiroDia(abierto: abierto) }
                )
                .tarjetaDia()
            }
        }
    }
}

// MARK: - Una tarjeta

private struct TarjetaProxima: View {
    let carrera: ProximaCarrera
    let hoy: String
    let esPrincipal: Bool
    let conCoach: Bool
    let alAbrir: () -> Void
    let alElegir: (AccionCarrera) -> Void
    let alAcciones: () -> Void

    private var donde: String {
        let cuando = carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy, conDia: true) } ?? "Fecha por confirmar"
        return [cuando, carrera.lugar].compactMap { $0 }.joined(separator: " · ")
    }

    private var etiquetaAccesible: String {
        let cuenta = carrera.diasHasta.map { $0 <= 0 ? "es hoy" : "faltan \($0) \(CuentaAtrasDia.unidad(dias: $0) ?? "días")" }
        return [
            carrera.prioridad.etiqueta,
            carrera.nombre,
            cuenta,
            donde,
            DecideCarreras.etiquetaEquipo(carrera.formato),
            DecideCarreras.lineaCategoria(carrera),
            carrera.metaS.flatMap(Formato.metaDeCarrera).map { "Objetivo \($0)" },
        ].compactMap { $0 }.joined(separator: ". ")
    }

    var body: some View {
        let categoria = DecideCarreras.lineaCategoria(carrera)
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        ZStack(alignment: .topTrailing) {
            Button {
                Haptics.light()
                alAbrir()
            } label: {
                HStack(alignment: .top, spacing: 14) {
                    CuentaProxima(dias: carrera.diasHasta)
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            if carrera.prioridad == .principal {
                                InfoPill(text: carrera.prioridad.etiqueta, estilo: .acento, glifo: .diana, tamGlifo: 14)
                            } else {
                                InfoPill(text: carrera.prioridad.etiqueta, estilo: .velo)
                            }
                            if let equipo {
                                InfoPill(text: equipo, estilo: .velo, glifo: .equipo)
                            }
                        }
                        SubtituloDia(carrera.nombre)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(donde).papel(.nota).foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        if let categoria {
                            Text(categoria).papel(.nota).foregroundStyle(Theme.Color.muted)
                        }
                        if let meta = carrera.metaS.flatMap(Formato.metaDeCarrera) {
                            HStack(spacing: 6) {
                                IconoDia(.cronometro, tam: 18).foregroundStyle(Theme.Color.accentText)
                                Text("Objetivo \(meta)").papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                // A la derecha queda el hueco del «⋯», que flota sobre la tarjeta (no la estira).
                .padding(EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: Theme.Size.toque + 4))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.985))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(etiquetaAccesible)
            .accessibilityHint("Abre el detalle")
            .accessibilityAddTraits(.isButton)

            Button {
                Haptics.light()
                alAcciones()
            } label: {
                IconoDia(.puntos, tam: 22, peso: .regular)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.92))
            .padding(.top, 3)
            .accessibilityLabel("Acciones de \(carrera.nombre)")
        }
        .tarjetaDia(realce: carrera.prioridad == .principal)
        .contextMenu {
            BotonesAccionesCarrera(esPrincipal: esPrincipal, conCoach: conCoach, elige: alElegir)
        }
    }
}

/// La cuenta de una tarjeta: los días en acento, «Hoy» el día de la carrera, y un calendario sin fecha.
private struct CuentaProxima: View {
    let dias: Int?

    var body: some View {
        Group {
            if let dias {
                VStack(alignment: .leading, spacing: 0) {
                    Text(CuentaAtrasDia.cifra(dias: dias))
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.accentText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if let unidad = CuentaAtrasDia.unidad(dias: dias) {
                        Text(unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                    }
                }
            } else {
                IconoDia(.calendario, tam: 28, peso: .regular).foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(width: 60, alignment: .leading)
        .padding(.top, 2)
    }
}

private struct EsqueletoTarjetaProxima: View {
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SkeletonBar(width: 48, height: 32, radius: 8)
                SkeletonBar(width: 36, height: 15, radius: 5)
            }
            .frame(width: 60, alignment: .leading)
            VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
                SkeletonBar(width: 128, height: 32, radius: 16)
                SkeletonBar(height: 19, radius: 6).frame(maxWidth: 210)
                SkeletonBar(height: 15, radius: 5).frame(maxWidth: 160)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, minHeight: 136, alignment: .topLeading)
        .tarjetaDia()
    }
}
