// Session token per server + code (`net/tokenStore.ts`); UserDefaults, not Keychain (ADR-017).
import Foundation

struct TokenStore {
    static let key = "dev.rubeen.chaosparty.controller.session"

    private struct Entry: Codable {
        var storageKey: String
        var token: String
    }

    let defaults: UserDefaults

    func load(_ storageKey: String) -> String? {
        guard let data = defaults.data(forKey: Self.key),
            let entry = try? JSONDecoder().decode(Entry.self, from: data),
            entry.storageKey == storageKey
        else { return nil }
        return entry.token
    }

    func save(_ storageKey: String, token: String) {
        guard let data = try? JSONEncoder().encode(Entry(storageKey: storageKey, token: token)) else { return }
        defaults.set(data, forKey: Self.key)
    }

    func clear() {
        defaults.removeObject(forKey: Self.key)
    }
}
