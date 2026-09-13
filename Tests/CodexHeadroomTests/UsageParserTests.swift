import Foundation
import XCTest
@testable import CodexHeadroomCore

final class UsageParserTests: XCTestCase {
    func testRemainingPercentAndWindowLabels() throws {
        let weekly = RateLimitWindow(
            usedPercent: 18,
            windowDurationMins: 10_080,
            resetsAt: 1_789_808_429
        )
        let fiveHour = RateLimitWindow(
            usedPercent: 41.4,
            windowDurationMins: 300,
            resetsAt: nil
        )

        XCTAssertEqual(weekly.remainingPercent, 82)
        XCTAssertEqual(weekly.displayName, "주간 한도")
        XCTAssertEqual(fiveHour.remainingPercent, 59)
        XCTAssertEqual(fiveHour.displayName, "5시간 한도")
    }

    func testSummaryPrefersGeneralCodexLimit() throws {
        let json = #"""
        {
          "id": 2,
          "result": {
            "rateLimits": {
              "limitId": "codex",
              "limitName": null,
              "primary": {"usedPercent": 18, "windowDurationMins": 10080, "resetsAt": 1789808429},
              "secondary": null,
              "planType": "pro"
            },
            "rateLimitsByLimitId": {
              "codex": {
                "limitId": "codex",
                "limitName": null,
                "primary": {"usedPercent": 18, "windowDurationMins": 10080, "resetsAt": 1789808429},
                "secondary": null,
                "planType": "pro"
              },
              "spark": {
                "limitId": "spark",
                "limitName": "Codex Spark",
                "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1789306585},
                "secondary": {"usedPercent": 0, "windowDurationMins": 10080, "resetsAt": 1789893385},
                "planType": "pro"
              }
            }
          }
        }
        """#

        let response = try JSONDecoder().decode(
            RateLimitsRPCResponse.self,
            from: Data(json.utf8)
        )
        let result = try XCTUnwrap(response.result)
        let summary = UsageSummary(result: result)

        XCTAssertEqual(summary.headlineRemainingPercent, 82)
        XCTAssertEqual(summary.limits.first?.displayName, "Codex")
        XCTAssertEqual(summary.limits.count, 2)
    }
}
