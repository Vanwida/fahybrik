import SwiftUI

// EL DIBUJO DE LA TARJETA — el contrato es la pantalla `compartir-entreno` del
// doble, elemento a elemento (checklist del 24-ago):
//
//   · Se dibuja a los PÍXELES DE LA STORY: la tarjeta mide 700 pt de ancho y
//     cada `size:` de aquí es el mismo número que en el doble. Renderizada a
//     ×2 sale un PNG nítido; escalada, la previa. Nada se re-maqueta.
//   · EL ACENTO SOLO DONDE SIGNIFICA ALGO: el chip, la mejor repetición y el
//     punto del club. Un acento en cada raya es un acento en ninguna parte.
//   · TRES VOCES: display itálica pesada en mayúsculas (la voz del wordmark),
//     cuerpo neutro para movimientos, mono tabular para números.
//   · LOS DATOS SE VEN: cada parcial lleva detrás una barra proporcional a su
//     tiempo, normalizada al rango real de la tanda. La historia (aguantó, se
//     cayó, cerró fuerte) aparece sin leer un solo número.
//   · SU PROPIO FONDO, casi opaco: un cristal muy transparente se lee sobre un
//     vídeo oscuro y desaparece sobre uno claro, y el atleta no puede saber
//     cuál le tocará antes de publicar.

// MARK: - Paleta de la tarjeta (fija: la tarjeta vive sobre un vídeo, no sobre
// el tema de la app — no responde a claro/oscuro)

private enum TintaCartel {
    static let plena = Color.white
    static let tenue = Color.white.opacity(0.56)
    static let debil = Color.white.opacity(0.34)
    static let hairline = Color.white.opacity(0.12)
    static let fondoChipOscuro = Color(red: 11 / 255, green: 11 / 255, blue: 12 / 255)
}

/// El acento de la tarjeta y su marca. `conClub` es la elección del atleta (el
/// conmutador de la hoja); el color y el nombre son DEL COACH (`ClubThemeStore`)
/// — cero marca nuestra cableada. Sin club: acento blanco, sin pie.
struct MarcaCartel {
    let conClub: Bool
    let nombreClub: String?
    let acento: Color
    let sobreAcento: Color

    var acentoActivo: Color { conClub ? acento : TintaCartel.plena }
    var sobreAcentoActivo: Color { conClub ? sobreAcento : TintaCartel.fondoChipOscuro }
    /// El pie solo existe con club Y con nombre que enseñar.
    var pie: String? { conClub ? nombreClub : nil }

    @MainActor
    static func actual(conClub: Bool) -> MarcaCartel {
        MarcaCartel(
            conClub: conClub,
            nombreClub: ClubThemeStore.current?.name ?? Marca.nombre,
            acento: Theme.Color.accentText,
            sobreAcento: Theme.Color.accentOn
        )
    }
}

// MARK: - La tarjeta de un entreno

struct TarjetaEntrenoView: View {
    let datos: TarjetaEntrenoDatos
    let marca: MarcaCartel

    var body: some View {
        let recorte = RecorteCartel.recortar(
            datos.bloques,
            conClub: marca.pie != nil,
            conResultado: !datos.resultado.isEmpty
        )
        SuperficieCartel(marca: marca) {
            TitularCartel(chip: datos.chip, titulo: datos.titulo, marca: marca)
            if !datos.resultado.isEmpty {
                ResultadoCartel(filas: datos.resultado)
            }
            ForEach(Array(recorte.visibles.enumerated()), id: \.offset) { _, bloque in
                BloqueCartelView(bloque: bloque, marca: marca)
            }
            if recorte.ocultos > 0 {
                MasCartel(ocultos: recorte.ocultos)
            }
        }
    }
}

// MARK: - La tarjeta de la semana

struct TarjetaSemanaView: View {
    let datos: TarjetaSemanaDatos
    let marca: MarcaCartel

    var body: some View {
        let recorte = RecorteCartel.recortarSemana(datos.sesiones, conClub: marca.pie != nil)
        SuperficieCartel(marca: marca) {
            TitularCartel(chip: datos.chip, titulo: datos.titulo, marca: marca)
            TiraDiasCartel(dias: datos.dias, marca: marca)

            VStack(alignment: .leading, spacing: 0) {
                CabeceraBloqueCartel(titulo: "Sesiones", pauta: datos.totales, marca: marca)
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(recorte.visibles.enumerated()), id: \.offset) { _, sesion in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(sesion.dia)
                                .font(.system(size: 20, design: .monospaced))
                                .foregroundStyle(TintaCartel.debil)
                                .frame(minWidth: 26, alignment: .leading)
                            Text(sesion.titulo)
                                .font(.system(size: 31, weight: .semibold))
                                .foregroundStyle(TintaCartel.plena)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            if recorte.ocultos > 0 {
                MasCartel(ocultos: recorte.ocultos)
            }
        }
    }
}

/// LOS SIETE DÍAS, la letra dentro del cuadro. Los CINCO estados del plan se
/// pintan sin colapsar los que mentirían: lleno = entrenada, medio lleno =
/// a medias (afirmar «hecha» sería inventar la mitad que no ocurrió), apagado =
/// saltada, aro = descanso, aro débil = todavía por hacer. La tira cuenta la
/// semana que fue — decidir si se comparte es del atleta, no de la tarjeta.
private struct TiraDiasCartel: View {
    let dias: [DiaCartelSemana]
    let marca: MarcaCartel

    var body: some View {
        HStack(spacing: 14) {
            ForEach(Array(dias.enumerated()), id: \.offset) { _, dia in
                cuadro(dia)
            }
        }
    }

    @ViewBuilder
    private func cuadro(_ dia: DiaCartelSemana) -> some View {
        let forma = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Text(dia.letra)
            .font(.system(size: 23, weight: .heavy, design: .monospaced))
            .foregroundStyle(letra(dia.estado))
            .frame(width: 56, height: 56)
            .background(fondo(dia.estado), in: forma)
            .overlay {
                if fondo(dia.estado) == .clear {
                    forma.strokeBorder(borde(dia.estado), lineWidth: 1.5)
                }
            }
    }

    private func fondo(_ estado: EstadoDiaPlan) -> Color {
        switch estado {
        case .hecha: return marca.acentoActivo
        case .parcial: return marca.acentoActivo.opacity(0.45)
        case .saltada: return Color.white.opacity(0.06)
        case .descanso, .pendiente: return .clear
        }
    }

    private func borde(_ estado: EstadoDiaPlan) -> Color {
        estado == .pendiente ? TintaCartel.hairline.opacity(0.6) : TintaCartel.hairline
    }

    private func letra(_ estado: EstadoDiaPlan) -> Color {
        switch estado {
        case .hecha: return marca.sobreAcentoActivo
        case .parcial: return TintaCartel.plena
        case .saltada: return TintaCartel.debil
        case .descanso: return TintaCartel.tenue
        case .pendiente: return TintaCartel.debil
        }
    }
}

// MARK: - Piezas compartidas

/// El lienzo común de las dos tarjetas: fondo, borde, sombra y el pie del club.
private struct SuperficieCartel<Contenido: View>: View {
    let marca: MarcaCartel
    @ViewBuilder let contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            contenido
            if let pie = marca.pie {
                PieDeClubCartel(nombre: pie, acento: marca.acentoActivo)
            }
        }
        .padding(Presupuesto.padding)
        .frame(width: Presupuesto.ancho, alignment: .leading)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 19 / 255, green: 19 / 255, blue: 21 / 255).opacity(0.94),
                    Color(red: 9 / 255, green: 9 / 255, blue: 10 / 255).opacity(0.93),
                ],
                startPoint: .top, endPoint: .bottom
            ),
            in: RoundedRectangle(cornerRadius: 32, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .strokeBorder(Color.white.opacity(0.09), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.5), radius: 35, y: 15)
    }
}

private struct TitularCartel: View {
    let chip: String
    let titulo: String
    let marca: MarcaCartel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // El chip lleno es el primer golpe de marca y el ancla del acento.
            // Inclinado como la display: pertenece a la misma voz que el título.
            Text(chip.uppercased())
                .font(.system(size: 22, weight: .heavy, design: .monospaced).italic())
                .tracking(3)
                .foregroundStyle(marca.sobreAcentoActivo)
                .padding(.horizontal, 18)
                .padding(.top, 7)
                .padding(.bottom, 9)
                .background(marca.acentoActivo, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: -0.105, d: 1, tx: 0, ty: 0))
            // La display itálica pesada EN MAYÚSCULAS es la voz del wordmark, y
            // en una tarjeta pequeña el título es la tarjeta.
            Text(titulo.uppercased())
                .font(.system(size: 60, weight: .black).italic())
                .tracking(-1)
                .foregroundStyle(TintaCartel.plena)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
        }
    }
}

/// Solo en la tarjeta de DESPUÉS: lo que pasó, antes del detalle. Números
/// grandes en blanco — el acento se reserva para la mejor repetición de abajo.
private struct ResultadoCartel: View {
    let filas: [(etiqueta: String, valor: String)]

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 44) {
            ForEach(Array(filas.enumerated()), id: \.offset) { _, fila in
                VStack(alignment: .leading, spacing: 3) {
                    Text(fila.etiqueta.uppercased())
                        .font(.system(size: 17, design: .monospaced))
                        .tracking(2.5)
                        .foregroundStyle(TintaCartel.tenue)
                    Text(fila.valor)
                        .font(.system(size: 48, weight: .black).italic().monospacedDigit())
                        .foregroundStyle(TintaCartel.plena)
                }
            }
        }
    }
}

private struct CabeceraBloqueCartel: View {
    let titulo: String
    let pauta: String?
    let marca: MarcaCartel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(titulo.uppercased())
                    .font(.system(size: 21, weight: .heavy))
                    .tracking(3)
                    .foregroundStyle(TintaCartel.tenue)
                if let pauta {
                    Text(pauta)
                        .font(.system(size: 20, design: .monospaced).monospacedDigit())
                        .foregroundStyle(TintaCartel.debil)
                }
                Spacer(minLength: 0)
            }
            .padding(.bottom, 9)
            Rectangle().fill(TintaCartel.hairline).frame(height: 1)
                .padding(.bottom, 12)
        }
    }
}

private struct BloqueCartelView: View {
    let bloque: BloqueCartelCompartir
    let marca: MarcaCartel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CabeceraBloqueCartel(titulo: bloque.titulo, pauta: bloque.pauta, marca: marca)
            switch bloque.cuerpo {
            case .lista(let lineas):
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(lineas.enumerated()), id: \.offset) { _, linea in
                        FilaListaCartel(linea: linea)
                    }
                }
            case .serie(let reps):
                ParcialesCartel(reps: reps, marca: marca)
            }
        }
    }
}

private struct FilaListaCartel: View {
    let linea: LineaCartel

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 20) {
            Text(linea.nombre)
                .font(.system(size: 31, weight: .semibold))
                .foregroundStyle(TintaCartel.plena)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            if let dato = linea.dato {
                // Lo hecho va a plena tinta — es el dato; la dosis prevista es
                // contexto y va tenue.
                Text(dato)
                    .font(.system(size: 28, weight: .bold, design: .monospaced).monospacedDigit())
                    .foregroundStyle(linea.esHecho ? TintaCartel.plena : TintaCartel.tenue)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
    }
}

/// LOS PARCIALES — cada repetición con una barra detrás proporcional a su
/// tiempo, normalizada al rango real de la tanda (entre 1:22 y 1:28 hay un 7%,
/// invisible a escala absoluta; el suelo del 30% evita que la mejor
/// desaparezca — la barra informa, no engaña: orden y proporciones se
/// conservan). La barra corta es la rápida; la mejor va en acento y se marca
/// sola desde el dato. En dos columnas cuando pasan de cinco.
private struct ParcialesCartel: View {
    let reps: [RepeticionCartel]
    let marca: MarcaCartel

    var body: some View {
        let columnas = Presupuesto.columnasDeSerie(reps.count)
        let tiempos = reps.compactMap(\.segundos)
        let conBarra = tiempos.count == reps.count && reps.count > 1
        let minimo = tiempos.min() ?? 0
        let maximo = tiempos.max() ?? 1
        let mostrarRitmo = reps.contains { $0.etiqueta != nil }

        let grid = [GridItem(.flexible(), spacing: 30, alignment: .leading)]
            + (columnas > 1 ? [GridItem(.flexible(), spacing: 30, alignment: .leading)] : [])

        LazyVGrid(columns: grid, alignment: .leading, spacing: 10) {
            ForEach(Array(reps.enumerated()), id: \.offset) { indice, rep in
                fila(indice: indice, rep: rep, conBarra: conBarra,
                     minimo: minimo, maximo: maximo, mostrarRitmo: mostrarRitmo)
            }
        }
    }

    @ViewBuilder
    private func fila(
        indice: Int, rep: RepeticionCartel, conBarra: Bool,
        minimo: Double, maximo: Double, mostrarRitmo: Bool
    ) -> some View {
        HStack(spacing: 12) {
            Text("\(indice + 1)")
                .font(.system(size: 20, design: .monospaced))
                .foregroundStyle(TintaCartel.debil)
                .frame(minWidth: 24, alignment: .leading)
            if let etiqueta = rep.etiqueta {
                Text(etiqueta)
                    .font(.system(size: 24))
                    .foregroundStyle(TintaCartel.tenue)
            }
            Spacer(minLength: 0)
            Text(rep.valor)
                .font(.system(size: 33, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(rep.mejor ? marca.acentoActivo : TintaCartel.plena)
            if mostrarRitmo, let ritmo = rep.ritmo {
                Text(ritmo)
                    .font(.system(size: 22, design: .monospaced).monospacedDigit())
                    .foregroundStyle(TintaCartel.tenue)
                    .frame(minWidth: 62, alignment: .trailing)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(alignment: .leading) {
            if conBarra, let t = rep.segundos {
                GeometryReader { geo in
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(rep.mejor ? marca.acentoActivo.opacity(0.28) : Color.white.opacity(0.10))
                        .frame(width: geo.size.width * ancho(t, minimo: minimo, maximo: maximo))
                        .padding(.vertical, 4)
                }
            }
        }
    }

    private func ancho(_ t: Double, minimo: Double, maximo: Double) -> CGFloat {
        guard maximo > minimo else { return 0.72 }
        return 0.30 + 0.70 * CGFloat((t - minimo) / (maximo - minimo))
    }
}

private struct MasCartel: View {
    let ocultos: Int

    // NUNCA se recorta en silencio: quien lo ve tiene que saber que hubo más.
    var body: some View {
        Text("+ \(ocultos) más")
            .font(.system(size: 23, design: .monospaced))
            .tracking(1.5)
            .foregroundStyle(TintaCartel.debil)
    }
}

private struct PieDeClubCartel: View {
    let nombre: String
    let acento: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(TintaCartel.hairline).frame(height: 1)
                .padding(.bottom, 18)
            HStack(spacing: 12) {
                Circle().fill(acento).frame(width: 10, height: 10)
                Text(nombre.uppercased())
                    .font(.system(size: 20, weight: .bold))
                    .tracking(2.5)
                    .foregroundStyle(TintaCartel.tenue)
            }
        }
    }
}

// MARK: - La vista que se exporta

/// La tarjeta que sea, lista para renderizar o previsualizar.
struct TarjetaCompartibleView: View {
    let tarjeta: TarjetaCompartible
    let marca: MarcaCartel

    var body: some View {
        switch tarjeta {
        case .entreno(let datos): TarjetaEntrenoView(datos: datos, marca: marca)
        case .semana(let datos): TarjetaSemanaView(datos: datos, marca: marca)
        }
    }
}
