#if DEBUG
import SwiftUI

// LAS `#Preview` DE «CARRERAS» — cada estado del doble, montado como lo monta la pestaña.
//
// Los veinte casos de la pestaña (con la lectura de ejemplo de `CasosCarreras`, sin red ni store) y los
// estados de cada hoja (importar, buscar, fijar, el tiempo objetivo). Cada uno en claro y en oscuro a la
// vez (`EnAmbasDia`) y, los que más dependen del acento, también con el de un club azul: un componente
// que lleva el naranja clavado solo se ve mal cuando un coach elige otro color.

/// La pestaña como se ve: el cromo fijo y el cuerpo, con el caso de ejemplo `id`.
struct PestanaDeEjemplo: View {
    let id: String

    var body: some View {
        let l = CasosCarreras.caso(id).lectura
        VStack(spacing: 0) {
            CromoCarreras(conCoach: l.conCoach, noLeidos: l.noLeidosChat, alChat: {})
            CarrerasContenido(lectura: l)
        }
    }
}

// MARK: - La pestaña, caso a caso

#Preview("① Lleno") { EnAmbasDia { PestanaDeEjemplo(id: "lleno") } }
#Preview("① Lleno · club azul") { EnAmbasDia(club: .pruebaAzul) { PestanaDeEjemplo(id: "lleno") } }
#Preview("② Solo objetivo") { EnAmbasDia { PestanaDeEjemplo(id: "solo-objetivo") } }
#Preview("③ Solo historial") { EnAmbasDia { PestanaDeEjemplo(id: "solo-historial") } }
#Preview("④ Vacío") { EnAmbasDia { PestanaDeEjemplo(id: "vacio") } }
#Preview("④ Vacío · club azul") { EnAmbasDia(club: .pruebaAzul) { PestanaDeEjemplo(id: "vacio") } }
#Preview("⑤ Dobles y relevos") { EnAmbasDia { PestanaDeEjemplo(id: "dobles") } }
#Preview("⑥ Predicho parcial") { EnAmbasDia { PestanaDeEjemplo(id: "parcial") } }
#Preview("⑦ Hoy es la carrera") { EnAmbasDia { PestanaDeEjemplo(id: "dia-de-carrera") } }
#Preview("⑧ Corriste ayer") { EnAmbasDia { PestanaDeEjemplo(id: "ayer") } }
#Preview("⑨ Muchos objetivos") { EnAmbasDia { PestanaDeEjemplo(id: "varios") } }
#Preview("⑩ Sin coach") { EnAmbasDia { PestanaDeEjemplo(id: "sin-coach") } }
#Preview("⑪ En frío") { EnAmbasDia { PestanaDeEjemplo(id: "cargando") } }
#Preview("⑫ Error de carga") { EnAmbasDia { PestanaDeEjemplo(id: "error") } }
#Preview("⑭ «No soy yo»") { EnAmbasDia { PestanaDeEjemplo(id: "no-soy-yo") } }
#Preview("⑮ Dobles sin pareja") { EnAmbasDia { PestanaDeEjemplo(id: "sin-pareja") } }
#Preview("⑯ Informe y estaciones") { EnAmbasDia { PestanaDeEjemplo(id: "informe") } }
#Preview("⑰ El análisis llega") { EnAmbasDia { PestanaDeEjemplo(id: "llegando") } }
#Preview("⑱ Fallos locales") { EnAmbasDia { PestanaDeEjemplo(id: "fallos") } }
#Preview("⑲ Sin principal") { EnAmbasDia { PestanaDeEjemplo(id: "sin-principal") } }
#Preview("⑳ No es HYROX") { EnAmbasDia { PestanaDeEjemplo(id: "no-hyrox") } }

// MARK: - Las hojas

private struct HojaDeEjemplo<Contenido: View>: View {
    let contenido: Contenido

    /// El acento de club vive en un almacén global: se fija al montar, así que solo puede haber uno por preview.
    init(club: ClubTheme? = nil, @ViewBuilder contenido: () -> Contenido) {
        ClubThemeStore.update(club)
        self.contenido = contenido()
    }

    var body: some View {
        // Las hojas son de alto de pantalla: se ven una en claro y otra en oscuro, cada una a su alto.
        VStack(spacing: 0) {
            ForEach([ColorScheme.light, .dark], id: \.self) { esquema in
                contenido
                    .frame(height: 780)
                    .environment(\.colorScheme, esquema)
            }
        }
    }
}

#Preview("Importar · reposo") { HojaDeEjemplo { ImportRaceSheet(vista: .reposo) } }
#Preview("Importar · buscando") { HojaDeEjemplo { ImportRaceSheet(vista: .buscando) } }
#Preview("Importar · candidatos") { HojaDeEjemplo { ImportRaceSheet(vista: .candidatos) } }
#Preview("Importar · sin resultados") { HojaDeEjemplo { ImportRaceSheet(vista: .sinResultados) } }
#Preview("Importar · error de búsqueda") { HojaDeEjemplo { ImportRaceSheet(vista: .errorDeBusqueda) } }
#Preview("Importar · ¿Eres tú?") { HojaDeEjemplo { ImportRaceSheet(vista: .confirmar) } }
#Preview("Importar · ¿Eres tú? · club azul") { HojaDeEjemplo(club: .pruebaAzul) { ImportRaceSheet(vista: .confirmar) } }
#Preview("Importar · importando") { HojaDeEjemplo { ImportRaceSheet(vista: .importando) } }
#Preview("Importar · error al importar") { HojaDeEjemplo { ImportRaceSheet(vista: .errorAlImportar) } }
#Preview("Importar · enlace") { HojaDeEjemplo { ImportRaceSheet(vista: .enlaceVacio) } }
#Preview("Importar · enlace que no es de HYROX") { HojaDeEjemplo { ImportRaceSheet(vista: .enlaceMalo) } }
#Preview("Importar · enlace importando") { HojaDeEjemplo { ImportRaceSheet(vista: .enlaceImportando) } }
#Preview("Importar · enlace con error") { HojaDeEjemplo { ImportRaceSheet(vista: .enlaceConError) } }

#Preview("Buscar · calendario") { HojaDeEjemplo { BuscarCarreraSheet(vista: .lista) } }
#Preview("Buscar · calendario · club azul") { HojaDeEjemplo(club: .pruebaAzul) { BuscarCarreraSheet(vista: .lista) } }
#Preview("Buscar · cargando") { HojaDeEjemplo { BuscarCarreraSheet(vista: .cargando) } }
#Preview("Buscar · error") { HojaDeEjemplo { BuscarCarreraSheet(vista: .error) } }
#Preview("Buscar · sin carreras") { HojaDeEjemplo { BuscarCarreraSheet(vista: .sinCarreras) } }

private let avisoSecundaria = "«HYROX Barcelona» pasará a ser secundaria. Un solo objetivo principal a la vez."

#Preview("Fijar · híbrida") {
    HojaDeEjemplo { FijarObjetivoView(event: CasosCarreras.evento("HYROX Girona"), bearer: nil, pasaASecundaria: avisoSecundaria, onTargetSet: {}) }
}
#Preview("Fijar · híbrida · club azul") {
    HojaDeEjemplo(club: .pruebaAzul) { FijarObjetivoView(event: CasosCarreras.evento("HYROX Girona"), bearer: nil, onTargetSet: {}) }
}
#Preview("Fijar · sin fecha confirmada") {
    HojaDeEjemplo { FijarObjetivoView(event: CasosCarreras.evento("HYROX Valencia"), bearer: nil, onTargetSet: {}) }
}
#Preview("Fijar · running") {
    HojaDeEjemplo { FijarObjetivoView(event: CasosCarreras.evento("Mitja Marató de Barcelona"), bearer: nil, pasaASecundaria: avisoSecundaria, onTargetSet: {}) }
}
#Preview("Fijar · CrossFit") {
    HojaDeEjemplo { FijarObjetivoView(event: CasosCarreras.evento("CrossFit Open Iberia"), bearer: nil, onTargetSet: {}) }
}

#Preview("Tiempo objetivo · un peldaño") {
    HojaDeEjemplo { FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39, meta: 3600), bearer: nil, onSaved: {}) }
}
#Preview("Tiempo objetivo · tiempo exacto") {
    HojaDeEjemplo { FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39, meta: 4080), bearer: nil, onSaved: {}) }
}
#Preview("Tiempo objetivo · sin meta") {
    HojaDeEjemplo { FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39), bearer: nil, onSaved: {}) }
}
#Preview("Tiempo objetivo · no es HYROX") {
    HojaDeEjemplo { FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(341, "Mitja Marató de Barcelona", dias: 141, tipo: "other", meta: 5940), bearer: nil, onSaved: {}) }
}
#endif
