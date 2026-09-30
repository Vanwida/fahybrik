import Foundation

// EL RELEVO DE DOBLES EN LA MUÑECA — la estación de tu pareja (espejo de `watch-dobles`). Tú esperas y recuperas:
// el héroe es lo que llevas esperando y nada lo cuenta hacia atrás, porque nadie mide a tu pareja (ni el reloj ni el
// móvil), así que no se promete una salida. El relevo lo declaras tú con la acción del momento.
//
// Es un paso propio del plan (`pasoRelevo`), sin trabajo tuyo a su alrededor: por eso `familiaMuneca` lo dice antes de
// mirar el bloque. Monocromo: es un descanso (P6). El turno de tus propias estaciones (te toca, con tu pareja) va en
// el contexto de la cara de circuito.

extension Vivo {

    static func caraRelevo(_ e: EstadoVivo, _ l: Lecturas, _ m: MedidasMuneca, accion: FilaDeAccion) -> CaraPaso {
        let p = e.paso
        var d = PartesDeCara(contexto: ["Dobles", p.dobles.map(textoTurno) ?? "relevo"], heroe: heroeRelevo(l))
        d.titulo = p.nombre
        d.bajo = notaRelevo
        d.luego = e.siguiente.map { ("Luego entras ·", textoViene($0)) }
        d.accion = clavePorDefecto(p)?.rawValue
        d.pulso = pulsoMonocromo(p, l, e)
        return caraDeFamilia(d, m, accion: accion)
    }
}
