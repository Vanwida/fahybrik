import SwiftUI

// LO QUE CUELGA DE CADA PARADA DEL CAMINO, y el puente que convierte una parada
// (`CicloDelPlan.nodos`) en un tramo pintable de la espina.
//
// El camino NO se dibuja aquí: lo dibuja `EspinaDelPlan`, la misma pieza que
// pinta la nota del coach. Lo que queda en este fichero es lo que sí es de esta
// pantalla — las marcas de semana con el cursor de hoy, la lista de lo que hay en
// el calendario, la declaración del hueco y la cuenta atrás de la carrera.
//
// Espejo de `plan-ciclo/atoms.tsx`. Ninguna pieza inventa un color ni un tamaño:
// todo sale de los tokens de `Theme`.

// MARK: - De las paradas a los tramos que dibuja la espina

extension CicloDelPlan {
    /// Las paradas, ya con lo que cuelga de cada una y con quién paga el sobrante.
    ///
    /// EL REPARTO VERTICAL (§6.1): el sobrante entra EN LAS PARADAS y nunca en una
    /// cola debajo del camino. Lo pagan las tres que pueden — el tramo de hoy, el
    /// hueco (que ocupa tiempo de verdad entre lo último publicado y la carrera) y
    /// la carrera, que es la que da sentido a todo lo de arriba. Un tramo abierto
    /// SIN nada en su calendario no crece: estirarlo sería aire dentro del camino.
    var tramosDeLaEspina: [TramoEspina] {
        nodos.map { nodo in
            let tramo = nodo.indiceTramo.map { tramos[$0] }
            return TramoEspina(
                id: nodo.id,
                semanas: nodo.semanas,
                titulo: nodo.titulo,
                detalle: nodo.detalle,
                tono: nodo.tono,
                destacado: nodo.destacado,
                semanaActual: nodo.semanaActual,
                forma: forma(de: nodo.clase),
                pasado: nodo.pasado,
                crece: crece(nodo, tramo: tramo),
                contenido: contenido(nodo, tramo: tramo),
                etiqueta: nodo.etiqueta
            )
        }
    }

    private func forma(de clase: NodoDelCiclo.Clase) -> FormaEspina {
        switch clase {
        case .tramo:   return .tramo
        case .hueco:   return .hueco
        case .carrera: return .meta
        }
    }

    private func crece(_ nodo: NodoDelCiclo, tramo: TramoDelPlan?) -> Bool {
        switch nodo.clase {
        case .hueco, .carrera: return true
        case .tramo:           return nodo.actual && !(tramo?.events.isEmpty ?? true)
        }
    }

    private func contenido(_ nodo: NodoDelCiclo, tramo: TramoDelPlan?) -> AnyView? {
        switch nodo.clase {
        case .hueco:
            return AnyView(DeclaracionDelHueco())
        case .carrera:
            guard let carrera, let dias = carrera.enDias(hoy: hoy), dias >= 0 else { return nil }
            return AnyView(CuentaAtrasDeLaCarrera(dias: dias))
        case .tramo:
            guard let tramo else { return nil }
            let hitos = tramo.events
            guard nodo.actual || !hitos.isEmpty else { return nil }
            return AnyView(
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    if nodo.actual {
                        // Las marcas se llevan el sobrante de la parada y se
                        // CENTRAN en él: el hueco entra aquí, no en una cola bajo
                        // el camino (§6.1). Lo que hay en el calendario va después
                        // y ocupa lo suyo.
                        MarcasDeSemana(
                            semanas: tramo.weekCount,
                            cursor: nodo.semanaActual,
                            color: TonosEspina.marca(nodo.tono)
                        )
                        .frame(maxHeight: .infinity)
                    }
                    if !hitos.isEmpty {
                        EnElCalendario(
                            hitos: hitos,
                            hoy: hoy,
                            color: TonosEspina.marca(nodo.tono)
                        )
                    }
                }
            )
        }
    }
}

// MARK: - Las semanas del tramo abierto

/// LAS SEMANAS DONDE ESTÁS, con el cursor de hoy encima.
///
/// Son MARCAS DE POSICIÓN: todas miden lo mismo y solo cambia la de hoy. Si
/// alguna fuese más alta que otra estaríamos dibujando una rampa de carga
/// prevista, que es exactamente lo que esta pantalla viene a sustituir y lo que
/// el modelo se niega a guardar.
///
/// Va oculta a VoiceOver porque la posición ya se lee entera en el rótulo de su
/// parada («estás en la semana 2»): repetirla en marcas sueltas no añade nada.
///
/// El cursor va del color DE ESTE TRAMO y no del acento: en la espina el color
/// dice de qué tramo es cada cosa, y una marca naranja dentro de un tramo azul
/// diría que pertenece a otro sitio.
struct MarcasDeSemana: View {
    let semanas: Int
    let cursor: Int?
    let color: Color

    /// El alto de una marca y el de la de hoy — la de hoy sube 2 pt, lo justo
    /// para distinguirse sin parecer una barra de cantidad.
    private static let alto: CGFloat = 8
    private static let altoCursor: CGFloat = 10
    /// El triangulito que señala la semana de hoy.
    private static let flecha: CGFloat = 5

    private var marcas: [Int] { Array(1...max(1, semanas)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                ForEach(marcas, id: \.self) { n in
                    ZStack {
                        if n == cursor {
                            Triangulo()
                                .fill(color)
                                .frame(width: Self.flecha * 1.6, height: Self.flecha)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: Self.flecha)
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(marcas, id: \.self) { n in
                    Capsule()
                        .fill(relleno(n))
                        .frame(height: n == cursor ? Self.altoCursor : Self.alto)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.top, Theme.Spacing.xs)
        .accessibilityHidden(true)
    }

    private func relleno(_ n: Int) -> Color {
        guard let cursor else { return Theme.Color.hairlineStrong }
        if n < cursor { return Theme.Color.muted }
        if n == cursor { return color }
        return Theme.Color.hairlineStrong
    }
}

/// El triangulito del cursor, apuntando hacia abajo.
private struct Triangulo: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

// MARK: - Lo que hay en el calendario

/// LO QUE YA ESTÁ PUESTO dentro del tramo, con su cuándo. Existe porque alguien
/// lo programó, así que se dice con seguridad aunque caiga en el futuro.
struct EnElCalendario: View {
    let hitos: [HitoDelTramo]
    let hoy: Date
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            LabelText(text: "En el calendario", color: Theme.Color.faint, size: 10)
            ForEach(Array(hitos.enumerated()), id: \.offset) { _, hito in
                LineaDelHito(hito: hito, hoy: hoy, color: color)
            }
        }
        .padding(.top, Theme.Spacing.xs)
    }
}

/// Un hito decidido: su rombo, su nombre y cuándo cae.
///
/// El rombo va del color de SU tramo por la misma razón que el cursor de las
/// semanas: en la espina el color tiene un solo significado, y meterle un segundo
/// lo rompe.
private struct LineaDelHito: View {
    let hito: HitoDelTramo
    let hoy: Date
    let color: Color

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Rectangle()
                .fill(color)
                .frame(width: 5, height: 5)
                .rotationEffect(.degrees(45))
                .accessibilityHidden(true)
            Text(hito.title)
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(CicloDelPlan.cuandoElHito(hito, hoy: hoy))
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
        }
    }
}

// MARK: - El hueco: de quién depende

/// LO QUE EL ATLETA NO PUEDE DESBLOQUEAR, dicho con quién lo desbloquea y con lo
/// que se sabe de cuándo (que hoy es: nada).
///
/// Misma frase que el vacío de «aún no tienes plan» — son el mismo hecho visto
/// desde dos sitios, y decirlo de dos maneras haría dudar de las dos.
struct DeclaracionDelHueco: View {
    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            Image(systemName: "clock")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
                .padding(.top, 1)
            Text(LoPublicaElCoach.frase)
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .padding(.top, Theme.Spacing.s)
        .accessibilityHidden(true)
    }
}

// MARK: - La cuenta atrás de la carrera

/// CUÁNTOS DÍAS QUEDAN. Es el número que da sentido a todo lo de arriba, así que
/// se escribe como cifra y no como frase.
struct CuentaAtrasDeLaCarrera: View {
    let dias: Int

    var body: some View {
        CifraDelPlan(cifra: "\(dias)", sufijo: dias == 1 ? "día" : "días", tamano: 34)
            .padding(.top, Theme.Spacing.xs)
            .accessibilityHidden(true)
    }
}

// MARK: - El numeral de la familia del plan

/// TODA CIFRA de esta pantalla pasa por aquí: la semana del tramo en el sujeto y
/// los días que faltan para la carrera.
///
/// La unidad y el resto del contador van en `sufijo`, en sans y apoyados en la
/// línea base del número: una palabra dentro del monoespaciado sale con el
/// espaciado de una columna de instrumento y deja de leerse.
///
/// No reutiliza el `Numeral` de `LenguajeVivoUI`: aquél es el numeral de las
/// vistas EN VIVO y escala su tamaño según el lienzo que le inyecta el marco —
/// aquí el tamaño lo manda la jerarquía de la pantalla, no el hueco disponible.
struct CifraDelPlan: View {
    let cifra: String
    var sufijo: String? = nil
    var tamano: CGFloat = 34
    var color: Color = Theme.Color.foreground

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            MonoText(text: cifra, size: tamano, weight: .bold, color: color,
                     escala: true, relativeTo: .title)
                .lineLimit(1)
            if let sufijo {
                Text(sufijo)
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}
