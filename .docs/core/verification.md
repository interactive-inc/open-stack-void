# Verification contract

`vp run verify` runs formatting, lint, architecture/document contracts, unit and harness tests, types and builds in fail-fast order. `vp run verify:full` adds the isolated Cloudflare/browser journeys. `vp run check:secrets` scans the reachable Git history and an exported tracked working-tree snapshot with Gitleaks; it fails closed if the scanner is absent. It never prints matching secret values. Untracked files must be staged before the final publication scan.

For each authorization change, test owner/admin/member/disabled actors and outsiders, exact denial status, no writes after denial, hidden metadata, stale sessions and every affected transport. For ordering/idempotency, prove retry and concurrent behavior against real isolated Durable Objects; mocks alone are insufficient. Use synthetic accounts and dedicated `.local` state, never production data. Browser failures and traces may contain credentials and must remain ignored and local.

Exercise pending/failed/interrupted UI actions and retained drafts. Confirm normal local origins after test servers stop. Do not touch another app's server. Dependency, migration and authentication changes require the relevant installed Void guidance first.

CI uses read-only repository permissions and the same commands. CI success does not authorize deployment. Review changes to workflows, policy scripts and their tests together; an agent may not weaken a gate to make its change pass. Record success, failure, environment blockers and untested cases separately. Never claim zero vulnerabilities or device testing from simulated passkeys.
