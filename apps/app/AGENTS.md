# Void Chat

- `identity` owns passkeys, sessions, and tokens. `membership` owns invitations and member roles. `chat` owns channels and messages.
- Domain is independent of Void, Hono, D1, and Cloudflare. Application owns write use cases, infrastructure owns persistence, interface owns HTTP composition.
- Invite possession allows registering a passkey, never passwordless email-link login. Do not add password fallbacks.
- Re-check active membership for every request, including tokens. Send invalidation-only socket events, never private message content to stale sessions.
- Owners cannot be demoted or removed. Only owners change roles. Admins invite and remove ordinary members.
- Local bootstrap credentials and data are gitignored. Never return the local email inbox token from an API.
- Keep invitation replay secrets ephemeral. Recovery uses persisted intent and fenced attempts; unknown delivery requires explicit acknowledgement and link rotation. Fault injection belongs only in isolated test fixtures, never production configuration.
