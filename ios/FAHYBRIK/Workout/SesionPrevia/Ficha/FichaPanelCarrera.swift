import SwiftUI

// LOS PANELES DE CARRERA Y ERGO — por tramos (intervalos) y continuo (un rodaje, una tirada).
//
// Unas series de pista no son una lista: son una FORMA («seis veces fuerte, trote en medio»). La tarjeta enseña la
// dosis grande, el perfil de barras (el trabajo alto, la recuperación baja y atenuada, algo más alta si se trota) y los
// pares «Ritmo · Zona · Recuperas/Descansas». Un rodaje es lo contrario: una sola cosa, enorme, con la zona o el
// ritmo al lado. Sin estructura de tramos, un movimiento de intervalos se lee como la tarjeta de siempre.

struct FichaPanelIntervalos: View {
    let movimientos: [MovimientoFicha]
    let alAbrirTecnica: (WorkoutItem) -> Void

    /// Los movimientos en orden, agrupando los que van seguidos y no tienen perfil: esos van juntos, en filas.
    private var tandas: [[MovimientoFicha]] {
        movimientos.reduce(into: []) { tandas, m in
            if m.perfil == nil, let ultima = tandas.last, ultima.last?.perfil == nil {
                tandas[tandas.count - 1].append(m)
            } else {
                tandas.append([m])
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            ForEach(tandas, id: \.first?.id) { tanda in
                if let movimiento = tanda.first, let perfil = movimiento.perfil {
                    FichaTarjetaDeTramos(movimiento: movimiento, perfil: perfil, alAbrirTecnica: alAbrirTecnica)
                } else if movimientos.count == 1, let unico = tanda.first {
                    FichaTarjetaDeEjercicio(movimiento: unico, alAbrirTecnica: alAbrirTecnica)
                } else {
                    FichaLista(movimientos: tanda, alAbrirTecnica: alAbrirTecnica)
                }
            }
        }
    }
}

// MARK: - Unas series

private struct FichaTarjetaDeTramos: View {
    let movimiento: MovimientoFicha
    let perfil: MovimientoFicha.Perfil
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                FichaNombreConPunto(movimiento: movimiento)
                if let principal = movimiento.columna.principal {
                    Text(principal)
                        .papel(.dato, tamano: FichaMedidas.tamanoDeLaDosisDeSeries)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                FichaPerfilDeTramos(perfil: perfil, alto: FichaMedidas.altoDelPerfil)
                datos
            }
            .padding(FichaMedidas.rellenoDeTarjetaGrande)
            .tarjetaDia(alAncho: true)
        }
    }

    /// «Ritmo 4:10/km · Recuperas 1:30 suave»: pares de un vistazo, no una frase.
    private var datos: some View {
        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: Theme.Spacing.l, verticalSpacing: Theme.Spacing.s) {
            ForEach(perfil.datos, id: \.etiqueta) { dato in
                GridRow {
                    Text(dato.etiqueta).papel(.nota).foregroundStyle(Theme.Color.muted)
                    Text(dato.valor)
                        .papel(.cuerpoFuerte)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .gridColumnAlignment(.leading)
                }
            }
        }
    }
}

/// La forma de lo que el coach dictó: una barra por tramo, la recuperación baja y atenuada. No es un gráfico de datos
/// (antes de correr no hay ritmos medidos). El color acompaña, no es lo único: el perfil lo cuenta también por escrito.
struct FichaPerfilDeTramos: View {
    let perfil: MovimientoFicha.Perfil
    var alto: CGFloat

    private static let radioDeBarra: CGFloat = 3
    /// Con muchas series las barras se aprietan para que el dibujo quepa a lo ancho.
    private static let muchasBarras = 20
    private static let aireEntreBarras: CGFloat = 3
    private static let aireEntreMuchasBarras: CGFloat = 2
    private static let opacidadDeLaRecuperacion = 0.5

    var body: some View {
        let barras = perfil.barras
        HStack(alignment: .bottom, spacing: barras.count > Self.muchasBarras ? Self.aireEntreMuchasBarras : Self.aireEntreBarras) {
            ForEach(Array(barras.enumerated()), id: \.offset) { _, barra in
                RoundedRectangle(cornerRadius: Self.radioDeBarra, style: .continuous)
                    .fill(color(de: barra))
                    .frame(maxWidth: .infinity)
                    .frame(height: alto * barra.alto)
                    .opacity(barra.esRecuperacion ? Self.opacidadDeLaRecuperacion : 1)
            }
        }
        .frame(height: alto, alignment: .bottom)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(perfil.descripcion)
    }

    /// El trabajo, del color de su zona; sin zona, el acento del club. La recuperación sin zona, el gris de lo secundario.
    private func color(de barra: MovimientoFicha.Perfil.Barra) -> SwiftUI.Color {
        if let zona = barra.zona { return zona.color }
        return barra.esRecuperacion ? Theme.Color.faint : Theme.Color.accent
    }
}

// MARK: - Un rodaje

struct FichaPanelContinuo: View {
    let movimientos: [MovimientoFicha]
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            ForEach(movimientos) { movimiento in
                FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: 0) {
                    tarjeta(movimiento)
                }
            }
        }
    }

    private func tarjeta(_ m: MovimientoFicha) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            FichaNombreConPunto(movimiento: m)
            if let principal = m.columna.principal {
                Text(principal)
                    .papel(.dato, tamano: FichaMedidas.tamanoDeLaDosisContinua)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if m.zona != nil || m.contra != nil {
                HStack(spacing: Theme.Spacing.s) {
                    if let zona = m.zona { PastillaZonaPrevia(zona: zona) }
                    if let contra = m.contra {
                        Text(contra)
                            .papel(.cifra)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(FichaMedidas.rellenoDeTarjetaGrande)
        .tarjetaDia(alAncho: true)
    }
}
