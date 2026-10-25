/** Reject missing, invalid, future, or less-than-24-hour publication dates. */
export function assertReleaseAge(name, version, publishedAt, now = Date.now()) {
  const timestamp = typeof publishedAt === "string" ? Date.parse(publishedAt) : Number.NaN
  if (!Number.isFinite(timestamp) || timestamp > now - 86_400_000)
    throw new Error(`Release-age policy rejected ${name}@${version}`)
}
