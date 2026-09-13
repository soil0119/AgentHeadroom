import Foundation

enum CodexClientError: LocalizedError {
    case executableNotFound
    case launchFailed(String)
    case timedOut
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .executableNotFound:
            return "Codex CLI를 찾을 수 없습니다. 먼저 Codex에 로그인해 주세요."
        case .launchFailed(let detail):
            return "Codex를 실행하지 못했습니다: \(detail)"
        case .timedOut:
            return "사용량 조회 시간이 초과되었습니다."
        case .invalidResponse:
            return "Codex가 예상하지 못한 응답을 보냈습니다."
        case .server(let message):
            return message
        }
    }
}

public struct CodexRateLimitClient: Sendable {
    private let timeout: TimeInterval
    private let executableOverride: URL?

    public init(timeout: TimeInterval = 12, executableOverride: URL? = nil) {
        self.timeout = timeout
        self.executableOverride = executableOverride
    }

    public func fetch() async throws -> UsageSummary {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                do {
                    continuation.resume(returning: try fetchBlocking())
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private func fetchBlocking() throws -> UsageSummary {
        let executable = try resolveExecutable()
        let process = Process()
        let inputPipe = Pipe()
        let outputPipe = Pipe()

        process.executableURL = executable
        process.arguments = ["app-server", "--stdio", "--disable", "plugins"]
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = FileHandle.nullDevice

        let box = ResponseBox()
        let semaphore = DispatchSemaphore(value: 0)

        outputPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            if box.append(data: data), box.markSignaled() {
                semaphore.signal()
            }
        }

        process.terminationHandler = { _ in
            if box.markSignaled() {
                semaphore.signal()
            }
        }

        do {
            try process.run()
        } catch {
            outputPipe.fileHandleForReading.readabilityHandler = nil
            throw CodexClientError.launchFailed(error.localizedDescription)
        }

        do {
            try writeRequests(to: inputPipe.fileHandleForWriting)
        } catch {
            process.terminate()
            outputPipe.fileHandleForReading.readabilityHandler = nil
            throw CodexClientError.launchFailed(error.localizedDescription)
        }

        let waitResult = semaphore.wait(timeout: .now() + timeout)
        outputPipe.fileHandleForReading.readabilityHandler = nil
        try? inputPipe.fileHandleForWriting.close()
        if process.isRunning { process.terminate() }

        guard waitResult == .success else {
            throw CodexClientError.timedOut
        }
        guard let response = box.response else {
            throw CodexClientError.invalidResponse
        }
        if let error = response.error {
            throw CodexClientError.server(error.message)
        }
        guard let result = response.result else {
            throw CodexClientError.invalidResponse
        }
        return UsageSummary(result: result)
    }

    private func writeRequests(to handle: FileHandle) throws {
        let messages: [[String: Any]] = [
            [
                "id": 1,
                "method": "initialize",
                "params": [
                    "clientInfo": [
                        "name": "codex-headroom",
                        "title": "CodexHeadroom",
                        "version": "0.1.0"
                    ],
                    "capabilities": NSNull()
                ]
            ],
            ["method": "initialized", "params": [:]],
            ["id": 2, "method": "account/rateLimits/read"]
        ]

        for message in messages {
            var data = try JSONSerialization.data(withJSONObject: message)
            data.append(0x0A)
            try handle.write(contentsOf: data)
        }
    }

    private func resolveExecutable() throws -> URL {
        if let executableOverride,
           FileManager.default.isExecutableFile(atPath: executableOverride.path) {
            return executableOverride
        }

        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            ProcessInfo.processInfo.environment["CODEX_METER_CODEX_PATH"],
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
            "\(home)/.local/bin/codex",
            "\(home)/bin/codex"
        ].compactMap { $0 }

        if let path = candidates.first(where: FileManager.default.isExecutableFile(atPath:)) {
            return URL(fileURLWithPath: path)
        }
        throw CodexClientError.executableNotFound
    }
}

private final class ResponseBox: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer = Data()
    private var didSignal = false
    private(set) var response: RateLimitsRPCResponse?

    func append(data: Data) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(data)

        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer[..<newline]
            buffer.removeSubrange(...newline)
            guard !line.isEmpty,
                  let decoded = try? JSONDecoder().decode(RateLimitsRPCResponse.self, from: Data(line)),
                  decoded.id == 2 else {
                continue
            }
            response = decoded
            return true
        }
        return false
    }

    func markSignaled() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !didSignal else { return false }
        didSignal = true
        return true
    }
}
