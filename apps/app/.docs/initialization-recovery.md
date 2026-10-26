# Initialization state recovery

An unavailable initialization-state API is unknown state, not evidence that an owner already exists. Code inspection found that the UI silently chose the login branch after this query failed, with no way to retry. A deliberately rejected API request reproduced the missing error/recovery action before the change. Keep [[chat-security]]: do not bypass the server's bootstrap/passkey rules to make setup appear successful.

Show a short error and an explicit retry action, and prevent credential operations until state is known. Retry re-reads the authoritative API without reloading or discarding form state. Reject automatic fallback to registration or login. The browser scenario first forces a failure, then restores the API and proves recovery to the fresh fixture's registration state. This UI defect is separate from the hosted Portless routing failure recorded in [[harness-intent]]; do not claim it explains that failure.
