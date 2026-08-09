import SwiftUI

// LA ESPINA — las semanas de un plan como un camino vertical.
//
// Nació dentro de la nota del coach («por dónde voy a pasar») y vive aquí
// porque no es de la nota: es del PLAN. La misma pieza es la que va a dibujar
// la vista de un ciclo, y tenerla en dos sitios sería tenerla en dos versiones
// a los dos meses. El dibujo es el del doble (`web/components/plan-espina`).
//
// PRESENTACIONAL PURA. No sabe de red, ni de comunicados: recibe los tramos ya
// resueltos. Todo lo que decide QUÉ dice cada tramo —el nombre del microciclo,
// dónde está hoy, qué rompe la rutina— se resuelve en el servidor, sobre el
// plan real, y llega en `CaminoDelPlan`.
//
// LOS DOS EJES, como en el aro del reloj: el COLOR dice de qué tramo es cada
// nodo (dónde acaba uno y empieza el siguiente, que en una lista de nombres
// parecidos es justo lo que no se ve), y el RELLENO dice si ahí pasa algo que
// rompe la rutina. Dónde estás hoy es el tercero y va aparte, con halo y con la
// semana escrita: es lo único que cambia cada lunes.

// MARK: - Un tramo, listo para pintar

/// Lo que la espina necesita saber de un tramo. El color NO viaja resuelto (a
/// diferencia del doble, que se dibuja en dos espacios de tokens): en la app
/// sólo existe `Theme`, así que viaja el TONO y el color se resuelve aquí.
struct TramoEspina: Identifiable, Equatable {
    /// Clave estable: la misma que usa el doble (posición + fecha de inicio).
    let id: String
    /// Las semanas que ocupa, ya rotuladas: «S1», «S2-S5».
    let semanas: String
    let titulo: String
    let detalle: String?
    /// Su sitio en la escala de tonos. Lo deriva el servidor por posición.
    let tono: Int
    /// Rompe la rutina (un simulacro, unos tests): nodo relleno y halo.
    let destacado: Bool
    /// Qué semana de ESTE tramo es la de hoy. Nil si hoy no cae aquí.
    let semanaActual: Int?

    /// Es donde está hoy. Se deriva de la semana y no se declara aparte: dos
    /// campos para el mismo hecho es el sitio donde acaban discrepando.
    var actual: Bool { semanaActual != nil }

    /// Dónde estás, dicho como se lo diría el coach. Sin el número de semana
    /// sería un «estás por aquí» que no sitúa nada dentro de un tramo de cinco.
    var aquiEstas: String {
        guard let n = semanaActual, n >= 1 else { return "Estás aquí" }
        return "Estás aquí, semana \(n)"
    }

    /// De un camino resuelto a los tramos que se dibujan.
    static func desde(_ camino: CaminoDelPlan) -> [TramoEspina] {
        camino.segments.map { t in
            TramoEspina(
                id: "\(t.position)-\(t.startDate)",
                semanas: t.weeksLabel,
                titulo: t.title,
                detalle: t.detail,
                tono: t.tono,
                destacado: t.milestone,
                semanaActual: t.currentWeek
            )
        }
    }
}

// MARK: - Los tonos

/// Los cinco tonos de la escala, en los tokens de la app.
///
/// Son cinco SLOTS y no cinco significados: aquí el color dice DÓNDE ACABA UN
/// TRAMO Y EMPIEZA EL SIGUIENTE. El día que un coach pueda colorear sus ciclos,
/// el color llega del dato y esto se queda como el defecto de quien no ha
/// tocado nada.
enum TonosEspina {
    /// El color de la MARCA: el nodo y su halo, que son un dibujo.
    private static let marcas: [Color] = [
        Theme.Color.accent,
        Theme.Color.info,
        Theme.Color.ok,
        Theme.Color.warning,
        Theme.Color.muted,
    ]

    /// El MISMO tono cuando es texto. Sólo cambia el primero: el naranja de
    /// marca no llega a 4.5:1 sobre un lienzo claro, y `accentText` es la
    /// variante que sí (idéntica a la de marca en oscuro).
    private static let textos: [Color] = [
        Theme.Color.accentText,
        Theme.Color.info,
        Theme.Color.ok,
        Theme.Color.warning,
        Theme.Color.muted,
    ]

    /// El color del nodo del tono `n`. Fuera de rango vuelve al principio: la
    /// escala cicla, nunca se queda sin color.
    static func marca(_ tono: Int) -> Color { marcas[indice(tono)] }

    /// El color del tono `n` cuando se escribe.
    static func texto(_ tono: Int) -> Color { textos[indice(tono)] }

    private static func indice(_ tono: Int) -> Int {
        let n = tono % CaminoDelPlan.tonos
        return n < 0 ? n + CaminoDelPlan.tonos : n
    }
}

// MARK: - El dibujo

/// La geometría del doble, en un sitio: cambiarla aquí cambia la espina de
/// todas las pantallas a la vez.
private enum Trazo {
    /// Ancho de la columna del raíl y grosor de su línea.
    static let columna: CGFloat = 13
    static let linea: CGFloat = 1
    /// Diámetro del nodo y grosor de su borde.
    static let nodo: CGFloat = 9
    static let borde: CGFloat = 1.6
    /// Diámetro real del nodo con su borde (el trazo va centrado en el camino).
    static var nodoExterior: CGFloat { nodo + borde }
    /// Cuánto baja el nodo dentro de su fila.
    static let bajadaNodo: CGFloat = 8
    /// La altura a la que el raíl se encuentra con el centro del nodo: donde se
    /// corta en el primer tramo y en el último.
    static var centroNodo: CGFloat { bajadaNodo + nodo / 2 }
    /// El halo de donde ESTÁS y el de lo que ROMPE LA RUTINA. Distintos a
    /// propósito: si fueran iguales, el nodo de hoy diría «aquí hay un
    /// simulacro» y el del simulacro diría «estás aquí».
    static let haloActual: CGFloat = 4
    static let haloHito: CGFloat = 3
    static let opacidadHaloActual: Double = 0.26
    static let opacidadHaloHito: Double = 0.22
    /// El aire entre el raíl y el texto, y el que queda bajo cada tramo.
    static let aire = Theme.Spacing.m
    /// El aire entre las líneas de un tramo, y lo que baja su primera línea.
    static let aireInterno: CGFloat = 3
    static let bajadaTexto: CGFloat = 4
    /// 0.06em a 11 pt — el rótulo de semanas va tracked como una lectura.
    static let trackingSemanas: CGFloat = 0.66
}

struct EspinaDelPlan: View {
    let tramos: [TramoEspina]

    /// Cuántas semanas dura el plan, si se saben. No se pinta: se dice en voz
    /// alta para quien escucha la espina en vez de mirarla.
    var semanasTotales: Int?

    /// Directo desde el camino que sirve el servidor.
    init(camino: CaminoDelPlan) {
        self.tramos = TramoEspina.desde(camino)
        self.semanasTotales = camino.totalWeeks
    }

    init(tramos: [TramoEspina], semanasTotales: Int? = nil) {
        self.tramos = tramos
        self.semanasTotales = semanasTotales
    }

    var body: some View {
        if !tramos.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(tramos.enumerated()), id: \.element.id) { i, tramo in
                    FilaEspina(
                        tramo: tramo,
                        primero: i == 0,
                        ultimo: i == tramos.count - 1
                    )
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(etiquetaDelConjunto)
        }
    }

    private var etiquetaDelConjunto: String {
        guard let semanasTotales, semanasTotales > 0 else { return "Tu camino" }
        return "Tu camino, \(semanasTotales) semanas"
    }
}

/// Un tramo: su nodo en el raíl y lo que dice a la derecha.
private struct FilaEspina: View {
    let tramo: TramoEspina
    let primero: Bool
    let ultimo: Bool

    private var color: Color { TonosEspina.marca(tramo.tono) }
    private var colorTexto: Color { TonosEspina.texto(tramo.tono) }

    var body: some View {
        HStack(alignment: .top, spacing: Trazo.aire) {
            nodo
                .frame(width: Trazo.columna, alignment: .center)
                .padding(.top, Trazo.bajadaNodo)
                .accessibilityHidden(true)
            texto
        }
        .background(alignment: .topLeading) { rail }
        .accessibilityElement(children: .combine)
    }

    // MARK: El raíl
    //
    // Se corta arriba en el primero y abajo en el último, a la altura del centro
    // del nodo: un camino que entra y sale del cuadro prometería tramos que no
    // existen. Con UN solo tramo no hay camino que unir y no se dibuja.
    @ViewBuilder
    private var rail: some View {
        if !(primero && ultimo) {
            Rectangle()
                .fill(Theme.Color.hairlineStrong)
                .frame(width: Trazo.linea)
                .frame(height: ultimo ? Trazo.centroNodo : nil)
                .padding(.top, primero ? Trazo.centroNodo : 0)
                .padding(.leading, (Trazo.columna - Trazo.linea) / 2)
                .accessibilityHidden(true)
        }
    }

    // MARK: El nodo
    //
    // Hueco por defecto y RELLENO cuando rompe la rutina. El halo es un anillo
    // por fuera del borde (no un disco detrás): así el nodo hueco deja ver la
    // tarjeta sobre la que está, sin tener que rellenarlo del color del lienzo.
    private var nodo: some View {
        Circle()
            .fill(tramo.destacado ? color : Color.clear)
            .frame(width: Trazo.nodo, height: Trazo.nodo)
            .overlay(Circle().stroke(color, lineWidth: Trazo.borde))
            .background { halo }
    }

    @ViewBuilder
    private var halo: some View {
        if tramo.actual {
            anillo(ancho: Trazo.haloActual, opacidad: Trazo.opacidadHaloActual)
        } else if tramo.destacado {
            anillo(ancho: Trazo.haloHito, opacidad: Trazo.opacidadHaloHito)
        }
    }

    private func anillo(ancho: CGFloat, opacidad: Double) -> some View {
        Circle()
            .stroke(color.opacity(opacidad), lineWidth: ancho)
            .frame(width: Trazo.nodoExterior + ancho, height: Trazo.nodoExterior + ancho)
    }

    // MARK: Lo que dice el tramo

    private var texto: some View {
        VStack(alignment: .leading, spacing: Trazo.aireInterno) {
            MonoText(text: tramo.semanas, size: 11, weight: .bold, color: colorTexto,
                     escala: true, relativeTo: .caption2)
                .tracking(Trazo.trackingSemanas)
            Text(tramo.titulo)
                .scaledFont(14, weight: tramo.destacado || tramo.actual ? .semibold : .medium,
                            relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let detalle = tramo.detalle, !detalle.isEmpty {
                Text(detalle)
                    .scaledFont(12.5, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if tramo.actual {
                Text(tramo.aquiEstas)
                    .scaledFont(12.5, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(colorTexto)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Trazo.bajadaTexto)
        .padding(.bottom, Trazo.aire)
        // El relleno del nodo no lo oye nadie: lo que dice se dice.
        .accessibilityHint(tramo.destacado ? "Rompe la rutina" : "")
    }
}
