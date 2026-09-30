import SwiftUI

// LAS PIEZAS DEL FINAL — lo común a la pantalla de «Sesión completada», al RPE y al resumen de corredor.
//
// Se pintan con los tokens de la cara de correr (`MunecaTokens`): la misma paleta, la misma escala de tipo y el
// mismo suelo de 15 pt. Solo se decide aquí CÓMO se dibuja; qué se dice lo decide el núcleo (`Vivo+Completitud`,
// `Vivo+ResumenCorrer`).

enum FinalForma {
    /// El sello de «Sesión completada».
    static let sello: CGFloat = 40
    /// Lo que dura el sello en pantalla antes de pasar solo al RPE.
    static let selloSegundos: Double = 2.4
    /// Ancho de «Seguir» junto a «Guardar» y de «Saltar» junto a «Hecho».
    static let anchoSecundario: CGFloat = 80
    static let anchoPrimario: CGFloat = 98
    /// La cifra del RPE (0–10), en el centro de su pantalla.
    static let cifraRpe: CGFloat = 60
    static let cifraMinima: CGFloat = 36
    /// La escala del RPE: once marcas, su alto y el aire entre ellas.
    static let marcasRpe = 11
    static let altoEscala: CGFloat = 8
    static let huecoEscala: CGFloat = 3
    static let radioMarca: CGFloat = 3
    static let aireEscala: CGFloat = 10
    /// El recorrido del contador de muescas de la corona (solo cuenta muescas, no es un valor).
    static let recorridoCorona: Double = 1000
    /// El alto de una fila de dato del resumen.
    static let altoDato: CGFloat = 30
    /// El héroe del resumen: cuánto crece sobre el segundo (30 pt) el «5 de 6» o los km.
    static let escalaHeroe: Double = 1.6
    /// Una fila de zona del pulso: el rótulo, la barra y el tiempo.
    static let anchoZona: CGFloat = 26
    static let altoBarraZona: CGFloat = 8
    static let anchoTiempoZona: CGFloat = 44
    /// Cada cuánto se relee dónde está lo guardado (el acuse del móvil llega solo).
    static let releerGuardadoS: TimeInterval = 2
    static let glifoGuardado: CGFloat = 28
}

/// El sello: un visto en un aro, en tinta.
struct FinalSello: View {
    var body: some View {
        Image(systemName: "checkmark.circle")
            .font(.system(size: FinalForma.sello, weight: .light))
            .foregroundStyle(MunecaPaleta.tinta)
            .accessibilityHidden(true)
    }
}

/// Una línea de 15 pt: la de «Completa · 6 de 6 series» (tinta) o la del motivo (tinta2).
struct FinalNota: View {
    let texto: String
    var tono: Color = MunecaPaleta.tinta2

    var body: some View {
        Text(texto)
            .font(MunecaTipo.nota)
            .foregroundStyle(tono)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Un dato del resumen: «11,62 km», «3:48 /km en las series».
struct FinalDato: View {
    let dato: Vivo.DatoResumen

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(dato.valor)
                .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, MunecaTipo.pesoDato))
                .foregroundStyle(MunecaPaleta.tinta)
            if let unidad = dato.unidad {
                Text(unidad).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.tercero))
        .frame(height: FinalForma.altoDato)
        .accessibilityElement(children: .combine)
    }
}

/// Dos botones en fila: el secundario a la izquierda (superficie) y el primario a la derecha (la acción del momento).
struct FinalBotones: View {
    let secundario: String
    let primario: String
    let alSecundario: () -> Void
    let alPrimario: () -> Void

    var body: some View {
        HStack(spacing: MunecaForma.huecoBotones) {
            MunecaBoton(titulo: secundario, variante: .superficie, accion: alSecundario)
                .frame(maxWidth: FinalForma.anchoSecundario)
            MunecaBoton(titulo: primario, accion: alPrimario)
                .frame(maxWidth: FinalForma.anchoPrimario)
                .layoutPriority(1)
        }
        .padding(.horizontal, 4)
        .frame(height: MunecaForma.altoBoton)
    }
}
