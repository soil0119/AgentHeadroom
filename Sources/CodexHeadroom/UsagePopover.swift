import CodexHeadroomCore
import SwiftUI

struct UsagePopover: View {
    @ObservedObject var model: UsageModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if let summary = model.summary {
                ForEach(summary.limits) { limit in
                    limitSection(limit)
                }
            } else if model.isRefreshing {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Codex 사용량을 불러오는 중…")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            }

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()
            footer
        }
        .padding(16)
        .frame(width: 340)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("CodexHeadroom")
                    .font(.headline)
                Text("남은 사용량")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(model.menuBarText)
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
    }

    @ViewBuilder
    private func limitSection(_ limit: RateLimitSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(limit.displayName)
                .font(.subheadline.weight(.semibold))

            ForEach(Array(limit.windows.enumerated()), id: \.offset) { _, window in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(window.displayName)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(window.remainingPercent)% 남음")
                            .fontWeight(.medium)
                            .monospacedDigit()
                    }
                    .font(.caption)

                    ProgressView(value: Double(window.remainingPercent), total: 100)
                        .tint(tint(for: window.remainingPercent))

                    if let resetDate = window.resetDate {
                        Text("리셋 \(resetDate, style: .relative)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            if let date = model.lastUpdated {
                Text("업데이트 \(date, style: .time)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            Button {
                Task { await model.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .disabled(model.isRefreshing)
            .help("새로고침")

            Button("종료") {
                model.quit()
            }
            .buttonStyle(.borderless)
        }
    }

    private func tint(for remaining: Int) -> Color {
        switch remaining {
        case 0..<15: return .red
        case 15..<35: return .orange
        default: return .accentColor
        }
    }
}
