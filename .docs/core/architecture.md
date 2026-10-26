# Architecture contract

Apps live in `apps/`; transport clients live in `packages/`. The fixed application stack is Void/React/Hono/Zod on Cloudflare D1 and Durable Objects. The site remains Astro/EmDash. UI primitives are CLI-generated shadcn base-maia; visual decisions follow DESIGN.md. Exact versions come from package.json and package-lock.json, never a duplicated version list.

Product contexts live in `apps/app/src/contexts/<name>/{domain,application,infrastructure,interface}`. Domain imports only domain modules and Zod. Application has no runtime dependency on infrastructure, HTTP, browser or Cloudflare; explicit type-only repository dependencies are currently allowed. One concrete application class owns each write use case. Read paths may call repositories after authorization. Cross-context orchestration stays at the interface/app boundary; shared domain types may cross boundaries, persistence implementations may not cross into application runtime.

`vp run check:architecture` inspects the TypeScript AST, including re-exports, type imports and dynamic imports. Generated primitives and framework entry points keep upstream conventions. This check enforces dependency direction, not business correctness; behavior tests prove access decisions. Avoid generic service registries, implicit dependencies and database access from CLI/MCP/SDK.

Application source folders are fixed to api, client, components, contexts, hooks, lib, screens and styles; the named framework exception is `src/vite-env.d.ts`. New contexts use the same four layers. Adding a workspace or a source category is an explicit architecture decision, with the checker changed in the same reviewed increment.

Use additive reviewed migrations; preserve resource identities and migration history. Never reset a remote database. A schema change includes local migration and compatibility evidence before release planning.
