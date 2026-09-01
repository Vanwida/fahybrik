import SwiftUI

// EL DIBUJO DE UNA LECTURA — genérico, por FORMA, nunca por `id`.
//
// LA ARQUITECTURA, EN UNA FRASE
// -----------------------------
// El servidor manda una LISTA de lecturas y esta pantalla la RECORRE. Cada una se
// dibuja por su forma —cifra, cifra y curva, cifra y reparto, o apagada—, y esa
// forma se deduce del dato: ¿hay serie?, ¿hay reparto?, ¿el reparto lleva
// porcentajes? Ni un solo `switch` sobre ids. Por eso una lectura nueva del
// servidor aparece dibujada sin tocar Swift, que es toda la promesa del contrato
// (`shared/domain/analytics/lectura.ts`).
//
// EL ACABADO ES EL DE `analiticas-correr`, y no de memoria: se dibuja con las
// MISMAS piezas ya portadas de la maqueta —`BloqueDeLectura`, `CifraDeBloque`,
// `DeltaDeBloque`, el trazo de `dibujaSerie`— en vez de con copias parecidas.
// Cero cajas, cero líneas divisorias, trazos finos sobre el lienzo, y el naranja
// una sola vez: la acción.
//
// LO QUE ESTA PANTALLA NO DECIDE, Y ES CASI TODO
// ----------------------------------------------
// **No juzga.** El contrato manda el número y su referencia, pero NO manda si
// subir es bueno (una variabilidad que sube es mejor; un pulso en reposo que
// sube, peor). Así que aquí ningún delta se colorea: se escribe la referencia al
// lado y se dibuja el fantasma a su altura, y la distancia se ve sin que la app
// afirme nada. Las dos únicas excepciones son juicios que el SERVIDOR sí sirve:
// el `tono` de un hecho, y las bandas del cociente que viajan en `metodo`.
//
// **No rellena.** Un hueco de la serie se dibuja como hueco, un `sin_dato` se
// enseña apagado con su falta declarada, y lo que no aplica no se pinta.

// MARK: - El grupo — un bloque con todas las lecturas de una familia

/// UNA FAMILIA DE LECTURAS bajo su etiqueta. La etiqueta es la PREGUNTA que
/// contesta el bloque entero, no una categoría.
///
/// La salida sale UNA vez por bloque: sin esto, a un atleta sin reloj se le
/// pediría conectarlo siete veces seguidas en la misma pantalla.
struct GrupoDeLecturas: View {
    let etiqueta: String
    let lecturas: [LecturaAnalitica]
    /// La ventana sobre la que hablan sus curvas (`AnaliticasAtleta.ventanaEs`).
    var ventana: String?
    /// Qué hacer cuando el atleta toca la salida. Nula = no hay dónde llevarle y
    /// entonces el botón no se pinta: uno que no lleva a ningún sitio es peor.
    var onSalida: (() -> Void)?

    private var pintables: [LecturaAnalitica] { lecturas.pintables() }

    /// LA PROTAGONISTA ES LA PRIMERA QUE TRAE NÚMERO, y el orden lo manda el
    /// servidor (de más completa a más corta de muestras). Es la misma convención
    /// con la que la pantalla de secciones elige su portada. Si ninguna trae
    /// número, ninguna manda: un candado grande no es un sujeto.
    private var protagonista: String? {
        pintables.first { $0.estado == .medida }?.id
    }

    var body: some View {
        if pintables.isEmpty {
            // Un grupo sin nada que pintar no es un bloque vacío: es un bloque que
            // no existe. Escribir su etiqueta sería un título sobre nada.
            EmptyView()
        } else {
            BloqueDeLectura(etiqueta: etiqueta, apunte: ventana) {
                let declara = SalidaDeLecturas.idQueDeclara(pintables)
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    ForEach(pintables) { lectura in
                        LecturaDelCuerpo(
                            lectura: lectura,
                            rango: lectura.id == protagonista ? .protagonista : .fila,
                            declaraLaFalta: declara == nil || declara == lectura.id
                        )
                    }
                }
                .padding(.top, Theme.Spacing.xs)
                SalidaDeBloque(faltas: pintables, onSalida: onSalida)
            }
        }
    }
}

/// EL BOTÓN DEL BLOQUE, uno y al final. La FRASE de lo que falta no vive aquí:
/// baja a la última lectura que la espera (`SalidaDeLecturas.idQueDeclara`), donde
/// habla de lo que tiene al lado en vez de quedar suelta bajo una lectura que sí
/// tiene número.
struct SalidaDeBloque: View {
    let faltas: [LecturaAnalitica]
    var onSalida: (() -> Void)?

    var body: some View {
        if let salida = SalidaDeLecturas.texto(faltas), let onSalida {
            BotonDeSalida(titulo: salida, accion: onSalida)
                .padding(.top, Theme.Spacing.xs)
        }
    }
}

/// LA SALIDA DE UN CONJUNTO DE LECTURAS. Reutiliza `faltaComun` —el mismo
/// criterio que ya gobierna la pantalla de carrera— para que dos vocabularios de
/// «qué falta» no acaben pidiendo cosas distintas por lo mismo.
enum SalidaDeLecturas {

    /// Las faltas que de verdad esperan algo, en el orden en que se pintan.
    static func faltas(_ lecturas: [LecturaAnalitica]) -> [Falta] {
        lecturas.compactMap(\.cobertura.falta).filter { !ProgresoDeCarrera.seCalla($0) }
    }

    /// LO QUE ESPERA EL BLOQUE ENTERO, cuando todas sus lecturas esperan lo mismo.
    /// Con una sola falta contable es la suya; con varias, solo si coinciden.
    static func faltaComun(_ lecturas: [LecturaAnalitica]) -> Falta? {
        let contables = faltas(lecturas)
        if let comun = ProgresoDeCarrera.faltaComun(contables) { return comun }
        return contables.count == 1 ? contables[0] : nil
    }

    /// El botón del bloque. Nulo cuando esperar es lo único que se puede hacer —
    /// un plazo no es una acción— o cuando lo que falta no se resuelve desde aquí.
    static func texto(_ lecturas: [LecturaAnalitica]) -> String? {
        faltaComun(lecturas).flatMap(ProgresoDeCarrera.salidaDe)
    }

    /// QUIÉN DICE LA FRASE, cuando varias lecturas esperan lo mismo: la ÚLTIMA que
    /// la espera. Al final del bloque quedaría suelta —entre las dos apagadas y el
    /// pie puede haber una lectura que sí tiene número, y entonces la frase parece
    /// hablar de ésa—; aquí cierra el grupo de las que se apagan por el mismo
    /// motivo, que es de lo que habla.
    ///
    /// Nulo si el bloque no comparte falta: entonces cada una dice la suya.
    static func idQueDeclara(_ lecturas: [LecturaAnalitica]) -> String? {
        guard let comun = faltaComun(lecturas) else { return nil }
        return lecturas.last {
            ($0.cobertura.falta).map { ProgresoDeCarrera.mismaRazon($0, comun) } ?? false
        }?.id
    }
}

// MARK: - Una lectura

/// UNA LECTURA, DIBUJADA POR SU FORMA. El título es el del servidor; la cifra, su
/// grafía; el dibujo, lo que el dato permita. Todo lo demás está en el contrato.
///
/// La composición interna es la de `FilaDeFuerza`, que ya está shipeada y
/// aprobada: título diminuto, cifra mono con lo que la califica a su lado, y la
/// curva DEBAJO A TODO EL ANCHO. La curva no va en una columna estrecha porque en
/// 100 pt la línea y su fantasma quedan a cuatro píxeles, y esa distancia es justo
/// lo único que el gráfico tiene que enseñar.
struct LecturaDelCuerpo: View {
    let lectura: LecturaAnalitica
    /// Cuánto peso tiene esta lectura DENTRO de su bloque. No es estética: la
    /// decide la evidencia que cita el hecho, así que sale del dato igual que
    /// todo lo demás (ver `GrupoDeLecturas` y `BloqueDeCarga`).
    var rango: Rango = .fila
    /// ¿Le toca a ESTA lectura escribir la frase de lo que falta? Cuando varias del
    /// bloque esperan lo mismo, la dice una sola (`SalidaDeLecturas.idQueDeclara`):
    /// a un atleta sin reloj le salía el mismo aviso tantas veces como señales mide
    /// su Garmin. El PLAZO no se calla nunca — es dato de esta lectura, no una
    /// frase repetida.
    var declaraLaFalta: Bool = true

    /// Protagonista lleva ejes y aire; fila comparte la tinta a escala de renglón.
    /// Seis curvas a pantalla completa apiladas no son un bloque, son un scroll.
    enum Rango: Equatable {
        case protagonista, fila

        var tamDeCifra: CGFloat { self == .protagonista ? 44 : 28 }
        var altoDeSerie: CGFloat { self == .protagonista ? 120 : 58 }
        var conEjes: Bool { self == .protagonista }
    }

    private var escrito: GrafiaDeLectura.Escrito? {
        lectura.dato.flatMap { GrafiaDeLectura.escribe($0.valor, $0.unidad) }
    }

    var body: some View {
        // MUDA ES MUDA, TÍTULO INCLUIDO. Quien recorre la lista ya filtra por
        // `pintables()`, pero si esta vista se usara suelta con una lectura que se
        // calla dejaría el título huérfano sobre nada — un rótulo sin dato es
        // exactamente la casilla vacía que la pantalla no enseña.
        if lectura.forma == .muda {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 5) {
                titulo
                switch lectura.forma {
                case .cifraYSerie:
                    cifra
                    serie
                case .cifraYBarra:
                    cifra
                    if let reparto = lectura.reparto { BarraDeRepartoNeutra(reparto: reparto) }
                case .cifraYFilas:
                    cifra
                    if let reparto = lectura.reparto { ChipsDeReparto(reparto: reparto) }
                case .cifra:
                    cifra
                case .apagada:
                    LecturaApagada(alto: 56)
                case .muda:
                    EmptyView()
                }
                // EL HUECO SE DECLARA AUNQUE HAYA NÚMERO: un hueco retira el
                // VEREDICTO, no el dato (la misma regla que ya gobierna la pantalla
                // de carrera). Por eso va fuera del `switch`, no dentro del apagado.
                if let falta = lectura.cobertura.falta, !ProgresoDeCarrera.seCalla(falta) {
                    HuecoDeclarado(falta: falta, conNota: declaraLaFalta)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// El título del servidor, y —solo cuando la fuente es ESTIMADA— la palabra
    /// que lo dice. Una cifra estimada puede enseñarse; no puede presentarse como
    /// medida, y esa diferencia cabe en una palabra.
    private var titulo: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(lectura.tituloEs)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            if !lectura.procedencia.medida, lectura.estado == .medida {
                Text("estimado")
                    .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
    }

    @ViewBuilder
    private var cifra: some View {
        if let escrito {
            CifraDeBloque(valor: escrito.cifra, unidad: escrito.unidad, tam: rango.tamDeCifra) {
                if let dato = lectura.dato, let referencia = dato.referencia,
                   let texto = GrafiaDeLectura.escribeReferencia(referencia, dato.unidad) {
                    ReferenciaDeBloque(texto: texto)
                }
            }
        }
    }

    /// La curva, con el fantasma a la altura de la referencia cuando la hay.
    ///
    /// EL EJE SOLO SE INVIERTE DONDE LA ARITMÉTICA LO PIDE: un ritmo es tiempo por
    /// distancia, así que menos ES más rápido y va arriba. En todo lo demás manda
    /// el eje normal, porque «arriba es mejor» sería un juicio y el contrato no lo
    /// manda.
    @ViewBuilder
    private var serie: some View {
        if let s = lectura.serie {
            LineaDeLectura(
                serie: s,
                referencia: referenciaDeLaSerie,
                mejorEsMenor: Self.menorEsMejor(s.unidad),
                alto: rango.altoDeSerie,
                conEjes: rango.conEjes
            )
            .padding(.top, 2)
        }
    }

    /// La referencia SOLO entra en el gráfico si está en la misma unidad que la
    /// serie. Dibujar un objetivo en horas sobre una curva en milisegundos sería
    /// una línea puesta a una altura que no significa nada.
    private var referenciaDeLaSerie: Double? {
        guard let dato = lectura.dato, let referencia = dato.referencia,
              let serie = lectura.serie, serie.unidad == dato.unidad else { return nil }
        return referencia.valor
    }

    /// Un ritmo mejora BAJANDO, y eso no es método: es que la unidad mide tiempo
    /// por distancia. Ninguna otra unidad del contrato lo cumple.
    static func menorEsMejor(_ unidad: UnidadLectura) -> Bool {
        switch unidad {
        case .sKm, .s500m: return true
        default: return false
        }
    }
}

// MARK: - Las piezas

/// CONTRA QUÉ SE LEE LA CIFRA — «tu media 55». Mismo peso y mismo tono que la
/// referencia de una fila de «cómo llegas hoy»: es contexto del dato, no el dato.
///
/// SIN COLOR, Y A PROPÓSITO. El contrato manda el delta pero no su polaridad (una
/// variabilidad que sube es mejor; un pulso en reposo que sube, peor), así que
/// teñirlo aquí sería inventar el juicio en el cliente. La distancia se ve en el
/// fantasma del gráfico; la afirmación la hace el hecho, que sí viene servida.
struct ReferenciaDeBloque: View {
    let texto: String

    var body: some View {
        Text(texto)
            .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
            .foregroundStyle(Theme.Color.faint)
    }
}

// MARK: - El hueco, declarado

/// LO QUE FALTA, DICHO O DIBUJADO — nunca una casilla en blanco ni un guion sin
/// motivo.
///
/// Le falta TIEMPO → se DIBUJA el plazo, porque esperar de verdad lo arregla y una
/// barra que se llena se compara con la de la semana pasada sin leer nada.
/// Le falta un APARATO → una línea corta que lo dice, sin botón: conectar un reloj
/// vive en Perfil y esta pantalla no puede llevarle allí.
/// Le falta un TEST → el botón, que lo pone el bloque una sola vez.
struct HuecoDeclarado: View {
    let falta: Falta
    /// A false, la frase la dice el BLOQUE por todas sus lecturas. El plazo no se
    /// calla nunca: es dato de ESTA lectura (doce noches de catorce no es lo mismo
    /// que tres de cuarenta y dos), no una frase repetida.
    var conNota: Bool = true

    var body: some View {
        switch falta {
        case let .historia(llevas, hacen):
            PlazoDeLectura(llevas: llevas, hacen: hacen)
        default:
            if conNota, let nota = ProgresoDeCarrera.notaDe(falta) {
                Text(nota)
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// EL PLAZO DE UNA LECTURA — cuánto llevas de lo que hace falta.
///
/// Hermano de `PlazoDeSemanas`, y separado a propósito: aquél cuenta SEMANAS y las
/// nombra, y el contrato de lecturas manda dos números sin unidad — para la carga
/// son días, para la variabilidad son noches. Así que aquí no se nombra ninguna:
/// se dibuja la proporción y se escribe «12 de 42», que es cierto en los dos casos.
///
/// Con pocos peldaños van en segmentos (se cuentan de un vistazo); con muchos, una
/// barra continua — cuarenta y dos segmentos de dos píxeles no se cuentan, se
/// miran.
struct PlazoDeLectura: View {
    let llevas: Int
    let hacen: Int

    private static let maximoEnSegmentos = 12
    private static let alto: CGFloat = 4
    private static let gap: CGFloat = 4

    var body: some View {
        if hacen <= 0 {
            EmptyView()
        } else {
            HStack(alignment: .center, spacing: Theme.Spacing.s) {
                barra
                Text(Formato.trabajo(hecho: min(llevas, hacen), objetivo: hacen))
                    .font(.system(size: 10, weight: .semibold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
                    .layoutPriority(1)
            }
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var barra: some View {
        if hacen <= Self.maximoEnSegmentos {
            HStack(spacing: Self.gap) {
                ForEach(0..<hacen, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i < llevas ? Theme.Color.foreground : Theme.Color.foreground.opacity(0.18))
                        .frame(height: Self.alto)
                }
            }
        } else {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Theme.Color.foreground.opacity(0.18))
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Theme.Color.foreground)
                        .frame(width: geo.size.width * Double(min(llevas, hacen)) / Double(hacen))
                }
            }
            .frame(height: Self.alto)
        }
    }
}
