import SwiftUI

// LA ESPINA — las semanas de un plan como un camino vertical.
//
// Nació dentro de la nota del coach («por dónde voy a pasar») y vive aquí
// porque no es de la nota: es del PLAN. La MISMA pieza dibuja la nota del coach
// y la vista de un ciclo (`PlanCicloView`), y tenerla en dos sitios sería
// tenerla en dos versiones a los dos meses. El dibujo es el del doble
// (`web/components/plan-espina`).
//
// LO QUE CUELGA DE UN NODO ES DE CADA SUPERFICIE, EL DIBUJO NO. Por eso un tramo
// acepta `contenido` (las marcas de semana del ciclo, su lista de calendario) en
// vez de que cada pantalla se dibuje su propio raíl: el día que el camino cambie
// de forma, cambia en un fichero y en todas las superficies.
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

// MARK: - Qué clase de parada es

/// Tres formas y una sola razón para cada una: un círculo es un trozo de plan,
/// un rombo es aquello a lo que apunta el plan, y un círculo discontinuo es donde
/// el plan se acaba sin que nadie haya dicho qué viene.
enum FormaEspina: Equatable {
    /// Las semanas seguidas de un microciclo. El caso normal.
    case tramo
    /// Aquello a lo que apunta todo lo de arriba: una carrera, una fecha objetivo.
    case meta
    /// Aquí se acaba lo que hay montado. El camino se dibuja roto, porque lo está.
    case hueco
}

// MARK: - Un tramo, listo para pintar

/// Lo que la espina necesita saber de un tramo. El color NO viaja resuelto (a
/// diferencia del doble, que se dibuja en dos espacios de tokens): en la app
/// sólo existe `Theme`, así que viaja el TONO y el color se resuelve aquí.
///
/// NO es `Equatable` desde que lleva `contenido`: una vista y una comparación no
/// caben en el mismo tipo, y un `==` que se saltara justo el campo que cambia
/// sería peor que no tenerlo. Nadie lo comparaba (la espina identifica sus filas
/// por `id`).
struct TramoEspina: Identifiable {
    /// Clave estable: la misma que usa el doble (posición + fecha de inicio).
    let id: String
    /// Las semanas que ocupa, ya rotuladas: «S1», «S2-S5». Vacío = esta parada no
    /// ocupa semanas y no se rotula (una meta, un hueco).
    let semanas: String
    let titulo: String
    let detalle: String?
    /// Su sitio en la escala de tonos. Lo deriva el servidor por posición.
    ///
    /// Sólo se lee cuando la forma es `.tramo`: el hueco y la meta no tienen tono
    /// propio y su color lo dice su FORMA, igual que en el doble (`colorDeNodo`).
    let tono: Int
    /// Rompe la rutina (un simulacro, unos tests): nodo relleno y halo.
    let destacado: Bool
    /// Qué semana de ESTE tramo es la de hoy. Nil si hoy no cae aquí.
    let semanaActual: Int?
    /// Círculo por defecto. Ver `FormaEspina`.
    var forma: FormaEspina = .tramo
    /// Ya pasó. El nodo y su rótulo BAJAN DE TINTA en vez de taparse con
    /// opacidad, que se come el contraste del texto. Sólo lo declara quien SABE
    /// dónde está hoy: sin cursor no se sabe qué queda detrás.
    var pasado: Bool = false
    /// Esta parada paga el sobrante vertical cuando la espina vive en una columna
    /// de alto fijo (el móvil del atleta). El sobrante entra EN LAS PARADAS y
    /// nunca en una cola debajo del camino (§6.1). Falso = ocupa lo suyo, que es
    /// lo que quiere una espina dentro de una página que scrollea.
    var crece: Bool = false
    /// Lo que cuelga de este nodo y es de la SUPERFICIE, no del camino: las
    /// marcas de semana del móvil, la lista de lo que hay en el calendario, la
    /// cuenta atrás de la carrera. El dibujo del camino no se duplica por eso.
    var contenido: AnyView? = nil
    /// El rótulo que se lee en voz alta, cuando la superficie sabe decirlo entero.
    /// Nil = la fila combina lo que tiene escrito, que es el comportamiento con
    /// el que nació (la nota del coach).
    var etiqueta: String? = nil

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
    /// El raíl del hueco va discontinuo: el camino sigue, pero ya no hay nadie que
    /// diga por dónde. 3 pintados / 3 vacíos, los del doble.
    static let discontinuo: [CGFloat] = [3, 3]
    /// El borde del nodo del hueco, con el mismo pulso más corto.
    static let discontinuoNodo: [CGFloat] = [2, 2]
    /// El rombo de la meta: un cuadrado girado con la esquina apenas redondeada.
    static let radioMeta: CGFloat = 2
    /// Cuánta tinta le queda a lo que ya pasó. Suficiente para leerse, poco para
    /// competir con lo que viene.
    static let tintaPasado: Double = 0.45
}

/// La geometría, para quien necesite alinear algo CON el camino (una línea al pie
/// que arranca donde arranca el texto de las paradas). Se publica en vez de que
/// cada superficie repita los números: repetidos, un cambio de raíl desalinea
/// pantallas que nadie ha vuelto a mirar. Es `GEOMETRIA_ESPINA` del doble.
enum GeometriaEspina {
    /// Lo que hay que sangrar para caer bajo el texto de una parada.
    static var sangria: CGFloat { Trazo.columna + Trazo.aire }
}

/// La línea del raíl, como forma: así se puede pintar continua o discontinua con
/// la misma geometría en vez de tener dos dibujos que se desalinean.
private struct LineaDelRail: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return p
    }
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

    /// El color de la MARCA. Un tramo lo saca de su tono; el hueco es AUSENCIA y
    /// va neutro; la meta no se pinta con el acento — el acento ya dice «estás
    /// aquí» y darle dos significados lo rompe.
    private var color: Color {
        switch tramo.forma {
        case .tramo: return TonosEspina.marca(tramo.tono)
        case .hueco: return Theme.Color.muted
        case .meta:  return Theme.Color.foreground
        }
    }

    /// El mismo tono cuando es TEXTO (variante que llega a 4,5:1 en claro).
    private var colorTexto: Color {
        switch tramo.forma {
        case .tramo: return TonosEspina.texto(tramo.tono)
        case .hueco: return Theme.Color.muted
        case .meta:  return Theme.Color.foreground
        }
    }

    /// La tinta de la MARCA: la de lo que ya pasó baja, no se tapa con opacidad
    /// sobre el texto. El nodo es dibujo y va oculto a VoiceOver, así que aquí sí
    /// vale bajarla como en el doble.
    private var tinta: Color { tramo.pasado ? color.opacity(Trazo.tintaPasado) : color }

    /// La tinta del TEXTO de una parada pasada NO es su tono al 45 %: sobre lienzo
    /// claro eso se queda muy por debajo de 4,5:1 y el rótulo de semanas deja de
    /// leerse. Baja a `muted`, que es la misma tinta a la que baja su título — un
    /// escalón de jerarquía, no un texto medio borrado.
    private var tintaTexto: Color { tramo.pasado ? Theme.Color.muted : colorTexto }

    var body: some View {
        HStack(alignment: .top, spacing: Trazo.aire) {
            nodo
                .frame(width: Trazo.columna, alignment: .center)
                .padding(.top, Trazo.bajadaNodo)
                .accessibilityHidden(true)
            // La columna de texto SE ESTIRA con la parada, para que lo que cuelga
            // del nodo pueda quedarse el sobrante. Sin esto la fila crecía pero su
            // contenido se quedaba arriba, y el hueco aparecía debajo — que es
            // exactamente lo que la regla 2 no admite.
            texto
                .frame(maxHeight: tramo.crece ? .infinity : nil, alignment: .top)
        }
        // `crece`: el sobrante del alto entra AQUÍ, en la parada, y no en una cola
        // debajo del camino (§6.1). Sin él la fila ocupa lo suyo.
        .frame(maxHeight: tramo.crece ? .infinity : nil)
        .background(alignment: .topLeading) { rail }
        .modifier(VozDeLaFila(etiqueta: tramo.etiqueta))
    }

    // MARK: El raíl
    //
    // Se corta arriba en el primero y abajo en el último, a la altura del centro
    // del nodo: un camino que entra y sale del cuadro prometería tramos que no
    // existen. Con UN solo tramo no hay camino que unir y no se dibuja.
    // Donde se acaba lo montado el raíl se dibuja DISCONTINUO — el camino sigue,
    // pero ya no hay nadie que diga por dónde.
    @ViewBuilder
    private var rail: some View {
        if !(primero && ultimo) {
            LineaDelRail()
                .stroke(
                    Theme.Color.hairlineStrong,
                    style: StrokeStyle(
                        lineWidth: Trazo.linea,
                        dash: tramo.forma == .hueco ? Trazo.discontinuo : []
                    )
                )
                .frame(width: Trazo.linea)
                .frame(height: ultimo ? Trazo.centroNodo : nil)
                .padding(.top, primero ? Trazo.centroNodo : 0)
                .padding(.leading, (Trazo.columna - Trazo.linea) / 2)
                .accessibilityHidden(true)
        }
    }

    // MARK: El nodo
    //
    // Hueco por defecto y RELLENO cuando rompe la rutina o cuando es la meta (a
    // la meta se llega: es un punto, no un hueco por rellenar). El halo es un
    // anillo por fuera del borde (no un disco detrás): así el nodo hueco deja ver
    // la tarjeta sobre la que está, sin rellenarlo del color del lienzo.
    @ViewBuilder
    private var nodo: some View {
        switch tramo.forma {
        case .tramo:
            Circle()
                .fill(tramo.destacado ? tinta : Color.clear)
                .frame(width: Trazo.nodo, height: Trazo.nodo)
                .overlay(Circle().stroke(tinta, lineWidth: Trazo.borde))
                .background { halo }
        case .meta:
            // El rombo: el mismo cuadrado del doble, girado 45°.
            RoundedRectangle(cornerRadius: Trazo.radioMeta, style: .continuous)
                .fill(tinta)
                .frame(width: Trazo.nodo, height: Trazo.nodo)
                .rotationEffect(.degrees(45))
        case .hueco:
            Circle()
                .fill(Color.clear)
                .frame(width: Trazo.nodo, height: Trazo.nodo)
                .overlay(
                    Circle().stroke(
                        tinta,
                        style: StrokeStyle(lineWidth: Trazo.borde, dash: Trazo.discontinuoNodo)
                    )
                )
        }
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
            // Una parada que no ocupa semanas (la meta, el hueco) no se rotula:
            // reservarle la línea dejaría un hueco que promete un dato.
            if !tramo.semanas.isEmpty {
                MonoText(text: tramo.semanas, size: 11, weight: .bold, color: tintaTexto,
                         escala: true, relativeTo: .caption2)
                    .tracking(Trazo.trackingSemanas)
            }
            Text(tramo.titulo)
                .scaledFont(14, weight: tramo.destacado || tramo.actual ? .semibold : .medium,
                            relativeTo: .subheadline)
                .foregroundStyle(tramo.pasado ? Theme.Color.muted : Theme.Color.foreground)
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
            if let contenido = tramo.contenido { contenido }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Trazo.bajadaTexto)
        .padding(.bottom, Trazo.aire)
        // El relleno del nodo no lo oye nadie: lo que dice se dice.
        .accessibilityHint(tramo.destacado ? "Rompe la rutina" : "")
    }
}

/// La voz de una fila. Con rótulo propio la fila se lee ENTERA de una vez (lo
/// que cuelga del nodo son marcas y cifras que sueltas no dicen nada); sin él,
/// combina lo que tiene escrito, que es como nació en la nota del coach.
private struct VozDeLaFila: ViewModifier {
    let etiqueta: String?

    func body(content: Content) -> some View {
        if let etiqueta {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta)
        } else {
            content.accessibilityElement(children: .combine)
        }
    }
}
