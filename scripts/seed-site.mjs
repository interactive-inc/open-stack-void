const target = new URL(process.env.VOID_SITE_SEED_URL ?? "http://127.0.0.1:4321")
if (
  target.protocol !== "http:" ||
  target.hostname !== "127.0.0.1" ||
  target.username ||
  target.password ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error("Seed target must be an HTTP 127.0.0.1 development origin")
const response = await fetch(new URL("/_emdash/api/setup/local-seed", target), {
  method: "POST",
  headers: { Origin: target.origin },
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok)
  throw new Error(`Local sample seed failed (${response.status}); start the site with vp run dev`)
console.log(JSON.stringify(await response.json()))
