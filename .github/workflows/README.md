# Workflows

| | |
|---|---|
| `ci.yml` | Parses every module, builds, then runs the headless smoke test against the production build. The smoke test is the real gate: it asserts the echo comes online, SHIFT lands exactly on it, both selves deal damage, Resonance shatters Monolith plating, and COLLAPSE consumes the echo. |
| `pages.yml` | Deploys the playable build to GitHub Pages. Requires the repository to be **public** (or Pages enabled on a paid plan) and **Settings → Pages → Source** set to **GitHub Actions**. The build reads `ECHOSTRIDE_BASE` so the same source works at `/` and at `/<repo>/`. |
