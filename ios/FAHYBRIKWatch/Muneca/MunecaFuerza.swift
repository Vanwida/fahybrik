import SwiftUI

// LAS CARAS DE FUERZA DE LA MUÑECA — la serie, el «Colócate» y el descanso que anota
// (`Vivo.CaraSerie`, `CaraColocate`, `CaraAnotar`). Espejo de `screens/reloj-fuerza/`.
// Ninguna decide nada: el núcleo ya trae el nombre medido, qué filas hay, el héroe a su
// talla y cada dato de la anotación con su estado. Aquí solo se dibuja.
//
// Anotar: tocar un dato lo enciende (borde naranja = control activo) y la corona lo gira
// (`MunecaCorona`); gris = propuesto, «sin confirmar»; blanco = declarado.

// MARK: - El nombre del ejercicio

/// El nombre del ejercicio, primero: una línea si cabe bajo las esquinas, o dos. El hueco de la
/// superserie («A1 ·») va delante y en tinta2.
struct MunecaNombre: View {
    let nombre: Vivo.NombreMedido

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(nombre.lineas.enumerated()), id: \.offset) { k, linea in
                texto(linea, primera: k == 0)
                    .font(MunecaTipo.fuente(nombre.cuerpo, 600))
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(nombre.cuerpo))
                    .frame(maxWidth: CGFloat(k == 0 ? medidas.anchoCabeza : medidas.anchoUtil) * CGFloat(Vivo.TipoMuneca.holguraEstima))
            }
        }
        .frame(height: CGFloat(nombre.alto))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(nombre.lineas.joined(separator: " "))
    }

    private func texto(_ linea: String, primera: Bool) -> Text {
        guard primera, let slot = nombre.slot, linea.hasPrefix("\(slot) · ") else { return Text(linea).foregroundStyle(MunecaPaleta.tinta) }
        let resto = String(linea.dropFirst(slot.count + 3))
        return Text("\(Text("\(slot) · ").foregroundStyle(MunecaPaleta.tinta2))\(Text(resto).foregroundStyle(MunecaPaleta.tinta))")
    }
}

// MARK: - La serie

struct MunecaSerie: View {
    let cara: Vivo.CaraSerie

    var body: some View {
        MunecaColumna {
            MunecaNombre(nombre: cara.nombre)
            MunecaContexto(linea: cara.posicion, tono: MunecaPaleta.tinta2)
            MunecaCentro { MunecaHeroe(heroe: cara.heroe) }
            if let carga = cara.carga { MunecaInstruccion(linea: carga) }
            if let esfuerzo = cara.esfuerzo { MunecaContexto(linea: esfuerzo) }
            if let cue = cara.cue { MunecaNota(nota: cue) }
            MunecaNota(nota: cara.pista)
            if let luego = cara.luego { MunecaNota(nota: luego, tono: MunecaPaleta.tinta) }
        }
    }
}

// MARK: - Colócate

struct MunecaColocate: View {
    let cara: Vivo.CaraColocate

    var body: some View {
        MunecaColumna {
            MunecaContexto(linea: cara.contexto)
            MunecaNombre(nombre: cara.nombre)
            MunecaContexto(linea: cara.dosis, tono: MunecaPaleta.tinta2)
            MunecaCentro { MunecaHeroe(heroe: cara.heroe) }
            MunecaNota(nota: cara.pista)
            if let pulso = cara.pulso { MunecaLinea(linea: pulso) }
        }
    }
}

// MARK: - Lo que viene, en una línea o en dos

/// «Viene: B1 · Deadlift» y debajo «4 × 8 · RIR 3»; en una línea si cabe entera. Nunca partida por la mitad.
struct MunecaViene: View {
    let viene: Vivo.VieneMuneca

    var body: some View {
        VStack(spacing: 0) {
            if viene.enUna {
                linea(cabeza + Text(viene.que + (viene.dosis.map { " · \($0)" } ?? "")).foregroundStyle(MunecaPaleta.tinta))
            } else {
                linea(cabeza + Text(viene.que).foregroundStyle(MunecaPaleta.tinta))
                if let dosis = viene.dosis { linea(Text(dosis).foregroundStyle(MunecaPaleta.tinta)) }
            }
        }
        .frame(height: CGFloat(viene.alto))
        .frame(maxWidth: .infinity)
    }

    private var cabeza: Text { Text("Viene: ").foregroundStyle(MunecaPaleta.tinta2) }

    private func linea(_ t: Text) -> some View {
        t.font(MunecaTipo.nota)
            .lineLimit(1)
            .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.nota))
            .frame(maxWidth: .infinity)
            .frame(height: CGFloat(Vivo.Fila.nota.alto))
    }
}

// MARK: - Anotar en el descanso

/// El descanso mientras se anota: «Descanso · 1:12» arriba, los datos de la serie (o de la ronda) en medio y, abajo,
/// «+30 s» y «Confirmar».
struct MunecaAnotarCara: View {
    let cara: Vivo.CaraAnotar
    let anotar: MunecaAnotar?
    var alMas30: (() -> Void)?
    var alPrimaria: () -> Void

    var body: some View {
        MunecaColumna {
            MunecaContexto(linea: cara.contexto)
            MunecaCentro {
                switch cara.cuerpo {
                case let .columnas(c): columnas(c)
                case let .lista(l): lista(l)
                }
            }
            MunecaBotonesDescanso(acciones: cara.acciones, alMas30: alMas30, alPrimaria: alPrimaria)
        }
    }

    private func columnas(_ c: Vivo.ColumnasAnotar) -> some View {
        VStack(spacing: 5) {
            MunecaNota(nota: c.titulo)
            HStack(spacing: 4) {
                ForEach(c.columnas, id: \.campo) { col in columna(col) }
            }
            if let pista = c.pista { MunecaNota(nota: pista, tono: MunecaPaleta.tinta) }
            else if let viene = c.viene { MunecaViene(viene: viene) }
        }
    }

    private func columna(_ c: Vivo.ColumnaAnotar) -> some View {
        Button { anotar?.enfocar(c.campo) } label: {
            VStack(spacing: 4) {
                Text(c.valor)
                    .font(MunecaTipo.fuente(c.cuerpo, 600))
                    .foregroundStyle(c.estado == .propuesto ? MunecaPaleta.tinta2 : MunecaPaleta.tinta)
                    .lineLimit(1)
                Text(c.etiqueta)
                    .font(MunecaTipo.nota)
                    .foregroundStyle(MunecaPaleta.tinta2)
                    .lineLimit(1)
            }
            .frame(width: CGFloat(c.ancho), height: MunecaForma.altoColumna)
            .background(RoundedRectangle(cornerRadius: MunecaForma.radioColumna, style: .continuous).fill(WatchTheme.hex(Vivo.C.superficie)))
            .overlay(RoundedRectangle(cornerRadius: MunecaForma.radioColumna, style: .continuous)
                .stroke(c.activa ? MunecaPaleta.accion : .clear, lineWidth: MunecaForma.bordeActivo))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(c.etiqueta) \(c.valor)\(c.estado == .propuesto ? ", sin confirmar" : "")")
        .accessibilityAddTraits(c.activa ? .isSelected : [])
    }

    private func lista(_ l: Vivo.ListaAnotar) -> some View {
        VStack(spacing: 4) {
            MunecaNota(nota: l.titulo)
            ForEach(Array(l.pildoras.enumerated()), id: \.offset) { _, p in
                MunecaPildora(pildora: p) { anotar?.abrir(p.abre) }
            }
            if let viene = l.viene { MunecaViene(viene: viene) }
        }
    }
}

/// Una serie en una píldora (≥ 32 pt): se toca para abrirla.
struct MunecaPildora: View {
    let pildora: Vivo.PildoraAnotar
    var alPulsar: () -> Void

    var body: some View {
        Button(action: alPulsar) {
            HStack(spacing: 8) {
                if let slot = pildora.slot { Text(slot).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2) }
                Text(pildora.texto)
                    .font(MunecaTipo.boton)
                    .foregroundStyle(pildora.hecha ? MunecaPaleta.tinta : MunecaPaleta.tinta2)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(17))
                MunecaMarca(hecha: pildora.hecha)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: MunecaForma.anchoPildora, minHeight: CGFloat(Vivo.alturaDeHueco), maxHeight: CGFloat(Vivo.alturaDeHueco))
            .background(Capsule().fill(MunecaPaleta.superficie2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(pildora.slot ?? "") \(pildora.texto), \(pildora.hecha ? "anotada" : "sin confirmar")")
    }
}

/// ✓ declarada (en tinta) o aro hueco sin confirmar (en tinta2). Monocromo: el verde es de una zona.
struct MunecaMarca: View {
    let hecha: Bool

    var body: some View {
        Group {
            if hecha {
                Image(systemName: "checkmark").font(.system(size: MunecaForma.marcaTalla, weight: .bold)).foregroundStyle(MunecaPaleta.tinta)
            } else {
                Circle().stroke(MunecaPaleta.tinta2, lineWidth: MunecaForma.contornoMarca)
                    .frame(width: MunecaForma.marcaTalla - 4, height: MunecaForma.marcaTalla - 4)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - «+30 s» y la acción del momento

/// La fila de abajo de todo descanso: «+30 s» y la acción del momento en naranja.
struct MunecaBotonesDescanso: View {
    let acciones: [Vivo.AccionDeCara]
    var alMas30: (() -> Void)?
    var alPrimaria: () -> Void

    var body: some View {
        HStack(spacing: MunecaForma.huecoBotones) {
            ForEach(acciones, id: \.rawValue) { accion in
                if accion == .mas30s {
                    if let alMas30 {
                        MunecaBoton(titulo: accion.rawValue, variante: .superficie, accion: alMas30)
                            .frame(minWidth: MunecaForma.anchoMas30Minimo, maxWidth: MunecaForma.anchoMas30)
                    }
                } else {
                    MunecaBoton(titulo: accion.rawValue, accion: alPrimaria)
                        .frame(maxWidth: MunecaForma.anchoEmpezarYa)
                        .layoutPriority(1)
                }
            }
        }
        .padding(.horizontal, 4)
        .frame(height: CGFloat(Vivo.Fila.boton.alto))
    }
}
