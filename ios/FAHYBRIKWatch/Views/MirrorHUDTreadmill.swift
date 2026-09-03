import SwiftUI

// Indoor-run belt glance. Same frame-pushed belt meters as before; extracted
// so MirrorHUDView stays under 500 lines.
extension MirrorHUDView {
    func treadmillContent(_ f: MirrorStateFrame, covered: Double, target: Double?) -> some View {
        LiveScaffold(status: f.blockTitle) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                treadmillHero(f, now: context.date, covered: covered, target: target)
            }
        } bottom: {
            advanceButton
        }
    }

    func treadmillHero(_ f: MirrorStateFrame, now: Date,
                       covered: Double, target: Double?) -> some View {
        let lectura = lecturaDeCinta(f, now: now)
        return VStack(spacing: 6) {
            if let line = f.lineTitle {
                Text(line)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(WatchTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            WatchLabel(text: lectura.etiqueta)
            GiantNumber(text: lectura.texto, size: 46, unit: lectura.unidad)
            beltProgressBar(covered: covered, target: target)
            WatchLabel(text: beltDistanceLabel(covered: covered, target: target))
            hrZoneRow
        }
    }

    func lecturaDeCinta(_ f: MirrorStateFrame, now: Date) -> (etiqueta: String, texto: String, unidad: String?) {
        guard let ritmo = f.beltPaceSecPerKm else {
            return (Vocab.tiempo, WatchFormat.clock(f.lapElapsed + sinceFrame(now)), nil)
        }
        return (Vocab.ritmo, WatchFormat.pace(ritmo), Formato.UnidadRitmo.porKm.rawValue)
    }

    func beltDistanceLabel(covered: Double, target: Double?) -> String {
        guard let target, target > 0 else { return beltDistance(covered, km: covered >= 1000) }
        let km = target >= 1000
        return "\(beltDistance(covered, km: km)) / \(beltDistance(target, km: km))"
    }

    func beltDistance(_ meters: Double, km: Bool) -> String {
        km ? (Formato.distanciaCubierta(meters) ?? "0 m") : "\(Int(meters.rounded())) m"
    }

    @ViewBuilder
    func beltProgressBar(covered: Double, target: Double?) -> some View {
        if let target, target > 0 {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(WatchTheme.surfaceRaised)
                    Capsule().fill(WatchTheme.orange)
                        .frame(width: geo.size.width * min(1, max(0, covered / target)))
                }
            }
            .frame(height: 8)
        }
    }
}
