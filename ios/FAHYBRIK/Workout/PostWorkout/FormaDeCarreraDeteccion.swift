import Foundation

// LA DETECCIÓN — la mitad de `FormaDeCarrera` que trabaja sin fronteras dadas.
//
// Vive aparte de la lectura por una razón práctica: la lectura es la LEY (quién
// es el sujeto) y se lee de un tirón; esto es el instrumento que le da los tramos
// cuando nadie los cerró. Mismo fichero de origen (`tramos.ts`), mismo módulo,
// misma tanda de pruebas.
//
// LO QUE PONE LAS FRONTERAS ES EL RITMO, Y SÓLO EL RITMO. La FC no: llega con
// 20-30 s de retraso (el corazón tarda en subir y tarda más en bajar), así que un
// detector que segmente por pulso coloca todas las fronteras tarde y alarga los
// fuertes a costa de los suaves. La FC sirve para CORROBORAR que un tramo fue de
// verdad — nunca para decidir dónde empieza.

extension FormaDeCarrera {

    /// Disparador de Schmitt sobre el ritmo suavizado.
    static func desdeMuestras(_ muestras: [Muestra]) -> Crudos {
        guard !muestras.isEmpty else { return .sinResolver(.sinSerie) }

        let orden = muestras.sorted { $0.t < $1.t }
        guard let primera = orden.first, let ultima = orden.last else {
            return .sinResolver(.muestrasEscasas)
        }
        let span = (ultima.t - primera.t) / 60
        guard orden.count >= Umbral.minMuestras,
              span > 0,
              Double(orden.count) / span >= Umbral.minDensidadPorMin else {
            return .sinResolver(.muestrasEscasas)
        }

        // Cada muestra cubre hasta la siguiente; la última hereda el hueco anterior.
        var dts: [Double] = (0..<orden.count).map { i in
            i + 1 < orden.count ? orden[i + 1].t - orden[i].t : 0
        }
        dts[dts.count - 1] = dts.count >= 2 ? dts[dts.count - 2] : 1

        // Suavizado por mediana móvil, con los `parado` fuera del cálculo para que
        // un semáforo no arrastre el ritmo de sus vecinos.
        let corriendo = orden.map { m in
            if let r = m.ritmoSkm { return r <= Umbral.ritmoParadoSkm }
            return false
        }
        let media = Umbral.ventanaMedianaS / 2
        let suavizado: [Double?] = orden.enumerated().map { i, m in
            guard corriendo[i] else { return nil }
            var pool: [Double] = []
            for j in 0..<orden.count where corriendo[j] && abs(orden[j].t - m.t) <= media {
                if let r = orden[j].ritmoSkm { pool.append(r) }
            }
            return pool.isEmpty ? m.ritmoSkm : mediana(pool)
        }

        let validos = suavizado.compactMap { $0 }
        guard validos.count >= Umbral.minMuestras else { return .sinResolver(.muestrasEscasas) }

        // LA REFERENCIA SALE DE LOS DOS CENTROS, NO DE LA MEDIANA.
        //
        // Y esto costó un rediseño: con la mediana, un fartlek en el que lo fuerte
        // es minoría del tiempo (que son todos — 8×1' fuerte contra 7×1'30" suave
        // más el calentamiento) deja la referencia clavada SOBRE el modo suave. El
        // disparador entra en fuerte y ya no puede salir, porque para volver
        // tendría que superar un umbral más lento que la propia recuperación.
        // Salía una carrera de un solo tramo — otra vez el promedio, por la puerta
        // de atrás.
        //
        // «Encontrar las dos intensidades» es un problema de dos grupos, así que
        // se resuelve como tal, y la frontera cae siempre ENTRE ellas sea cual sea
        // el reparto de tiempo. En un rodaje los dos centros convergen, la banda se
        // queda en su suelo y el contraste no llega a umbral: uniforme, como debe.
        let (centroFuerte, centroSuave) = dosCentros(validos)
        let referencia = (centroFuerte + centroSuave) / 2
        let banda = max(Umbral.bandaMinSkm, (centroSuave - centroFuerte) / 4)

        // Disparador de Schmitt: hay que cruzar 2·banda entera para cambiar de
        // estado, así que en la frontera no puede haber temblor. `parado` no cambia
        // el estado: al arrancar de nuevo se sigue donde se estaba hasta que el
        // ritmo diga otra cosa.
        var estado: TipoTramo = (validos.first ?? referencia) < referencia ? .fuerte : .suave
        let etiquetas: [TipoTramo] = suavizado.map { r in
            guard let r else { return .parado }
            if estado == .suave, r < referencia - banda { estado = .fuerte }
            else if estado == .fuerte, r > referencia + banda { estado = .suave }
            return estado
        }

        let bruto = agrupar(orden: orden, dts: dts, etiquetas: etiquetas, suavizado: suavizado)
        let tramos = numerar(fundir(absorber(bruto)))
        return .resuelto(tramos: tramos, certeza: certezaDe(tramos, densidadPorMin: Double(orden.count) / span))
    }

    // MARK: - Certeza

    /// DETECTADO O ESTIMADO — la diferencia va escrita en la pantalla, así que
    /// tiene que salir de algo, no del optimismo.
    ///
    /// Se miran las tres cosas que pueden hacer inventar una frontera:
    ///
    ///  · **La separación.** Un fartlek de verdad son 60-90 s/km entre lo fuerte y
    ///    lo suave. Una progresión suelta son 20-30, y ahí la frontera existe pero
    ///    es discutible. Se compara en s/km y no contra la banda: la banda se
    ///    deriva de la propia separación, así que ese cociente vale casi siempre
    ///    lo mismo y no informa de nada.
    ///  · **La cobertura.** Si media carrera acabó en `parado`, lo que quede no es
    ///    una lectura de la carrera.
    ///  · **La densidad.** Una muestra cada 10 s resuelve un tramo de 30; una cada
    ///    20, no — se ve la mitad de las fronteras y se cree que hay la mitad de
    ///    repeticiones.
    static func certezaDe(_ tramos: [Tramo], densidadPorMin: Double) -> Certeza {
        let fuertes = conRitmo(tramos, .fuerte)
        let suaves = conRitmo(tramos, .suave)
        let contraste = (!fuertes.isEmpty && !suaves.isEmpty)
            ? ritmoDe(suaves).ritmoSkm - ritmoDe(fuertes).ritmoSkm
            : 0

        let total = tramos.reduce(0) { $0 + $1.duracionS }
        let cubierto = tramos.filter { $0.tipo != .parado }.reduce(0) { $0 + $1.duracionS }

        let limpia = contraste >= Umbral.contrasteLimpioSkm
            && total > 0
            && cubierto / total >= Umbral.coberturaLimpia
            && densidadPorMin >= Umbral.densidadLimpiaPorMin
        return limpia ? .detectados : .estimados
    }

    // MARK: - De etiquetas a tramos

    /// Un tramo a medio hacer: acumula tiempo y distancia para poder sacar su
    /// ritmo exacto al final.
    struct Bruto {
        var tipo: TipoTramo
        var desdeS: Double
        var hastaS: Double
        var duracionS: Double
        var distanciaM: Double
    }

    static func agrupar(orden: [Muestra],
                        dts: [Double],
                        etiquetas: [TipoTramo],
                        suavizado: [Double?]) -> [Bruto] {
        var out: [Bruto] = []
        for (i, tipo) in etiquetas.enumerated() {
            let dt = dts[i]
            let r = suavizado[i]
            if out.isEmpty || out[out.count - 1].tipo != tipo {
                out.append(Bruto(tipo: tipo,
                                 desdeS: orden[i].t,
                                 hastaS: orden[i].t + dt,
                                 duracionS: dt,
                                 distanciaM: r.map { (dt / $0) * 1000 } ?? 0))
                continue
            }
            out[out.count - 1].hastaS = orden[i].t + dt
            out[out.count - 1].duracionS += dt
            if let r { out[out.count - 1].distanciaM += (dt / r) * 1000 }
        }
        return out
    }

    /// Lo que dura menos que `Umbral.minTramoS` no es un tramo: se lo come el
    /// vecino. Es lo que impide que un adelanto de diez segundos parta un rodaje
    /// en tres.
    static func absorber(_ brutos: [Bruto]) -> [Bruto] {
        var out: [Bruto] = []
        for b in brutos {
            if b.duracionS >= Umbral.minTramoS || out.isEmpty {
                out.append(b)
                continue
            }
            out[out.count - 1].hastaS = b.hastaS
            out[out.count - 1].duracionS += b.duracionS
            out[out.count - 1].distanciaM += b.distanciaM
        }
        // El primero también puede ser demasiado corto, y ahí el vecino es el
        // siguiente.
        while out.count > 1 && out[0].duracionS < Umbral.minTramoS {
            let corto = out[0]
            out[1].desdeS = corto.desdeS
            out[1].duracionS += corto.duracionS
            out[1].distanciaM += corto.distanciaM
            out.removeFirst()
        }
        return out
    }

    /// Absorber deja vecinos del mismo tipo pegados: se funden en uno.
    static func fundir(_ brutos: [Bruto]) -> [Bruto] {
        var out: [Bruto] = []
        for b in brutos {
            if !out.isEmpty, out[out.count - 1].tipo == b.tipo {
                out[out.count - 1].hastaS = b.hastaS
                out[out.count - 1].duracionS += b.duracionS
                out[out.count - 1].distanciaM += b.distanciaM
            } else {
                out.append(b)
            }
        }
        return out
    }

    static func numerar(_ brutos: [Bruto]) -> [Tramo] {
        var orden: [TipoTramo: Int] = [.fuerte: 0, .suave: 0, .parado: 0]
        return brutos.map { b in
            orden[b.tipo, default: 0] += 1
            return Tramo(
                tipo: b.tipo,
                desdeS: b.desdeS.rounded(),
                hastaS: b.hastaS.rounded(),
                duracionS: b.duracionS.rounded(),
                ritmoSkm: (b.tipo != .parado && b.distanciaM > 0) ? (b.duracionS / b.distanciaM) * 1000 : nil,
                orden: orden[b.tipo] ?? 1
            )
        }
    }

    // MARK: - Utilidades de estadística

    static func mediana(_ xs: [Double]) -> Double {
        let s = xs.sorted()
        let m = s.count / 2
        return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
    }

    static func percentil(_ xs: [Double], _ p: Double) -> Double {
        let s = xs.sorted()
        let i = Int((Double(s.count - 1) * p).rounded())
        return s[min(s.count - 1, max(0, i))]
    }

    /// Los dos centros de la distribución de ritmos: (el rápido, el lento).
    ///
    /// Lloyd de dos grupos en una dimensión, arrancando en los percentiles 10 y 90
    /// para que la partida no dependa del orden de las muestras y el resultado sea
    /// el mismo aquí y en el doble.
    static func dosCentros(_ xs: [Double]) -> (Double, Double) {
        var a = percentil(xs, 0.1)
        var b = percentil(xs, 0.9)
        for _ in 0..<Umbral.vueltasLloyd {
            let corte = (a + b) / 2
            let bajos = xs.filter { $0 <= corte }
            let altos = xs.filter { $0 > corte }
            // Un grupo vacío significa que no hay dos poblaciones: se deja como está.
            if bajos.isEmpty || altos.isEmpty { break }
            let na = bajos.reduce(0, +) / Double(bajos.count)
            let nb = altos.reduce(0, +) / Double(altos.count)
            let quieto = abs(na - a) < 0.01 && abs(nb - b) < 0.01
            a = na
            b = nb
            if quieto { break }
        }
        return (min(a, b), max(a, b))
    }
}
