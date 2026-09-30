import SwiftUI

// EJERCICIOS — la hoja del coach agrupada por ejercicio (corona ↓ desde la serie). Lo hecho
// apagado, el bloque en curso abierto serie a serie con lo anotado (✓ declarado, aro sin
// confirmar, «ahora», y lo que viene con su carga), y lo que falta con su dosis. Espejo de
// `screens/reloj-fuerza/paginas.tsx#PaginaEjercicios`. Qué líneas hay y en qué orden lo decide
// `Vivo.paginaEjercicios`; esto solo las dibuja.

struct MunecaEjercicios: View {
    let pagina: Vivo.PaginaEjerciciosMuneca

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        MunecaColumna(alineacion: .leading) {
            MunecaContexto(partes: pagina.titulo, medidas: medidas)
                .frame(maxWidth: .infinity, alignment: .center)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(pagina.lineas.enumerated()), id: \.offset) { _, l in
                    switch l {
                    case let .ejercicio(slot, nombre, sinConfirmar, estado, _): ejercicio(slot, nombre, sinConfirmar, estado)
                    case let .serie(n, texto, marca, _): serie(n, texto, marca)
                    }
                }
            }
        }
        .padding(.leading, MunecaForma.sangriaEjercicios)
        .padding(.trailing, MunecaForma.aireDerechaVueltas)
    }

    private func ejercicio(_ slot: String?, _ nombre: String, _ sinConfirmar: Bool, _ estado: Vivo.EstadoEjercicio) -> some View {
        HStack(spacing: 7) {
            Circle()
                .fill(estado == .ahora ? MunecaPaleta.tinta : estado == .hecho ? MunecaPaleta.tinta2 : Color.clear)
                .overlay(Circle().stroke(MunecaPaleta.tinta2, lineWidth: estado == .pendiente ? MunecaForma.contornoMarca : 0))
                .frame(width: MunecaForma.puntoEjercicio, height: MunecaForma.puntoEjercicio)
            if let slot { Text(slot).font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto)).foregroundStyle(MunecaPaleta.tinta2).fixedSize() }
            Text(nombre)
                .font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto))
                .foregroundStyle(estado == .ahora ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
            if sinConfirmar { MunecaMarca(hecha: false) }
        }
        .frame(height: CGFloat(Vivo.AltoEjercicios.ejercicio))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(slot ?? "") \(nombre), \(estado == .hecho ? "hecho" : estado == .ahora ? "ahora" : "por venir")")
    }

    private func serie(_ n: Int?, _ texto: String, _ marca: Vivo.MarcaSerie) -> some View {
        HStack(spacing: 8) {
            if let n {
                Text(String(n)).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2).frame(width: MunecaForma.anchoNumeroSerie, alignment: .leading)
            }
            Text(texto)
                .font(MunecaTipo.fuente(Vivo.TipoMuneca.nota, marca == .ahora ? 600 : Vivo.TipoMuneca.pesoNota))
                .foregroundStyle(marca == .hecha || marca == .ahora ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                .opacity(marca == .luego ? MunecaForma.opacidadLuego : 1)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
            switch marca {
            case .ahora: Text("ahora").font(MunecaTipo.notaSemibold).foregroundStyle(MunecaPaleta.tinta)
            case .propuesta: MunecaMarca(hecha: false)
            case .hecha: MunecaMarca(hecha: true)
            case .luego: EmptyView()
            }
        }
        .padding(.leading, MunecaForma.sangriaSerie)
        .frame(height: CGFloat(Vivo.AltoEjercicios.serie))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(n.map { "serie \($0), " } ?? "")\(texto)\(marca == .ahora ? ", ahora" : marca == .propuesta ? ", sin confirmar" : "")")
    }
}
