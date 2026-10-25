# Development

- Use `inta:dev` and focused `inta:test` verification when available.
- Work locally. Do not publish, deploy, push, or modify remote data unless explicitly requested.
- Use npm workspaces as the package-manager backend and Vite+ for every user-facing operation. Never invoke pnpm. Apps belong in `apps/`, shared clients in `packages/`.
- Run `vp fmt`; the root configuration disables semicolons.
- Use `vp run dev` for the named local app/site origins. Keep Portless loopback-only with exact origins; do not run hosts sync, trust, or service installation implicitly. Browser and Node clients resolve the designated local app without system DNS changes.
- Keep bounded contexts in `apps/app/src/contexts/<context>/{domain,application,infrastructure,interface}`. Domain is framework-independent. Use one application class per write use case. Reads may call repositories directly. Compose contexts at the app boundary.
- Web, CLI, and MCP share server authorization and application rules. Clients never access databases directly.
- UI primitives come only from the shadcn CLI, style `base-maia`. Do not hand-edit generated primitives or create competing UI primitives. Install the full set with `shadcn add -o -a -y`.
- Minimize product text and decoration. Maximize conversation space while retaining accessible names, focus states, and actionable errors.
- Specifications and decisions belong in each project's `.docs/` and use `[[wiki-links]]`. Record reasons, history, intent, and operational assumptions, not code-readable behavior, schemas, or endpoint lists.
- Maintain development conventions in relevant `AGENTS.md` files.
- Keep visual conventions in root `DESIGN.md`; app and site must follow it.
- Prioritize security and safety. Bootstrap keys never belong in URLs or logs. CLI secrets are read only through explicit clipboard actions; never prompt for them in the terminal, accept them as arguments, print them, or silently fall back to plaintext input. MCP authentication uses browser approval without clipboard access or secret-valued tool inputs/outputs.
- Dependency installation uses `vp install --frozen-lockfile` with lifecycle scripts disabled, then `vp run prepare:local` verifies every locked publication date before running only approved builds. Never combine a clean install inside `vp run`: its Windows task-cache handle conflicts with removing node_modules.
- Retain the 24-hour dependency release-age gate without package exceptions. Use compatible older versions when a new release is too recent.
- App code uses static imports and absolute `@/` paths. Use concrete use cases, explicit dependencies, and typed expected failures. Framework convention and generated files retain required exports.
- Verify formatting, type checks, builds, domain rules, and local HTTP/browser behavior before delivery. Report unverified cases accurately.

## Void

- Use Void's CLI and typed APIs. Read `node_modules/void/docs/guide/quickstart.md`, `reference/cli.md`, and relevant feature docs before changing integration.
- Run app-specific commands with `vp -C apps/app exec void <command>`.
- Void uses `env.ts` and a single local `.env`. Do not add `.env.example`, `.env.local`, or `.dev.vars` inside the Void app.
- Preserve checked-in migrations and resource identities in `void.lock.json`. Never reset a remote database.
