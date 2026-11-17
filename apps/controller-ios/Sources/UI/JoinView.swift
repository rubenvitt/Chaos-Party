// Join (QR scan or manual entry), connecting and error screens (ui/screens.tsx, ADR-017).
import AVFoundation
import SwiftUI
import UIKit
import VisionKit

/// Neutral accent before a slot exists (`--player` default in `styles.css`).
let neutralAccent = Color(hex: "#8f86c9")

struct JoinView: View {
    let session: any ControllerSessionProtocol
    @AppStorage("dev.rubeen.chaosparty.controller.name") private var name = ""
    @AppStorage("dev.rubeen.chaosparty.controller.address") private var address = ""
    @State private var code = ""
    @State private var scanning = false
    @State private var cameraDenied = false
    @State private var message: String?

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var nameValid: Bool { trimmedName.isEmpty || PlayerName.isValid(trimmedName) }
    private var manualTarget: JoinTarget? { JoinTarget.manual(address: address, code: code) }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Text("Chaos Party")
                    .font(.system(size: 44, weight: .bold))
                    .rotationEffect(.degrees(-3))
                    .shadow(color: .black.opacity(0.35), radius: 7, y: 2)
                    .padding(.top, 24)
                    .accessibilityAddTraits(.isHeader)

                field("Dein Name (optional)", text: $name, prompt: "z. B. Kim")
                    .textInputAutocapitalization(.words)
                if !nameValid {
                    Text("Der Name darf höchstens 16 Zeichen haben.")
                        .font(.footnote).foregroundStyle(Palette.sun)
                }

                VStack(spacing: 12) {
                    SwiftUI.Button {
                        Task { await startScan() }
                    } label: {
                        Label("QR-Code scannen", systemImage: "qrcode.viewfinder")
                            .font(.title2.bold())
                            .frame(maxWidth: .infinity, minHeight: 72)
                            .primary(neutralAccent, radius: 36)
                    }
                    .buttonStyle(PressStyle())
                    .disabled(!nameValid)
                    if cameraDenied {
                        VStack(spacing: 8) {
                            Text("Ohne Kamera kein Scan. Erlaube den Zugriff in den Einstellungen oder gib Adresse und Code unten ein.")
                                .font(.callout)
                            SwiftUI.Button("Einstellungen öffnen") {
                                if let url = URL(string: UIApplication.openSettingsURLString) {
                                    UIApplication.shared.open(url)
                                }
                            }
                            .font(.callout.bold())
                            .frame(minHeight: 44)
                        }
                        .multilineTextAlignment(.center)
                    }
                }

                VStack(spacing: 12) {
                    Text("oder von Hand")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.dim)
                    field("Adresse des Spiel-PCs", text: $address, prompt: "192.168.1.20")
                        .keyboardType(.numbersAndPunctuation)
                        .textInputAutocapitalization(.never)
                    field("Gib den Code vom Spiel-Bildschirm ein", text: $code, prompt: "AB12")
                        .textInputAutocapitalization(.characters)
                        .onChange(of: code) { _, new in
                            let normalized = JoinCode.normalize(new)
                            if normalized != new { code = normalized }
                        }
                    GlassButton(title: "Beitreten") {
                        if let manualTarget { join(manualTarget) }
                    }
                    .disabled(manualTarget == nil || !nameValid)
                    .opacity(manualTarget == nil || !nameValid ? 0.5 : 1)
                }
                .padding(18)
                .glass(24)

                if let error = session.state.joinError?.text ?? message {
                    Text(error)
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(Palette.sun)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isStaticText)
                }

                Text("Bist du im selben WLAN wie der Spiel-PC? Beim ersten Mal fragt iOS nach dem lokalen Netzwerk – bitte erlauben.")
                    .font(.footnote)
                    .foregroundStyle(Palette.dim)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .fullScreenCover(isPresented: $scanning) {
            ScannerScreen { payload in
                guard let target = JoinTarget.fromScannedURL(payload) else { return false }
                scanning = false
                join(target)
                return true
            } onCancel: {
                scanning = false
            }
        }
    }

    private func field(_ label: String, text: Binding<String>, prompt: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline.weight(.semibold))
            TextField(label, text: text, prompt: Text(prompt).foregroundStyle(Palette.dim))
                .font(.title3)
                .autocorrectionDisabled()
                .padding(.horizontal, 14)
                .frame(minHeight: 50)
                .glass(14, strong: true)
        }
    }

    private func join(_ target: JoinTarget) {
        message = nil
        session.join(target, name: trimmedName.isEmpty ? nil : trimmedName)
    }

    private func startScan() async {
        message = nil
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                cameraDenied = true
                return
            }
        default:
            cameraDenied = true
            return
        }
        cameraDenied = false
        // shortcut: no AVFoundation fallback – every iOS 26 device supports VisionKit; the
        // simulator lands here and uses manual entry.
        guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
            message = "Scannen geht hier nicht. Gib Adresse und Code von Hand ein."
            return
        }
        scanning = true
    }
}

// MARK: - QR scanner (VisionKit)

private struct ScannerScreen: View {
    /// Returns `false` for a code that is not a Chaos Party link.
    let onPayload: (String) -> Bool
    let onCancel: () -> Void
    @State private var wrongCode = false
    @State private var joined = false

    var body: some View {
        ZStack(alignment: .bottom) {
            QRScanner { payload in
                // Several codes can arrive before the cover is gone: join once.
                guard !joined else { return }
                joined = onPayload(payload)
                wrongCode = !joined
            }
            .ignoresSafeArea()
            VStack(spacing: 12) {
                Text(wrongCode ? "Das ist kein Chaos-Party-Code." : "Halte die Kamera auf den QR-Code am Fernseher.")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .padding(14)
                    .glass(16, strong: true)
                GlassButton(title: "Abbrechen", action: onCancel)
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
    }
}

private struct QRScanner: UIViewControllerRepresentable {
    let onPayload: (String) -> Void

    func makeUIViewController(context: UIViewControllerRepresentableContext<Self>) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
            isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: UIViewControllerRepresentableContext<Self>) {
        context.coordinator.onPayload = onPayload
        // Start once the scanner is on screen; a failure leaves the cancel button usable.
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onPayload: onPayload) }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onPayload: (String) -> Void
        init(onPayload: @escaping (String) -> Void) { self.onPayload = onPayload }

        func dataScanner(
            _ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            for case .barcode(let barcode) in addedItems {
                if let payload = barcode.payloadStringValue { onPayload(payload) }
            }
        }
    }
}

// MARK: - Connecting and error

struct ConnectingView: View {
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 22) {
            WaitDots()
            Text("Verbinde mit dem Spiel …").font(.title3.weight(.semibold))
            GlassButton(title: "Abbrechen", action: onCancel)
        }
        .padding(20)
    }
}

struct ErrorView: View {
    let code: UiErrorCode
    let session: any ControllerSessionProtocol

    var body: some View {
        VStack(spacing: 22) {
            Text("?!")
                .font(.system(size: 64, weight: .heavy))
                .foregroundStyle(Palette.sun)
                .accessibilityHidden(true)
            Text(code.text)
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)
            if code.remedy == .retry {
                PrimaryButton(title: "Neu verbinden", color: neutralAccent, action: session.retry)
            }
            GlassButton(title: "Anderes Spiel", action: session.leave)
        }
        .padding(24)
        .frame(maxWidth: 480)
    }
}
