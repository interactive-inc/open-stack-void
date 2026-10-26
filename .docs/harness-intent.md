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

## Initial verification evidence

The first full local run passed all five builds, type/lint/format checks, 17 existing unit/policy cases, six new harness cases, and eight isolated browser cases including CMS edits/99 link transitions and named origins. The final increment adds a pinned local scanner setup for Windows/macOS/Linux, layout/client-boundary checks and local changed-document impact detection. Windows is exercised here; macOS/Linux execution remains unverified. Retention and admin-private-access questions remain pending, and no dependent chat policy has been implemented.

The first hosted CI reached full verification but rejected formatting in 170 files: Windows checkout's default autocrlf changed working-tree line endings, unlike the already-formatted local checkout. Pin LF in .gitattributes instead of changing global Git settings or letting CI rewrite source. A fresh local Git clone fixture with autocrlf enabled verifies this boundary. The first-release planner also avoids an expected no-tags Git diagnostic, so an initial candidate does not appear to fail. The AST checker uses the already-resolved Babel parser as an explicit pinned dependency because TypeScript 7's public package no longer exposes the former compiler AST API; avoid adopting its unstable AST API for this policy.
