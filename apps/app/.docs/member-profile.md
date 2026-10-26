# Self-service display names

The user requested usable settings across Web, CLI and MCP. Inferred, reversible scope for this increment: an active member may change only their own display name. Email, credentials and roles are outside this operation. Display names are not identity/authorization keys and need not be unique. [[chat-security]], [[harness-intent]].

Keep one membership application use case shared through the server API. Reject client-selected target IDs and additional fields rather than silently accepting an attempted role/email change. Check active status again in the database write so a disable between authentication and persistence cannot update the profile. Existing messages retain their historical author-name snapshot; rewriting history was rejected because it would change saved content and retention expectations without a user decision.

The UI keeps the entered name after an error, disables duplicate submission and refreshes the current member after success. Behavior verification covers disabled/anonymous actors, empty/oversized names, overposting, immutable roles/emails, browser failure/retry and CLI/MCP use of the same API. Real-device passkeys and production operation remain outside this local verification.
