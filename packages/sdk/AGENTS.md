# SDK

- Keep this package transport-only. The server owns authorization and business rules.
- Validate responses at the boundary. Do not log tokens or persist browser credentials.
- Exports are public library entry points; direct relative imports inside this small package are permitted.
