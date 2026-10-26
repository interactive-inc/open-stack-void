# Reusable development harness

## Confirmed goal and constraints

The user prioritizes a fixed business workflow/file layout, active dialogue to extract intent, current rationale documents, and a nondeveloper-friendly path to safe scaling. They permit normal commits/pushes to main. Chat is an interchangeable sample; a framework or documentation bureaucracy is not the product. Site/EmDash compatibility must remain intact. [[workflow]], [[documentation]], [[architecture]], [[delivery]].

## Decisions and rejected alternatives

Keep a single catalog for metadata and local rationale Markdown for human reading. Stable IDs survive renames; explicit evidence separates confirmed intent from AI guesses. Reject automatic age-based obsolescence: old reasoning may remain valid. Reject claiming that link checks prove meaning: an agent must review intent and behavioral evidence. Require a related changed record in CI when owned code changes, so a forgotten document is a visible failure. Reject automatic rewriting of prose by code generation because rationale is not derivable from code.

Keep release planning local and immutable-SHA-bound. Reject blind automated publication: a green build cannot authorize a production migration or prove rollback safety. The user has allowed the official installer's internal package-manager bootstrap; repository operations still enter through VP with the pinned npm backend. This supersedes the former first-bootstrap prohibition in [[clean-bootstrap]].

## Assumptions and open questions

Inferred: one repository represents one organization/workspace for the first sample increment; there is no tenant switching. Public channels are visible to all active members; private channels will require explicit membership, including admins. Questions to settle before implementing retention or media: deletion/retention requirements and storage limits. Do not fabricate these policies.

## Acceptance and next increments

The first increment makes dependency direction, document traceability, full verification receipts, secret scanning and release planning executable. The booking replacement fixture proves the same workflow can describe a different domain without inheriting chat terminology or database access from clients. Checks prove structural correspondence, not the correctness of business choices.

Remaining: complete channel membership and privacy across all transports; role/invitation/settings lifecycle; durable ordering/reconnect/search and media authorization; interruption UI; isolated multi-user/concurrent regression expansion. Each requires a tested vertical increment and updated rationale. Existing simulated passkeys do not establish real-device support. No actual release/tag/deployment is authorized by a release plan.

The next bounded increment hardens invitation and membership authority; [[invitation-lifecycle]] is the decision record for retries, settled request IDs, current-inviter checks, role races and migration compatibility. Broader workspace/channel management and reliable delivery/outbox operations remain separate work. Retention and administrator access to uninvited private channels remain open questions, not confirmed defaults.

## Initial verification evidence

The first full local run passed all five builds, type/lint/format checks, 17 existing unit/policy cases, six new harness cases, and eight isolated browser cases including CMS edits/99 link transitions and named origins. The final increment adds a pinned local scanner setup for Windows/macOS/Linux, layout/client-boundary checks and local changed-document impact detection. Windows is exercised here; macOS/Linux execution remains unverified. Retention and admin-private-access questions remain pending, and no dependent chat policy has been implemented.

The first hosted CI reached full verification but rejected formatting in 170 files: Windows checkout's default autocrlf changed working-tree line endings, unlike the already-formatted local checkout. Pin LF in .gitattributes instead of changing global Git settings or letting CI rewrite source. A fresh local Git clone fixture with autocrlf enabled verifies this boundary. The first-release planner also avoids an expected no-tags Git diagnostic, so an initial candidate does not appear to fail. The AST checker uses the already-resolved Babel parser as an explicit pinned dependency because TypeScript 7's public package no longer exposes the former compiler AST API; avoid adopting its unstable AST API for this policy.

The next hosted run passed static checks, six auth/client/browser cases and the CMS lifecycle, then lacked the bootstrap name field in the named-origin test. Do not infer a product fix from a timeout. Add fail-fast browser/direct health and initialization-state assertions plus aggregate counts from the isolated test SQLite state; no credentials, rows or normal databases are inspected. Keep the existing registration/socket expectations while distinguishing proxy routing, server initialization and browser hydration.

Run 40386511173 established the layer: the direct backend returned 200 with bootstrap enabled and zero isolated members/claims, while browser and proxy paths returned 404 for the same API; the page title was empty. Environment presence was confirmed without printing values. This is a named-origin routing problem, not a missing seed or owner initialization. Portless's installed implementation accepts any listening port when an explicit state directory is set, so add our own X-Portless identity guard before starting apps. Never stop an unknown local listener. Hosted CI now records only process/service names and public response identity at port 80 before installation, and fails early on a foreign listener so a separate, evidence-based CI-only remedy can be selected.

Run 40388838777 identified the owner: HTTP.sys PID 4, Microsoft-IIS/10.0, with W3SVC and WAS already running on the fresh Windows image. Reserve port 80 only on a dedicated GitHub-hosted runner, and only when all these IIS checks match, by stopping W3SVC for that disposable job. Do not stop WAS, alter startup settings, install services, sync hosts, or apply this to a developer/self-hosted machine. Unknown ownership or a still-occupied port fails closed. Reject changing the named origins or weakening socket assertions: that would conceal the environment mismatch instead of testing the intended product path.
