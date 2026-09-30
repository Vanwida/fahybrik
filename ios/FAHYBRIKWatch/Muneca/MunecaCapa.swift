import SwiftUI

// LA CAPA A PANTALLA COMPLETA — lo que se pone SOBRE la página Paso unos
// segundos (`CuadroMuneca.capa`):
//
//   · el 3-2-1 y el GO antes de un paso de trabajo: arriba, a qué entras; en el
//     centro, el número (`kit-reloj/pasos.tsx#TresDosUno`);
//   · el km recién hecho, una tarjeta arriba (`AvisoVuelta`). Sin háptico
//     propio: ya vibró la vuelta.
//
// Cuándo sale y cuándo se va lo decide el núcleo (`cuenta`, `go`, la vigencia del
// aviso de vuelta). Aquí solo se dibuja lo que hay.

struct MunecaCapa: View {
    let capa: Vivo.CapaMuneca

    var body: some View {
        switch capa {
        case let .cuenta(c): MunecaCuenta(cara: c)
        case let .vuelta(a): MunecaAvisoVuelta(aviso: a)
        }
    }
}

/// El 3-2-1 o el GO, a pantalla completa y sobre negro (tapa la página de debajo).
struct MunecaCuenta: View {
    let cara: Vivo.CaraCuenta

    var body: some View {
        MunecaColumna {
            MunecaContexto(linea: cara.contexto)
            if let que = cara.que { MunecaInstruccion(linea: que, tono: MunecaPaleta.tinta2) }
            MunecaCentro { MunecaHeroe(heroe: cara.numero) }
        }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
        .accessibilityElement(children: .combine)
    }
}

/// El km recién cerrado, sobre la página durante unos segundos.
struct MunecaAvisoVuelta: View {
    let aviso: Vivo.AvisoDeVuelta

    var body: some View {
        VStack(spacing: 4) {
            Text(aviso.titulo)
                .font(MunecaTipo.contexto(Vivo.TipoMuneca.contexto))
                .foregroundStyle(MunecaPaleta.tinta2)
            Text(aviso.valor)
                .font(MunecaTipo.fuente(Double(MunecaForma.capaValor), Vivo.escalaMuneca.peso))
                .foregroundStyle(MunecaPaleta.tinta)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(aviso.pie)
                .font(MunecaTipo.nota)
                .foregroundStyle(MunecaPaleta.tinta2)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(RoundedRectangle(cornerRadius: MunecaForma.capaRadio, style: .continuous).fill(MunecaPaleta.superficie2))
        .shadow(color: .black.opacity(0.6), radius: 15, y: 8)
        .padding(.horizontal, CGFloat(Vivo.MedidasMuneca.ladoSafe) + MunecaForma.capaLados)
        .padding(.top, CGFloat(Vivo.MedidasMuneca.arribaSafe) + MunecaForma.capaDesdeArriba)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .allowsHitTesting(false)
        .transition(.opacity.combined(with: .move(edge: .top)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(aviso.titulo), \(aviso.valor), \(aviso.pie)")
    }
}
