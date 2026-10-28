import SwiftUI
import WebKit

@main
struct FrontRowApp: App {
    var body: some Scene {
        WindowGroup {
            Shell()
                .ignoresSafeArea()
                .statusBarHidden()
                // A lecture is an hour: the screen never dims while the app is open.
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        }
    }
}

struct Shell: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.load(URLRequest(url: URL(string: "https://www.studycadenza.com/front-row/home")!))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate {
        // iOS has already asked the student for camera and mic (the usage strings); the page's getUserMedia is not asked again.
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            // Exactly our site, over https, in the top frame: never a look-alike host or an embedded frame.
            let host = origin.host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
            let ours = origin.protocol == "https" && ["studycadenza.com", "www.studycadenza.com"].contains(host) && frame.isMainFrame
            decisionHandler(ours ? .grant : .deny)
        }
    }
}
