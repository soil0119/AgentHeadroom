import Foundation

public struct RateLimitWindow: Codable, Equatable, Sendable {
    public let usedPercent: Double
    public let windowDurationMins: Int?
    public let resetsAt: TimeInterval?

    public init(usedPercent: Double, windowDurationMins: Int?, resetsAt: TimeInterval?) {
        self.usedPercent = usedPercent
        self.windowDurationMins = windowDurationMins
        self.resetsAt = resetsAt
    }

    public var remainingPercent: Int {
        Int((100 - usedPercent).rounded()).clamped(to: 0...100)
    }

    public var resetDate: Date? {
        resetsAt.map(Date.init(timeIntervalSince1970:))
    }

    public var displayName: String {
        guard let minutes = windowDurationMins else { return "사용량 한도" }
        switch minutes {
        case 300:
            return "5시간 한도"
        case 1_440:
            return "일일 한도"
        case 9_000...11_000:
            return "주간 한도"
        default:
            return "\(minutes)분 한도"
        }
    }
}

public struct RateLimitSnapshot: Codable, Equatable, Identifiable, Sendable {
    public let limitId: String?
    public let limitName: String?
    public let primary: RateLimitWindow?
    public let secondary: RateLimitWindow?
    public let planType: String?

    public var id: String { limitId ?? limitName ?? "codex-unknown" }
    public var displayName: String {
        if limitId == "codex" { return "Codex" }
        return limitName ?? limitId ?? "Codex"
    }

    public var windows: [RateLimitWindow] {
        [primary, secondary].compactMap { $0 }
    }

    public var remainingPercent: Int? {
        windows.map(\.remainingPercent).min()
    }

    private enum CodingKeys: String, CodingKey {
        case limitId, limitName, primary, secondary, planType
    }
}

public struct RateLimitsResult: Codable, Equatable, Sendable {
    public let rateLimits: RateLimitSnapshot
    public let rateLimitsByLimitId: [String: RateLimitSnapshot]?
}

public struct RPCErrorPayload: Codable, Equatable, Sendable {
    public let code: Int?
    public let message: String
}

public struct RateLimitsRPCResponse: Codable, Equatable, Sendable {
    public let id: Int?
    public let result: RateLimitsResult?
    public let error: RPCErrorPayload?
}

public struct UsageSummary: Equatable, Sendable {
    public let limits: [RateLimitSnapshot]

    public init(result: RateLimitsResult) {
        let values = result.rateLimitsByLimitId?.values.map { $0 } ?? []
        let source = values.isEmpty ? [result.rateLimits] : values
        self.limits = source.sorted {
            if $0.limitId == "codex" && $1.limitId != "codex" { return true }
            if $1.limitId == "codex" && $0.limitId != "codex" { return false }
            return $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending
        }
    }

    public var headlineRemainingPercent: Int {
        let preferred = limits.first(where: { $0.limitId == "codex" })
        return preferred?.remainingPercent
            ?? limits.compactMap(\.remainingPercent).min()
            ?? 0
    }
}

private extension Comparable {
    func clamped(to limits: ClosedRange<Self>) -> Self {
        min(max(self, limits.lowerBound), limits.upperBound)
    }
}
