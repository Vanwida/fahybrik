import SwiftUI
import CoreLocation

// LAS PÁGINAS LATERALES (I6) — pocas y fijas: Vivo · Estructura · Mapa (solo
// con GPS). Espejo de `kit-iphone-vivo/paginas.tsx`.
//   VivoPaginaEstructura   la sesión del coach entera, con lo hecho contra su
//                          objetivo (las vueltas del motor) y dónde estás. Es la
//                          única lista larga del vivo y SÍ scrollea.
//   VivoPaginaMapa         la ruta (el mapa del sistema; la ruta se guarda en Salud).

enum VivoIdPagina: Int, CaseIterable { case vivo, estructura, mapa }

private struct VivoFilaVuelta: View {
    let v: Vivo.Vuelta
    var body: some View {
        let j = Vivo.juicioDe(v)
        let n = v.clase == .km ? "km \(v.n)" : v.tanda.map { "\($0)·\(v.n)" } ?? String(v.n)
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VivoEtiqueta(texto: n).frame(minWidth: 34, alignment: .leading)
            VivoNumeral(texto: Vivo.fmtReloj(v.segundos), cuerpo: VivoTokens.TI.datoTexto)
            if v.clase != .km, let m = v.metros, m != 1000 { VivoEtiqueta(texto: "\(Vivo.fmtRitmo(v.ritmo)) /km") }
            if let ppm = v.ppm { VivoEtiqueta(texto: "\(Int(ppm.rounded())) ppm") }
            Spacer(minLength: 0)
            if let j {
                Text(j.texto).font(.system(size: VivoTokens.TI.etiqueta, weight: j.fuera ? .bold : .semibold))
                    .foregroundStyle(j.fuera ? VivoColor.tinta : VivoColor.tinta2)
            }
        }
        .padding(.leading, 20).padding(.vertical, 4)
    }
}

/// LA ESTRUCTURA: cada bloque del coach en dos líneas (qué · contra qué), lo
/// hecho con sus vueltas y su veredicto, lo de ahora en tinta.
struct VivoPaginaEstructura: View {
    let estado: Vivo.EstadoVivo
    /// El host abre la hoja de bloques (saltar a otro bloque). nil = sin botón.
    var alVerBloques: (() -> Void)? = nil

    var body: some View {
        let filas = Vivo.estructuraDe(estado.pasos, i: estado.i)
        let series = estado.vueltas.filter { $0.clase != .km }
        // Las vueltas de cada bloque (las series, por orden), repartidas ANTES de pintar.
        var desde = 0
        let reparto: [[Vivo.Vuelta]] = filas.map { f in
            let cuenta = (f.trabajo.posicion?.serie ?? f.trabajo.posicion?.tramo) != nil && f.trabajo.fase == .principal
            let n = (f.estado == .pendiente || !cuenta) ? 0 : (f.veces ?? 1) * (f.tandas?.veces ?? 1)
            let propias = Array(series.dropFirst(desde).prefix(n))
            desde += n
            return propias
        }
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Estructura").font(.system(size: VivoTokens.TI.posicion, weight: .bold)).foregroundStyle(VivoColor.tinta)
                    Spacer(minLength: 0)
                    if let alVerBloques { BotonVerBloques(accion: alVerBloques) }
                }
                .padding(.bottom, 8)
                ForEach(Array(filas.enumerated()), id: \.offset) { k, f in
                    let t = Vivo.textoFila(f)
                    let ahora = f.estado == .ahora
                    let kms = f.trabajo.vueltaAutoM != nil ? estado.vueltas.filter { $0.clase == .km } : []
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(ahora ? VivoColor.tinta : f.estado == .hecho ? VivoColor.tinta2 : .clear)
                                .overlay(Circle().stroke(f.estado == .pendiente ? VivoColor.tinta2 : .clear, lineWidth: 1.5))
                                .frame(width: 9, height: 9)
                                .padding(.top, 7)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.linea).font(.system(size: VivoTokens.TI.cuerpo, weight: .semibold))
                                    .foregroundStyle(f.estado == .pendiente ? VivoColor.tinta2 : VivoColor.tinta)
                                if let d = t.detalle {
                                    Text(d).font(.system(size: VivoTokens.TI.etiqueta, weight: .semibold)).foregroundStyle(VivoColor.tinta2)
                                }
                            }
                        }
                        ForEach(Array((reparto[k] + kms).enumerated()), id: \.offset) { _, v in VivoFilaVuelta(v: v) }
                    }
                    .padding(.horizontal, 14).padding(.vertical, ahora ? 12 : 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ahora ? VivoColor.superficie : .clear, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.superficie, style: .continuous))
                }
            }
            .padding(.horizontal, VivoTokens.margen).padding(.top, 12).padding(.bottom, 24)
        }
    }
}

/// LA RUTA — el mapa del sistema, y dónde estás. La ruta se guarda en Salud.
struct VivoPaginaMapa: View {
    let coordenadas: [CLLocationCoordinate2D]
    let calidad: GPSSignalQuality
    let pausado: Bool
    let metros: Double?
    let ritmoMedio: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mapa").font(.system(size: VivoTokens.TI.posicion, weight: .bold)).foregroundStyle(VivoColor.tinta)
            ZStack(alignment: .bottomLeading) {
                RunRouteMapView(coordinates: coordenadas, quality: calidad, paused: pausado)
                    .clipShape(RoundedRectangle(cornerRadius: VivoTokens.Radio.superficie, style: .continuous))
                // Sobre el mapa del sistema: con fondo propio y por encima de su marca (abajo a la izquierda).
                HStack(spacing: 8) {
                    if let m = metros { let d = Vivo.fmtDistancia(m); VivoEtiqueta(texto: "\(d.valor) \(d.unidad)", tono: VivoColor.tinta) }
                    if let r = ritmoMedio { VivoEtiqueta(texto: "\(Vivo.fmtRitmo(r)) /km medio", tono: VivoColor.tinta) }
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(VivoColor.fondo.opacity(0.75), in: Capsule())
                .padding(.leading, 12).padding(.bottom, 36)
            }
            .frame(maxHeight: .infinity)
            VivoEtiqueta(texto: "la ruta se guarda en Salud · el mapa es el del sistema")
        }
        .padding(.horizontal, VivoTokens.margen).padding(.top, 12).padding(.bottom, 24)
    }
}
