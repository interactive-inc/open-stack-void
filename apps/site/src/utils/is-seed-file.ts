import { validateSeed } from "emdash"
import type { SeedFile } from "emdash"

/** Validate the bundled sample before passing it to EmDash. */
export function isSeedFile(value: unknown): value is SeedFile {
  return validateSeed(value).valid
}
