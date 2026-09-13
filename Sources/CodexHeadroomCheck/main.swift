import CodexHeadroomCore
import Foundation

@main
struct CodexHeadroomCheck {
    static func main() async {
        do {
            let summary = try await CodexRateLimitClient().fetch()
            print("remainingPercent=\(summary.headlineRemainingPercent)")
            for limit in summary.limits {
                let windows = limit.windows
                    .map { "\($0.displayName):\($0.remainingPercent)%" }
                    .joined(separator: ",")
                print("\(limit.displayName)=\(windows)")
            }
        } catch {
            FileHandle.standardError.write(Data("error=\(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
}
