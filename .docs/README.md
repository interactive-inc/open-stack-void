# Start here

Read [[workflow]] and [[documentation]], then [[harness-intent]] for the current goal, tradeoffs and remaining increments. The canonical document IDs, ownership and evidence live in `catalog.json`. Product-specific rationale stays in each project's `.docs`; links may use a stable document ID or an unambiguous file stem.

Use `vp run verify` for local checks, `vp run verify:full` for the isolated browser suite, and `vp run release:plan -- <version>` for a local release candidate. These commands never publish a tag or deploy. [[delivery]] explains the authorization boundary.
