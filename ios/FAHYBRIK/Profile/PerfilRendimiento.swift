import SwiftUI

// RENDIMIENTO — lo que dice quién eres en cifras. Cinco teselas (tres sin coach) de dos en dos: la
// impar, la última, ocupa el ancho. Espejo de `rendimiento.tsx`.
//
// La FORMA de cada tesela la fija su posición y no su estado, así que el esqueleto tiene la forma
// final y nada salta al llegar el dato. Las reglas que gobiernan cada una (CONTRATO-UI §4, §6.2 bis,
// §7) las resuelve `RendimientoEstados` y aquí solo se pintan:
//  · un CONTADOR se pinta también en cero («0 de 4 calibrados» es información y es cuando más falta
//    hace); un VALOR MEDIDO no existe hasta que se mide, y ahí va la invitación con el verbo que lo
//    llena, no un guion;
//  · el dato pesa más que su etiqueta (32 contra 15) y el COLOR de estado no va en la cifra: la tesela
//    que pide un acto se tiñe de la marca, la cifra no;
//  · «sin ancla no hay zonas»: ninguna cifra por defecto, y un umbral estimado escribe siempre de
//    dónde sale;
//  · una fuente que falló dice que falló y ofrece reintentar: no se queda en esqueleto para siempre;
//  · sin red no son cinco teselas de error: es UNA frase con su salida.

struct RendimientoPerfilSeccion: View {
    let lectura: LecturaPerfil
    let alAbrir: (FilaRendimiento.Clave) -> Void
    /// Vuelve a pedir SOLO esa fuente.
    let alReintentarFuente: (FilaRendimiento.Clave) -> Void
    /// Vuelve a pedirlas todas.
    let alReintentarTodo: () -> Void

    var body: some View {
        let filas = RendimientoEstados.filas(lectura)
        let impar = filas.count % 2 == 1
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Rendimiento") {
                if let linea = RendimientoEstados.linea(filas) { InfoPill(text: linea, estilo: .velo) }
            }
            if RendimientoEstados.sinRespuesta(filas) {
                SinCifrasPerfil(errorDeIdentidad: lectura.errorCarga, alReintentar: alReintentarTodo)
            } else {
                VStack(spacing: Theme.Spacing.m) {
                    ForEach(Array(stride(from: 0, to: filas.count, by: 2)), id: \.self) { i in
                        let pareja = Array(filas[i..<min(i + 2, filas.count)])
                        TeselasDia {
                            ForEach(pareja) { fila in
                                TeselaDeRendimientoPerfil(
                                    fila: fila,
                                    ancha: impar && fila.id == filas.last?.id,
                                    alAbrir: { alAbrir(fila.clave) },
                                    alReintentar: { alReintentarFuente(fila.clave) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Una tesela

private struct TeselaDeRendimientoPerfil: View {
    let fila: FilaRendimiento
    /// La impar de la última fila, que ocupa el ancho.
    let ancha: Bool
    let alAbrir: () -> Void
    let alReintentar: () -> Void

    /// Dos líneas de pie (15 pt × 1,3): la altura que se reserva para que las cifras de dos teselas
    /// contiguas caigan a la misma altura. Escala con el texto del sistema.
    @ScaledMetric(relativeTo: .subheadline) private var dosLineasDePie: CGFloat = 39

    /// Alto mínimo de una tesela de media columna: cabe el peor caso (tres líneas de invitación y su
    /// verbo). La ancha, con menos que decir, es más baja.
    private var altoMinimo: CGFloat { ancha ? 132 : 160 }

    var body: some View {
        switch fila.estado {
        case .cargando: esqueleto
        case .sinRespuesta: sinRespuesta
        case let .valor(cifra, sufijo, pie): valor(cifra: cifra, sufijo: sufijo, pie: pie)
        case let .vacio(invitacion): vacio(invitacion)
        }
    }

    // MARK: Con cifra

    private func valor(cifra: String, sufijo: String?, pie: String?) -> some View {
        // La que pide un acto se tiñe de la marca: el texto de apoyo pasa a la tinta del tema.
        let apoyo = fila.pideActo ? Theme.Color.foreground : Theme.Color.muted
        return TeselaDia(
            rotulo: fila.etiqueta,
            realce: fila.pideActo,
            altoMinimo: altoMinimo,
            etiqueta: fila.etiquetaAccesible,
            alTocar: alAbrir
        ) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(cifra).papel(.dato).foregroundStyle(Theme.Color.foreground)
                    if let sufijo { Text(sufijo).papel(.cuerpo).foregroundStyle(apoyo) }
                }
                if let avance = fila.avance { RegletaDia(n: avance.n, de: avance.de) }
            }
            if let pie {
                Text(pie)
                    .papel(.nota)
                    .foregroundStyle(apoyo)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: ancha ? nil : dosLineasDePie, alignment: .topLeading)
            }
        }
    }

    // MARK: Vacío: la invitación, con su salida

    private func vacio(_ invitacion: String) -> some View {
        TeselaDia(
            rotulo: fila.etiqueta,
            altoMinimo: altoMinimo,
            etiqueta: fila.etiquetaAccesible,
            alTocar: alAbrir
        ) {
            Text(invitacion)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let salida = fila.salida {
                HStack(spacing: 4) {
                    Text(salida).papel(.rotulo)
                    IconoDia(.chevron, tam: 16)
                }
                .foregroundStyle(Theme.Color.accentText)
            } else {
                Color.clear.frame(height: 0)
            }
        }
    }

    // MARK: En frío: esqueleto con la MISMA forma

    private var esqueleto: some View {
        let contador = fila.avance != nil || fila.clave == .tests || fila.clave == .marcas
        return TeselaDia(
            altoMinimo: altoMinimo,
            etiqueta: "\(fila.etiqueta), cargando",
            cabecera: { SkeletonBar(width: 96, height: 15, radius: 5).padding(.top, 3) },
            contenido: {
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonBar(width: 84, height: 34, radius: 9)
                    if contador { SkeletonBar(height: 6, radius: 3) }
                }
                SkeletonBar(height: 15, radius: 5).frame(maxWidth: 110)
            }
        )
    }

    // MARK: La fuente falló

    private var sinRespuesta: some View {
        TeselaDia(
            altoMinimo: altoMinimo,
            etiqueta: fila.etiquetaAccesible,
            alTocar: alReintentar,
            cabecera: { CabeceraTeselaDia(rotulo: fila.etiqueta, conChevron: false) },
            contenido: {
                Text("No pudimos cargarlo")
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                HStack(spacing: 6) {
                    IconoDia(.reintentar, tam: 18)
                    Text("Reintentar").papel(.rotulo)
                }
                .foregroundStyle(Theme.Color.accentText)
            }
        )
    }
}

extension FilaRendimiento {
    /// Lo que dice el lector de pantalla: etiqueta, dato y, si lo hay, qué se puede hacer.
    var etiquetaAccesible: String {
        switch estado {
        case .cargando:
            return "\(etiqueta), cargando"
        case .sinRespuesta:
            return "\(etiqueta), no pudimos cargarlo. Reintentar"
        case let .valor(cifra, sufijo, pie):
            let dato = [cifra, sufijo].compactMap { $0 }.joined(separator: " ")
            return "\(etiqueta): \(dato)" + (pie.map { ", \($0)" } ?? "")
        case let .vacio(invitacion):
            return "\(etiqueta), sin dato. \(invitacion)" + (salida.map { ". \($0)" } ?? "")
        }
    }
}

// MARK: - Sin red

/// Ninguna fuente contestó: no son cinco teselas de error sino una frase que dice por qué y dónde está
/// la salida. Si es la identidad la que cayó (las zonas viajan dentro de ella), la salida es el sujeto
/// de arriba; si no, un «Reintentar» aquí mismo, porque una frase sin salida es un callejón (§5).
private struct SinCifrasPerfil: View {
    let errorDeIdentidad: Bool
    let alReintentar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("No pudimos cargar tus cifras")
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            Text(errorDeIdentidad ? "Se cargan junto con tu perfil: reintenta arriba." : "Vuelve a intentarlo en un momento.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if !errorDeIdentidad {
                Button {
                    Haptics.light()
                    alReintentar()
                } label: {
                    HStack(spacing: 6) {
                        IconoDia(.reintentar, tam: 18)
                        Text("Reintentar").papel(.rotulo)
                    }
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(minHeight: Theme.Size.toque, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
        }
        .padding(EdgeInsets(top: 18, leading: 16, bottom: errorDeIdentidad ? 18 : 6, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaPerfil()
        .accessibilityElement(children: errorDeIdentidad ? .combine : .contain)
    }
}
