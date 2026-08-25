import SwiftUI
import UIKit

// PEGATINA DE SERIES — recorte del recap, para una esquina del vídeo.
// Card 132. Sin marca. Sin día. Sin Meta. Los números ya vienen de
// `RecapLayout.projectSeriesSticker`.

struct PegatinaSeriesView: View {
    let sticker: RecapSeriesSticker

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(sticker.label)
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 8)
                if let pauta = sticker.pauta {
                    Text(pauta)
                        .scaledFont(13, weight: .semibold, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            ParcialesDeSerie(serie: sticker)
        }
        .padding(14)
        .background(Theme.Color.surface.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .frame(maxWidth: CGFloat(RecapLayout.stickerAncho))
        .accessibilityIdentifier("pegatina-series")
    }
}

enum PegatinaSeriesRender {
    @MainActor
    static func png(_ sticker: RecapSeriesSticker) -> Data? {
        let renderer = ImageRenderer(content:
            PegatinaSeriesView(sticker: sticker)
                .frame(width: CGFloat(RecapLayout.stickerAncho))
        )
        renderer.scale = 3
        return renderer.uiImage?.pngData()
    }
}
