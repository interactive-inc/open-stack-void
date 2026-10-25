# CLI

- Keep this an SDK consumer. Server authorization is authoritative.
- Print machine-readable JSON to stdout and failures to stderr with a nonzero exit status.
- Read authentication secrets only through explicit `--clipboard` operations. Do not read them from command arguments, terminal prompts, or environment variables. Never log or persist them. Browser-only initialization and passkey management do not transfer secrets back to the terminal.
- Library entry files may compose commands; use relative imports within this small Node package.
