// Conventional Commits für alle Commits auf main (CHAOS-156): semantic-release liest daraus die Version
// der Mac-App. Typen und Aufbau wie @commitlint/config-conventional, angepasst an deutsche Texte:
// Betreff darf groß beginnen (Substantive), Text und Fußzeilen ohne Längengrenze (Co-Authored-By, Links).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
