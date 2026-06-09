import SwiftUI

// MARK: - Exercise detail sheet
//
// Opened from a tapped `WorkoutItemRow` inside the session detail. Shows the
// exercise's in-app YouTube demo (never Safari), its prescribed params for
// this block, cues and long-form description.
//
// Honest empties: no video → no player (no fake placeholder); no
// cues/description → that section is simply absent. The exercise description
// (`exerciseDescription`) is not yet shipped by the assignment-detail backend
// — it decodes nil and this view degrades to cues-only until it lands.

struct ExerciseDetailView: View {
    let item: WorkoutItem

    @Environment(\.dismiss) private var dismiss

    private var videoId: String? {
        guard let url = item.exerciseVideoUrl else { return nil }
        return YouTubeLinkParser.videoId(from: url)
    }

    private var paramsSummary: String? {
        WorkoutItemParamsFormatter.summary(item.paramsJson, category: item.exerciseCategory)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        header

                        if let videoId {
                            YouTubeEmbedView(videoId: videoId)
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                                .accessibilityLabel("Vídeo demostración de \(item.exerciseName)")
                        }

                        if let summary = paramsSummary {
                            section(title: "PRESCRIPCIÓN") {
                                MonoText(text: summary, size: 15, color: Theme.Color.foreground)
                            }
                        }

                        if let cues = item.cues, !cues.isEmpty {
                            section(title: "CONSEJOS") {
                                Text(cues)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                        }

                        if let description = item.exerciseDescription, !description.isEmpty {
                            section(title: "DESCRIPCIÓN") {
                                Text(description)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.foreground)
                            }
                        }

                        if let notes = item.notes, !notes.isEmpty {
                            section(title: "NOTA DE PABLO") {
                                Text(notes)
                                    .scaledFont(14, relativeTo: .subheadline)
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            CategoryTag(category: item.exerciseCategory)
            Text(item.exerciseName)
                .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: title, color: Theme.Color.accent)
            content()
        }
    }
}
