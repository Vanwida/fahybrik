import SwiftUI

// Dobles · entrenar a la vez / opcional (screen 3). The SAME session with
// per-athlete load — each column resolved over that athlete's own 1RM — plus
// "do it together / on my own" actions. Both results stay visible to both
// athletes and the coach.
//
// Faithful to design_handoff_fhp/App Atleta - Dobles.dc.html screen 3, mapped to
// our system: SELF = brand orange (Theme.Color.accent), PARTNER = blue
// (Theme.Color.partner). The handoff's "Hacerla juntos" primary CTA was blue
// (the partner color); in our system the primary action is brand orange and the
// "Por mi cuenta" secondary stays neutral. Never red-as-brand.
//
// Composes the shared Dobles atoms from DoblesPlanView.swift (DoblesAthleteAvatar).
//
// Data: DoblesService.fetchTrainTogether hits GET /api/athlete/dobles/session/{id},
// which resolves each "% RM" line over THAT athlete's own 1RM and returns the
// per-athlete loads. When there's no session id, no linked partner, or the
// assignment isn't found, the fetch returns nil and we show an honest empty
// state — we NEVER fabricate either athlete's resolved loads. The dual-load
// table renders only on real backend-resolved data.
struct DoblesTrainTogetherView: View {
    /// The session to load (nil renders the empty state).
    var sessionId: String? = nil
    var bearer: String? = nil

    @State private var session: DoblesTrainTogetherSession? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    @State private var appear = false
    // Logging launchers — both run the SAME workout flow (brief → active →
    // summary) via WorkoutContainer for THIS athlete's assignment (sessionId).
    // "Hacerla juntos" logs against the joint endpoint (links partner + shares);
    // "Por mi cuenta" against the standard solo path. No parallel logging UI.
    @State private var showJointWorkout = false
    @State private var showSoloWorkout = false

    private var effectiveBearer: String? {
        bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    private var selfName: String { session?.selfName ?? "Yo" }
    private var partnerName: String { session?.partnerName ?? partner?.firstName ?? "Compañero" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                    .staggerReveal(appear, index: 0)

                if loading {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Theme.Spacing.xxl)
                } else if let session {
                    content(session)
                } else {
                    RedesignEmptyState(
                        symbol: "figure.strengthtraining.traditional",
                        title: "Sin sesión conjunta",
                        message: "Cuando tu coach programe una sesión que podéis hacer juntos verás aquí la carga de cada uno, resuelta sobre vuestro propio 1RM."
                    )
                    .padding(.top, Theme.Spacing.xl)
                    .staggerReveal(appear, index: 1)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .instrumentCanvas()
        .navigationTitle("Entrenar a la vez")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showJointWorkout) {
            if let sessionId {
                WorkoutContainer(
                    assignmentId: sessionId,
                    fallbackTitle: session?.title,
                    bearer: effectiveBearer,
                    logTarget: .doublesJoint,
                    onClose: { showJointWorkout = false },
                    onCompleted: { _ in showJointWorkout = false }
                )
            }
        }
        .fullScreenCover(isPresented: $showSoloWorkout) {
            if let sessionId {
                WorkoutContainer(
                    assignmentId: sessionId,
                    fallbackTitle: session?.title,
                    bearer: effectiveBearer,
                    logTarget: .solo,
                    onClose: { showSoloWorkout = false },
                    onCompleted: { _ in showSoloWorkout = false }
                )
            }
        }
        .task(id: effectiveBearer) {
            loading = true
            if let bearer = effectiveBearer {
                partner = try? await PartnerService.fetchPartner(bearer: bearer)
            }
            session = await DoblesService.fetchTrainTogether(sessionId: sessionId, bearer: effectiveBearer)
            loading = false
            withAnimation { appear = true }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "person.2")
                    .font(.system(size: 10, weight: .semibold))
                Text("Podéis hacerla juntos o cada uno")
                    .font(.system(size: 10, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )

            Text(session?.title ?? "Entrenar a la vez")
                .scaledFont(23, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            if let subtitle = session?.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ s: DoblesTrainTogetherSession) -> some View {
        // Per-athlete 1RM reference chips.
        if s.selfOneRm != nil || s.partnerOneRm != nil {
            HStack(spacing: Theme.Spacing.m) {
                oneRmChip(name: selfName, ref: s.selfOneRm, color: Theme.Color.accent, initials: "Yo")
                oneRmChip(name: partnerName, ref: s.partnerOneRm, color: Theme.Color.partner, initials: partner?.initials ?? "·")
            }
            .staggerReveal(appear, index: 1)
        }

        // Dual-load exercise table.
        if !s.exercises.isEmpty {
            loadTable(s.exercises)
                .staggerReveal(appear, index: 2)
        } else {
            RedesignEmptyState(
                symbol: "list.bullet.rectangle",
                title: "Sin ejercicios",
                message: "Esta sesión aún no tiene ejercicios prescritos."
            )
            .padding(.top, Theme.Spacing.l)
            .staggerReveal(appear, index: 2)
        }

        // Results-shared note.
        HStack(spacing: 8) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.partner)
            Text("Cuando termináis, los dos resultados quedan visibles para ambos y para el coach")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .background(Theme.Color.partner.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.partner.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .staggerReveal(appear, index: 3)

        // Together / on-my-own actions. Primary = brand orange. Both launch the
        // real workout flow for THIS athlete's assignment; only the final submit
        // differs (joint endpoint vs solo). Disabled without a resolvable session.
        VStack(spacing: Theme.Spacing.s) {
            ExpertPrimaryButton(title: "▶ Hacerla juntos", height: 50, enabled: sessionId != nil) {
                guard sessionId != nil else { return }
                Haptics.medium()
                showJointWorkout = true
            }
            Button {
                guard sessionId != nil else { return }
                Haptics.light()
                showSoloWorkout = true
            } label: {
                Text("Por mi cuenta")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Theme.Color.surfaceElevated)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                            .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
        }
        .staggerReveal(appear, index: 4)
    }

    // MARK: - 1RM reference chip

    private func oneRmChip(name: String, ref: String?, color: Color, initials: String) -> some View {
        HStack(spacing: 8) {
            DoblesAthleteAvatar(initials: initials, color: color, size: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Text(ref ?? "1RM —")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(color.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), \(ref ?? "1RM no disponible")")
    }

    // MARK: - Dual-load table

    private func loadTable(_ rows: [DoblesExerciseRow]) -> some View {
        VStack(spacing: 0) {
            // Header row.
            HStack(spacing: 0) {
                Text("Ejercicio · S×R")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(Theme.Color.faint)
                Text(selfName)
                    .frame(width: 70, alignment: .leading)
                    .foregroundStyle(Theme.Color.accentText)
                Text(partnerName)
                    .frame(width: 70, alignment: .leading)
                    .foregroundStyle(Theme.Color.partner)
                    .lineLimit(1)
            }
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Theme.Color.surfaceSunken)

            ForEach(rows) { row in
                Hairline()
                HStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Text(row.exercise)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        if let sr = row.setsReps, !sr.isEmpty {
                            Text(sr)
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundStyle(Theme.Color.faint)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.selfLoad ?? "—")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 70, alignment: .leading)
                    Text(row.partnerLoad ?? "—")
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 70, alignment: .leading)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.exercise) \(row.setsReps ?? ""), \(selfName) \(row.selfLoad ?? "—"), \(partnerName) \(row.partnerLoad ?? "—")")
            }
        }
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }
}
