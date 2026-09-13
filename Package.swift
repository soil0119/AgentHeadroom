// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CodexHeadroom",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "CodexHeadroom", targets: ["CodexHeadroom"]),
        .executable(name: "codex-headroom-check", targets: ["CodexHeadroomCheck"])
    ],
    targets: [
        .target(name: "CodexHeadroomCore"),
        .executableTarget(
            name: "CodexHeadroom",
            dependencies: ["CodexHeadroomCore"]
        ),
        .executableTarget(
            name: "CodexHeadroomCheck",
            dependencies: ["CodexHeadroomCore"]
        ),
        .testTarget(
            name: "CodexHeadroomTests",
            dependencies: ["CodexHeadroomCore"]
        )
    ],
    swiftLanguageModes: [.v5]
)
