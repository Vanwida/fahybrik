import SwiftUI

// LAS PIEZAS PEQUEÑAS de «Carreras» — lo que el kit del día (`Theme/Dia`) todavía no trae y esta
// pestaña necesita más de una vez. Espejo de `screens/carreras-rehecho/piezas.tsx` y `resumen.tsx`.
//
// Son genéricas a propósito: el orquestador decide si suben al kit (tarjeta plana, pastilla con
// glifo, botón de texto, campo, botón primario de hoja). Hasta entonces viven aquí y NO se copian
// en otra pestaña. Nada baja de 15 pt ni de 44 pt de toque; todo color sale de `Theme.Color`.

// MARK: - Chips y cintas

/// Una cinta con un dato dentro. A diferencia de una pastilla (una sola línea), esta puede partirse
/// en dos: a 390 pt un «2:34 más rápido que tu anterior» no cabe en una línea sobre la foto y no se
/// recorta ni se sale.
struct CintaCarreras<Icono: View, Contenido: View>: View {
    var sobreFoto: Bool
    let icono: Icono
    let contenido: Contenido

    init(sobreFoto: Bool = false, @ViewBuilder icono: () -> Icono, @ViewBuilder contenido: () -> Contenido) {
        self.sobreFoto = sobreFoto
        self.icono = icono()
        self.contenido = contenido()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            icono.padding(.top, 2)
            contenido
        }
        .papel(.rotulo)
        .foregroundStyle(Theme.Color.foreground)
        .multilineTextAlignment(.leading)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 6)
        .frame(minHeight: 32, alignment: .leading)
        .background(sobreFoto ? Theme.Color.background.opacity(0.62) : Theme.Color.foreground.opacity(0.08), in: forma)
        .overlay {
            if sobreFoto { forma.strokeBorder(Theme.Color.foreground.opacity(0.26), lineWidth: 1) }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// «2:34 más rápido que tu anterior». El color va en la MARCA, la cifra en tinta. Sin delta no existe.
struct PildoraDelta: View {
    let deltaS: Int?
    var sobreFoto = false

    var body: some View {
        if let deltaS {
            if deltaS == 0 {
                CintaCarreras(sobreFoto: sobreFoto, icono: { EmptyView() }) { Text("Igual que tu anterior") }
            } else {
                let mejor = deltaS < 0
                CintaCarreras(sobreFoto: sobreFoto, icono: {
                    IconoDia(mejor ? .baja : .sube, tam: 16, peso: .bold)
                        .foregroundStyle(mejor ? Theme.Color.ok : Theme.Color.warning)
                }) {
                    Text("\(Formato.clock(abs(deltaS))) \(mejor ? "más rápido" : "más lento") que tu anterior")
                }
            }
        }
    }
}

/// «Puesto 412 de 1180 · top 35 %».
struct PildoraPuesto: View {
    let texto: String?
    var sobreFoto = false

    var body: some View {
        if let texto {
            CintaCarreras(sobreFoto: sobreFoto, icono: { IconoDia(.bandera, tam: 16) }) { Text(texto) }
        }
    }
}

/// Carrera · Estaciones · RoxZone. Solo los que existen; si no hay ninguno, la fila entera no existe
/// (no tres huecos). Con el texto del sistema muy grande pasa a una columna.
struct ParcialesCarrera: View {
    let resumen: ResumenCarrera
    var sobreFoto = false

    private var filas: [(etiqueta: String, segundos: Int)] {
        [("Carrera", resumen.correrS), ("Estaciones", resumen.estacionesS), ("RoxZone", resumen.roxzoneS)]
            .compactMap { e, s in s.map { (etiqueta: e, segundos: $0) } }
    }

    private func celda(_ etiqueta: String, _ s: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta)
                .papel(.rotulo)
                .foregroundStyle(sobreFoto ? Theme.Color.foreground : Theme.Color.muted)
            Text(Formato.clock(s))
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        if !filas.isEmpty {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    ForEach(filas, id: \.etiqueta) { celda($0.etiqueta, $0.segundos) }
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(filas, id: \.etiqueta) { celda($0.etiqueta, $0.segundos) }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(filas.map { "\($0.etiqueta) \(Formato.clock($0.segundos))" }.joined(separator: ", "))
        }
    }
}

// MARK: - Estados: vacío con salida, error en línea

/// El estado vacío con salida (§5): qué falta, por qué, y el acto que lo llena. Compacto (una tarjeta
/// de sección), no de pantalla: el vacío de pantalla es el sujeto, no esto.
struct VacioCarreras<Icono: View, Salida: View>: View {
    let titulo: String
    let mensaje: String
    let icono: Icono
    let salida: Salida

    init(titulo: String, mensaje: String, @ViewBuilder icono: () -> Icono, @ViewBuilder salida: () -> Salida) {
        self.titulo = titulo
        self.mensaje = mensaje
        self.icono = icono()
        self.salida = salida()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            FichaDia(tono: .normal) { icono }
            VStack(alignment: .leading, spacing: 6) {
                SubtituloDia(titulo)
                Text(mensaje)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida
        }
        .padding(EdgeInsets(top: 20, leading: 18, bottom: 18, trailing: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
    }
}

// MARK: - Regleta neutra

/// La regleta de tramos medidos del póster: N de M en NEUTRO (el acento se guarda para la cuenta
/// atrás). Es la hermana de `RegletaDia`, que rellena con el acento y cabe en una tarjeta; sobre la
/// foto del póster dos acentos juntos pelean.
struct RegletaNeutraCarreras: View {
    let n: Int
    let de: Int

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(0..<max(0, de), id: \.self) { i in
                Capsule()
                    .fill(i < RegletaDia.llenos(n: n, de: de) ? Theme.Color.foreground : Theme.Color.foreground.opacity(0.30))
                    .frame(height: 6)
                    .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }
}
