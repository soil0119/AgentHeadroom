import AppKit
import CodexHeadroomCore
import Foundation

@MainActor
final class UsageModel: ObservableObject {
    @Published private(set) var summary: UsageSummary?
    @Published private(set) var isRefreshing = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var lastUpdated: Date?

    private let client: CodexRateLimitClient
    private var timer: Timer?

    init(client: CodexRateLimitClient = CodexRateLimitClient()) {
        self.client = client
        Task { await refresh() }
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.refresh()
            }
        }
    }

    var menuBarText: String {
        if let summary { return "\(summary.headlineRemainingPercent)%" }
        return isRefreshing ? "…" : "--%"
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            summary = try await client.fetch()
            errorMessage = nil
            lastUpdated = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func quit() {
        NSApplication.shared.terminate(nil)
    }
}
