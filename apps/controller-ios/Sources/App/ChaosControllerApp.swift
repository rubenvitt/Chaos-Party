// Native controller app (CHAOS-115, ADR-017). Everything else lives in ChaosControllerKit.
import ChaosControllerKit
import SwiftUI

@main
struct ChaosControllerApp: App {
    var body: some Scene {
        WindowGroup { ControllerRoot() }
    }
}
