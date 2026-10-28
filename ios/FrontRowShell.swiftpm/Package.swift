// swift-tools-version: 5.9
// Front Row's iPhone shell for the demo: one full-screen web view on the live site that keeps the screen awake. Open
// this folder in Xcode, pick your personal team under Signing, run on the phone. Recording logic stays in the page.
import AppleProductTypes
import PackageDescription

let package = Package(
    name: "FrontRowShell",
    platforms: [.iOS("17.0")],
    products: [
        .iOSApplication(
            name: "Front Row",
            targets: ["FrontRowShell"],
            bundleIdentifier: "com.studycadenza.frontrow",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .camera),
            accentColor: .presetColor(.orange),
            supportedDeviceFamilies: [.phone],
            supportedInterfaceOrientations: [.portrait, .landscapeLeft, .landscapeRight],
            capabilities: [
                .camera(purposeString: "Front Row photographs the board so it can read it into your notes."),
                .microphone(purposeString: "Front Row records the lecture so it can write your notes."),
            ]
        ),
    ],
    targets: [.executableTarget(name: "FrontRowShell", path: ".")]
)
