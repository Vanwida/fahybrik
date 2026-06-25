import SwiftUI

struct DataCell: View {
    let label: String
    let value: String
    var emphasis: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text(value)
                .font(Theme.Typography.dataDigit)
                .foregroundStyle(emphasis ?? Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Color.surface)
    }
}

struct DataGrid2x2: View {
    let topLeft: (label: String, value: String, color: Color?)
    let topRight: (label: String, value: String, color: Color?)
    let bottomLeft: (label: String, value: String, color: Color?)
    let bottomRight: (label: String, value: String, color: Color?)

    var body: some View {
        VStack(spacing: 1) {
            HStack(spacing: 1) {
                DataCell(label: topLeft.label, value: topLeft.value, emphasis: topLeft.color)
                DataCell(label: topRight.label, value: topRight.value, emphasis: topRight.color)
            }
            HStack(spacing: 1) {
                DataCell(label: bottomLeft.label, value: bottomLeft.value, emphasis: bottomLeft.color)
                DataCell(label: bottomRight.label, value: bottomRight.value, emphasis: bottomRight.color)
            }
        }
        .background(Theme.Color.hairlineStrong)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }
}
