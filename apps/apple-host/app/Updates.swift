// Not in the App Store build (CHAOS-200): the store updates the app itself and rejects self-updaters.
#if os(macOS) && !APP_STORE
import Combine
import Foundation
import Sparkle

/// Automatic updates of the Mac app via Sparkle 2 (CHAOS-156). The feed is `SUFeedURL` in the Info.plist
/// (`config/Info-macOS.plist`), signed with the EdDSA key whose public half is `SUPublicEDKey`.
/// Builds without that key (local builds, PR CI) leave the updater off and the menu item disabled, so Sparkle
/// never shows its "cannot check for updates" alert there.
@MainActor
final class Updates: ObservableObject {
    @Published private(set) var canCheck = false
    private let controller: SPUStandardUpdaterController?

    /// Feed URL and public key, or nil when this build has no update channel.
    static var feed: (url: String, key: String)? {
        let url = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String ?? ""
        let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? ""
        // Unexpanded "$(…)" would mean the build setting was missing entirely.
        guard !url.isEmpty, !key.isEmpty, !url.contains("$("), !key.contains("$(") else { return nil }
        return (url, key)
    }

    init() {
        guard let feed = Self.feed else {
            hostLog("Updates: aus (kein SUPublicEDKey in diesem Build)")
            controller = nil
            return
        }
        hostLog("Updates: Sparkle \(Self.sparkleVersion), Feed \(feed.url)")
        let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        self.controller = controller
        controller.updater.publisher(for: \.canCheckForUpdates).receive(on: RunLoop.main).assign(to: &$canCheck)
    }

    func check() { controller?.checkForUpdates(nil) }

    /// Version of the embedded Sparkle.framework (also proves it loaded, see SelfTest).
    static var sparkleVersion: String {
        Bundle(for: SPUUpdater.self).object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }
}
#endif
