import SwiftUI

// LA ESTRUCTURA DE UN CIRCUITO EN EL IPHONE — espejo de
// `screens/iphone-vivo-circuito/ruta.tsx`. La ruta del kit (`Vivo.rutaDe`, la
// misma que la Ruta de la muñeca) con sitio: cada tramo de carrera, estación y
// Roxzone en el orden en que se hace, agrupados por ronda cuando el coach
// escribió rondas; lo hecho con su parcial, lo de ahora con su crono en tinta,
// lo que viene con su dosis. Arriba, la Roxzone sumada (si la hay) o cuántas
// piezas van. Es la única lista larga del vivo y scrollea (I6): al abrirse, lo
// de ahora queda a la vista. Sustituye a la página Estructura del kit en esta familia.

struct VivoRutaCircuito: View {
    let estado: Vivo.EstadoVivo
    let formato: Vivo.FormatoCircuito
    /// El host abre la hoja de bloques (saltar a otro bloque). nil = sin botón.
    var alVerBloques: (() -> Void)? = nil

    private static let punto: CGFloat = 9
    private static let idAhora = "ahora"

    /// Las filas del segmento del circuito (el calentamiento y los otros bloques no puntúan aquí).
    private var filas: [Vivo.FilaRuta] {
        let seg = estado.paso.origen?.segmento
        let desde = estado.pasos.firstIndex { $0.origen?.segmento == seg } ?? 0
        let todas = Vivo.rutaDe(estado.pasos, i: estado.i, parciales: estado.parciales, terminado: estado.terminado,
                                Vivo.OpcionesRuta(desde: desde, cabecerasDeRonda: formato != .hyrox, sueltas: .pasadas))
        return todas.filter { f in
            if case let .paso(i, _, _, _, _) = f { return estado.pasos[i].origen?.segmento == seg }
            return true
        }
    }

    var body: some View {
        let filas = self.filas
        let listadas = filas.compactMap { f -> Vivo.EstadoRuta? in
            if case let .paso(_, _, e, _, suelta) = f, !suelta { return e }
            return nil
        }
        let hechas = listadas.filter { $0 == .hecho }.count
        let rox = Vivo.roxzoneDe(estado.pasos, i: estado.i, t: estado.lecturas.t, parciales: estado.parciales, terminado: estado.terminado)
        ScrollViewReader { lector in
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 4, pinnedViews: [.sectionHeaders]) {
                    Section {
                        ForEach(Array(filas.enumerated()), id: \.offset) { _, f in fila(f) }
                    } header: {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Estructura").font(.system(size: VivoTokens.TI.posicion, weight: .bold)).foregroundStyle(VivoColor.tinta)
                            Spacer(minLength: 0)
                            if let rox {
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    VivoEtiqueta(texto: Vivo.nombreClase(.roxzone))
                                    VivoNumeral(texto: Vivo.fmtReloj(rox), cuerpo: VivoTokens.TI.datoTexto)
                                }
                            } else {
                                VivoEtiqueta(texto: "\(hechas)/\(listadas.count) hechas")
                            }
                            if let alVerBloques { BotonVerBloques(accion: alVerBloques) }
                        }
                        .padding(.top, 12).padding(.bottom, 8)
                        .background(VivoColor.fondo)
                    }
                }
                .padding(.horizontal, VivoTokens.margen).padding(.bottom, 24)
            }
            .onAppear { lector.scrollTo(Self.idAhora, anchor: .center) }
        }
    }

    @ViewBuilder
    private func fila(_ f: Vivo.FilaRuta) -> some View {
        switch f {
        case let .ronda(n, de):
            VivoEtiqueta(texto: "Ronda \(n)/\(de)").padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 2)
        case let .paso(i, p, e, parcial, suelta):
            let ahora = e == .ahora
            let nombre = Vivo.nombreEnRuta(p, runsNumerados: formato == .hyrox)
            let valor = parcial.map { Vivo.fmtReloj($0.segundos) } ?? (ahora ? Vivo.fmtReloj(estado.lecturas.t) : nil)
            Group {
                if suelta {
                    // Lo que no está en la lista del coach: una línea menor, con su tiempo.
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VivoEtiqueta(texto: nombre, tono: ahora ? VivoColor.tinta : VivoColor.tinta2)
                        if let valor { VivoNumeral(texto: valor, cuerpo: VivoTokens.TI.etiqueta, tono: ahora ? VivoColor.tinta : VivoColor.tinta2) }
                    }
                    .padding(.leading, 14 + Self.punto + 10).padding(.vertical, 2)
                } else {
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(ahora ? VivoColor.tinta : e == .hecho ? VivoColor.tinta2 : .clear)
                            .overlay(Circle().stroke(e == .pendiente ? VivoColor.tinta2 : .clear, lineWidth: 1.5))
                            .frame(width: Self.punto, height: Self.punto)
                            .padding(.top, 7)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(nombre).font(.system(size: VivoTokens.TI.cuerpo, weight: .semibold))
                                .foregroundStyle(e == .pendiente ? VivoColor.tinta2 : VivoColor.tinta)
                            if let d = Vivo.detalleEnRuta(p, parcial: parcial, nombre: nombre) { VivoEtiqueta(texto: d) }
                        }
                        Spacer(minLength: 0)
                        if let valor { VivoNumeral(texto: valor, cuerpo: VivoTokens.TI.datoTexto, tono: ahora ? VivoColor.tinta : VivoColor.tinta2) }
                    }
                    .padding(.horizontal, 14).padding(.vertical, ahora ? 12 : 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ahora ? VivoColor.superficie : .clear, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.superficie, style: .continuous))
                }
            }
            .id(ahora ? Self.idAhora : "p\(i)")
        }
    }
}
