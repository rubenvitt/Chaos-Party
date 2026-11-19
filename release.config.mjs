// semantic-release für die Mac-App des nativen Hosts (CHAOS-156, ADR-019 Nachtrag 4).
// Version aus den Commits seit dem letzten Tag `macos-v…` (Conventional Commits, siehe CLAUDE.md):
// `feat` → Minor, `fix`/`perf` → Patch, `BREAKING CHANGE` → Major; alles andere löst keinen Release aus.
// semantic-release legt selbst weder Tag noch Release an: `apps/apple-host/scripts/next-version.mjs` fragt nur
// die nächste Version und die Notizen ab (Probelauf), `.github/workflows/release-macos.yml` baut, signiert,
// notarisiert und legt erst dann Tag und Release an. So entsteht nie ein Tag ohne fertige App.
export default {
  branches: ['main'],
  tagFormat: 'macos-v${version}',
  plugins: ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator'],
};
