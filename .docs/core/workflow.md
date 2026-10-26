# Development contract

Read [[architecture]], [[verification]], [[delivery]], and [[conversation]] before changing a product. These files are instructions, not an automatically resolved import format. AGENTS.md requires the agent to open them explicitly.

Work in vertical increments: capture the user's outcome and acceptance examples; inspect the current checkout and competing writers; explain material alternatives; implement one usable outcome; verify allowed and denied behavior; review security boundaries; refactor while preserving those examples; prepare a release candidate. Keep a short, concrete remaining-work list in the project's decision record. A green command alone does not establish product completion.

For a new product, retain the workflow, identity/access infrastructure and tooling, then replace the sample chat context. Do not inherit chat-specific rules as universal product rules. Each repository represents one workspace today; multi-workspace tenancy requires a separate design and isolation tests before claiming support.

Use Vite+ as the operation entry point with the pinned npm backend. Keep exact direct dependency versions, the committed lockfile, disabled installation hooks and the 24-hour publication gate. Do not silently select a new framework, package manager, component library or directory layout. A proposed stack change needs a reason, migration and rollback plan, and explicit user direction.
