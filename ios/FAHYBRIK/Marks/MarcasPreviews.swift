#if DEBUG
import SwiftUI

// LAS PREVIEWS DE «TUS MARCAS»: un caso por estado, en claro y en oscuro, con el acento de fábrica y con un club
// azul (un componente que lleva el naranja clavado solo se ve mal cuando un coach elige otro color).

// MARK: - Previews

struct MarcasBibliotecaEscena: View {
    let estado: EstadoDeBiblioteca
    let marcas: [MarkView]

    var body: some View {
        NavigationStack {
            FillingScreen {
                MarcasBibliotecaCuerpo(
                    estado: estado, grupos: GrupoDeMarcas.desde(marcas, ahora: EjemplosDeMarcas.ahora),
                    bearer: nil, alReintentar: {}
                )
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Tus marcas")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct MarcaDetalleEscena: View {
    let marca: MarkView?
    var estado: EstadoDeMarca = .datos
    var nueva: MarcaNueva? = nil
    var aviso: AvisoDeMarca? = nil

    var body: some View {
        NavigationStack {
            MarcaDetallePantalla(
                estado: estado,
                lectura: marca.map { LecturaDeMarca.desde($0, ahora: EjemplosDeMarcas.ahora) },
                nueva: nueva, aviso: aviso,
                alReintentar: {}, alRetirar: { _ in }, alVolver: {}, alActuar: {}
            )
            .navigationTitle(marca?.label ?? "")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview("Biblioteca · veterano") { MarcasBibliotecaEscena(estado: .datos, marcas: EjemplosDeMarcas.veterano) }
#Preview("Biblioteca · alta · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    MarcasBibliotecaEscena(estado: .datos, marcas: EjemplosDeMarcas.catalogo(conRecord: 0))
}
#Preview("Biblioteca · cargando") { MarcasBibliotecaEscena(estado: .cargando, marcas: []) }
#Preview("Biblioteca · error") { MarcasBibliotecaEscena(estado: .error, marcas: []) }
#Preview("Biblioteca · sin catálogo") { MarcasBibliotecaEscena(estado: .vacio, marcas: []) }

#Preview("Detalle · 5K completo") { MarcaDetalleEscena(marca: EjemplosDeMarcas.cincoK) }
#Preview("Detalle · marca nueva · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    MarcaDetalleEscena(
        marca: EjemplosDeMarcas.remo500,
        nueva: MarcaNueva(cifra: "1:49", delta: "−5 s", esRecord: true)
    )
}
#Preview("Detalle · sin marca") { MarcaDetalleEscena(marca: EjemplosDeMarcas.diezKSinMarca) }
#Preview("Detalle · carrera sin tiempo") { MarcaDetalleEscena(marca: EjemplosDeMarcas.mediaSinTiempo) }
#Preview("Detalle · cargando") { MarcaDetalleEscena(marca: nil, estado: .cargando) }
#Preview("Detalle · error") { MarcaDetalleEscena(marca: nil, estado: .error) }
#Preview("Detalle · ya no está") { MarcaDetalleEscena(marca: nil, estado: .noExiste) }

#endif
