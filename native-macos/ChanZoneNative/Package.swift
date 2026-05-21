// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "ChanZoneNative",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .executable(name: "ChanZoneNative", targets: ["ChanZoneNative"])
  ],
  targets: [
    .executableTarget(
      name: "ChanZoneNative",
      resources: [
        .process("Resources")
      ]
    )
  ]
)
