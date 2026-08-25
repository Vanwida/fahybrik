import SwiftUI

// «¿VAS A MÁS, O TE ESTÁS PASANDO?» — el segundo bloque transversal del cuerpo, y
// el que justifica el rediseño entero.
//
// POR QUÉ ESTE BLOQUE EXISTE Y NADIE MÁS LO TIENE
// -----------------------------------------------
// La carga sola dice cuánto. El sueño solo dice cuánto duerme. Cruzarlos dice lo
// único que PIDE algo: «has subido un 30 % en dos semanas y duermes menos de lo
// tuyo — aprieta menos esta». TrainingPeaks tiene la carga y Whoop la
// recuperación, y cada uno enseña la mitad.
//
// EL CRUCE LO HACE EL SERVIDOR, NO ESTA VISTA. Llega hecho, en `hechos[]`, con los
// ids de las lecturas de las que sale cada frase (`shared/domain/analytics/
// hechos.ts`). Aquí no se compara nada, no se decide ningún umbral y no se escribe
// ninguna frase: se coloca la que viene y se pone debajo la evidencia que cita.
//
// **Y ESA CITA ES LA QUE ORDENA EL BLOQUE.** Las lecturas que el hecho nombra en
// `de[]` salen en grande; el resto de la carga baja a renglón. No hay una lista de
// ids favoritos en Swift: el servidor dice de dónde sale su afirmación y el bloque
// pone eso delante, para que el atleta pueda seguir la frase con el dedo por la
// gráfica en vez de fiarse.
//
// SIN HECHO NO SE INVENTA UNO. Una lista de hechos vacía es una respuesta legítima
// —no siempre hay algo que decirle—, y rellenarla con una frase fabricada es
// exactamente el ruido que todo este contrato existe para evitar. Entonces el
// bloque es lo que es: sus números, con el primero delante.

struct BloqueDeCarga: View {
    /// Las lecturas de carga, en el orden del servidor.
    let lecturas: [LecturaAnalitica]
    /// Lo que la pantalla puede afirmar hoy. Vacío es una respuesta.
    let hechos: [Hecho]
    /// El método del coach, para las bandas del cociente. Es el ÚNICO juicio que
    /// este bloque pinta por su cuenta, y solo porque el contrato manda estos dos
    /// números exactamente para eso.
    let metodo: MetodoAnalitico
    /// La ventana sobre la que hablan sus curvas (`AnaliticasAtleta.ventanaEs`).
    var ventana: String?
    var onSalida: (() -> Void)?

    /// La etiqueta ES la pregunta que contesta el bloque. Con hecho la contesta la
    /// frase; sin él, la contestan los números.
    static let etiqueta = ""

    private var pintables: [LecturaAnalitica] { lecturas.pintables() }

    /// El primero de la lista ya viene ordenado por el servidor: primero lo que
    /// avisa, después lo que solo informa.
    private var hecho: Hecho? { hechos.first }

    /// LOS DEMÁS HECHOS NO SE TIRAN: BAJAN A SU EVIDENCIA.
    ///
    /// El servidor puede afirmar dos cosas a la vez —«has subido un 31 %» y «un
    /// 29 % de lo que entrenas no entra en estos números»—, y quedarse solo con la
    /// primera es tragarse una petición concreta que el atleta podía atender hoy.
    /// Pero dos párrafos en display encima del bloque tampoco: el segundo se pone
    /// bajo la lectura que CITA, que es justo donde se puede comprobar.
    private func hechosBajo(_ id: String) -> [Hecho] {
        hechos.dropFirst().filter { $0.de.contains(id) }
    }

    /// LO QUE SOSTIENE LA AFIRMACIÓN. Cuando no hay hecho manda la primera lectura
    /// con número, que es la convención de portada del resto de la pantalla.
    private var protagonistas: Set<String> {
        if let hecho { return Set(hecho.de) }
        return Set(pintables.first { $0.estado == .medida }.map { [$0.id] } ?? [])
    }

    var body: some View {
        if pintables.isEmpty && hecho == nil {
            EmptyView()
        } else {
            BloqueDeLectura(etiqueta: Self.etiqueta, apunte: ventana) {
                if let hecho { AfirmacionDeCarga(hecho: hecho, sujeto: true) }
                let declara = SalidaDeLecturas.idQueDeclara(pintables)
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    ForEach(pintables) { lectura in
                        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                            if lectura.id == Self.idDelCociente {
                                // La única lectura con juicio propio, y con el juicio
                                // servido: las bandas del coach viajan en `metodo`.
                                CocienteDeCarga(lectura: lectura, metodo: metodo)
                            } else {
                                LecturaDelCuerpo(
                                    lectura: lectura,
                                    rango: protagonistas.contains(lectura.id) ? .protagonista : .fila,
                                    declaraLaFalta: declara == nil || declara == lectura.id
                                )
                            }
                            ForEach(hechosBajo(lectura.id)) { otro in
                                AfirmacionDeCarga(hecho: otro, sujeto: false)
                            }
                        }
                    }
                }
                .padding(.top, Theme.Spacing.xs)
                SalidaDeBloque(faltas: pintables, onSalida: onSalida)
            }
        }
    }

    /// EL ÚNICO ID QUE ESTE FICHERO NOMBRA, y se declara por qué: el cociente es la
    /// sola lectura del contrato cuyo juicio viaja aparte del dato (en `metodo`,
    /// no en `dato.referencia`), así que es la sola que el dibujo genérico no puede
    /// deducir. Si algún día el servidor le pone su referencia dentro, esta rama
    /// desaparece y el cociente cae por el mismo camino que las demás.
    static let idDelCociente = "carga.cociente"
}

// MARK: - La afirmación

/// LO QUE LA PANTALLA AFIRMA HOY, y lo que pide.
///
/// La frase va en la display cursiva de la marca, como el veredicto de la pantalla
/// de carrera: es el sujeto de su bloque. El tono lo manda el servidor —un aviso
/// apremia, una nota no—, y ahí sí hay color porque ahí sí hay juicio servido.
///
/// «Cargando de más» es AVISO, no alarma: el rojo se reserva para lo que hay que
/// atender hoy, que es el mismo criterio con el que ya se tiñe el veredicto.
struct AfirmacionDeCarga: View {
    let hecho: Hecho
    /// El primero es el SUJETO del bloque y va en display. Los demás cuelgan de la
    /// lectura que citan, y ahí la display competiría con el número que están
    /// explicando: bajan a texto corriente sin dejar de decir lo mismo.
    var sujeto: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: sujeto ? Theme.Spacing.s : 3) {
            if sujeto {
                Text(hecho.fraseEs)
                    .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                    .tracking(-0.84)
                    .foregroundStyle(tono)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(hecho.fraseEs)
                    .scaledFont(12.5, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(tono)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let pide = hecho.pideEs {
                Text(pide)
                    .scaledFont(sujeto ? 13 : 12, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(sujeto ? Theme.Color.foreground : Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, sujeto ? Theme.Spacing.xs : 0)
        .accessibilityElement(children: .combine)
    }

    private var tono: Color {
        switch hecho.tono {
        case .aviso: return Theme.Color.warning
        // Una nota no juzga: informa. Y un tono que este binario no conoce tampoco
        // se colorea — teñir por una palabra que no se entiende sería inventar el
        // juicio que precisamente no llegó.
        case .nota, .desconocido: return Theme.Color.foreground
        }
    }
}

// MARK: - El cociente, con las bandas del coach

/// RECIENTE CONTRA FONDO, coloreado por las bandas de SU entrenador.
///
/// Es la única cifra que este cliente tiñe por su cuenta, y no es una excepción a
/// la regla: el contrato manda `metodo.acr_low` y `metodo.acr_high` EXACTAMENTE
/// para esto — «para que el cliente pueda colorear el cociente por sus bandas sin
/// volver a resolverlo ni, mucho peor, cablearlo». Un coach que trabaja a 0,7/1,5
/// ve sus cortes, no los nuestros (Regla Nº0).
///
/// La banda se DIBUJA además de teñir: dónde cae el número entre los dos cortes se
/// ve sin leer, y los cortes llevan su cifra. Un color sin la escala detrás
/// obligaría a saberse de memoria qué significa el ámbar.
struct CocienteDeCarga: View {
    let lectura: LecturaAnalitica
    let metodo: MetodoAnalitico

    private var valor: Double? { lectura.dato?.valor }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(lectura.tituloEs)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)
            if let valor, let escrito = GrafiaDeLectura.escribe(valor, .ratio) {
                CifraDeBloque(valor: escrito.cifra, unidad: escrito.unidad, tam: 28, tono: tono(valor))
                BandasDelCociente(valor: valor, baja: metodo.acrLow, alta: metodo.acrHigh)
            } else if lectura.forma == .apagada {
                LecturaApagada(alto: 56)
            }
            if let falta = lectura.cobertura.falta, !ProgresoDeCarrera.seCalla(falta) {
                HuecoDeclarado(falta: falta)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Dentro de banda, la tinta normal: cumplir no es una noticia. Fuera —por
    /// arriba o por abajo— avisa, porque las dos orillas dicen algo (por debajo lo
    /// reciente no sostiene el fondo; por encima se acumula más rápido de lo que
    /// se asimila).
    private func tono(_ v: Double) -> Color {
        (v < metodo.acrLow || v > metodo.acrHigh) ? Theme.Color.warning : Theme.Color.foreground
    }
}

/// La escala del cociente con los dos cortes del coach y dónde cae hoy. Trazo
/// fino sobre el lienzo, sin caja, como el resto de la familia.
struct BandasDelCociente: View {
    let valor: Double
    let baja: Double
    let alta: Double

    private static let alto: CGFloat = 22
    /// El eje llega un poco más allá del corte alto para que un cociente disparado
    /// no se salga del lienzo. Es escala del dibujo, no un umbral: no juzga nada.
    private static let holgura: Double = 0.6

    var body: some View {
        Canvas(rendersAsynchronously: false) { ctx, size in
            dibuja(ctx, size: size)
        }
        .frame(height: Self.alto)
        .accessibilityElement()
        .accessibilityLabel(
            "\(Formato.esDecimal(valor, decimals: 2, siempreDecimales: true)), entre "
            + "\(Formato.esDecimal(baja, decimals: 2, siempreDecimales: true)) y "
            + "\(Formato.esDecimal(alta, decimals: 2, siempreDecimales: true))"
        )
    }

    private func dibuja(_ ctx: GraphicsContext, size: CGSize) {
        let tope = max(alta + Self.holgura, valor)
        guard size.width > 0, tope > 0 else { return }
        let x = { (v: Double) in size.width * min(max(0, v), tope) / tope }
        let yBarra = 7.0
        let altoBarra = 4.0

        // El carril entero, y la banda buena marcada más sólida dentro de él.
        ctx.fill(
            Path(CGRect(x: 0, y: yBarra, width: size.width, height: altoBarra)),
            with: .color(Theme.Color.foreground.opacity(0.14))
        )
        ctx.fill(
            Path(CGRect(x: x(baja), y: yBarra, width: max(0, x(alta) - x(baja)), height: altoBarra)),
            with: .color(Theme.Color.foreground.opacity(0.34))
        )

        // Dónde cae hoy: la misma marca vertical con banderín que ya usa el
        // objetivo del coach en la barra de reparto — una línea sola se
        // confundiría con un corte de banda.
        let xHoy = x(valor)
        let fuera = valor < baja || valor > alta
        let tinta = fuera ? Theme.Color.warning : Theme.Color.foreground
        ctx.fill(Path(CGRect(x: xHoy - 0.75, y: 3, width: 1.5, height: altoBarra + 6)), with: .color(tinta))
        var punta = Path()
        punta.move(to: CGPoint(x: xHoy - 4, y: 0))
        punta.addLine(to: CGPoint(x: xHoy + 4, y: 0))
        punta.addLine(to: CGPoint(x: xHoy, y: 5))
        punta.closeSubpath()
        ctx.fill(punta, with: .color(tinta))

        // Los dos cortes, rotulados: sin su cifra el color obligaría a saberse de
        // memoria dónde empieza el ámbar.
        for corte in [baja, alta] {
            etiqueta(ctx, Formato.esDecimal(corte, decimals: 2, siempreDecimales: true),
                     at: CGPoint(x: x(corte), y: size.height), anchor: .bottom)
        }
    }
}
