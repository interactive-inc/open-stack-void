import { afterEach, expect, it, vi } from "vite-plus/test"
import { DatabaseSync } from "node:sqlite"
import { readFileSync, readdirSync } from "node:fs"
import { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import { InviteMember } from "@/contexts/membership/application/invite-member"
import { DispatchInvitation } from "@/contexts/membership/application/dispatch-invitation"
import type { InvitationDeliveryOutcome } from "@/contexts/membership/domain/invitation-delivery"
import type { Member } from "@/contexts/membership/domain/member"

const owner: Member = {
  id: "owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  createdAt: 0,
}
const databases: DatabaseSync[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const db of databases.splice(0)) db.close()
})

function fixture() {
  const db = new DatabaseSync(":memory:")
  databases.push(db)
  db.exec("PRAGMA foreign_keys = ON")
  const directory = new URL("../../../../db/migrations/", import.meta.url)
  for (const file of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, directory), "utf8"))
  for (const [id, role, status] of [
    ["owner", "owner", "active"],
    ["admin", "admin", "active"],
    ["member", "member", "active"],
    ["disabled", "admin", "disabled"],
  ])
    db.prepare(
      "INSERT INTO chat_members (id,email,name,role,status,created_at) VALUES (?,?,?,?,?,0)",
    ).run(id, `${id}@example.com`, id, role, status)
  class Statement {
    private values: (string | number | null)[] = []
    constructor(private sql: string) {}
    bind(...values: (string | number | null)[]) {
      this.values = values
      return this
    }
    execute() {
      const query = db.prepare(this.sql)
      if (query.columns().length)
        return { results: query.all(...this.values), meta: { changes: 0 } }
      return { results: [], meta: { changes: Number(query.run(...this.values).changes) } }
    }
    async run() {
      return this.execute()
    }
    async first() {
      return this.execute().results[0] ?? null
    }
  }
  const database = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN IMMEDIATE")
      try {
        const results = statements.map((statement) => statement.execute())
        db.exec("COMMIT")
        return results
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
  } as unknown as D1Database
  const repo = new InvitationRepository({ database })
  const id = crypto.randomUUID()
  const create = (actor = owner) =>
    new InviteMember({ invitations: repo }).execute(actor, {
      id,
      email: "guest@example.com",
      hash: `unused-${id}`,
      expiresAt: Date.now() + 100_000_000,
    })
  let issued = 0
  const sent: { link: string; key: string }[] = []
  const dispatch = (send: () => Promise<InvitationDeliveryOutcome> = async () => "sent") =>
    new DispatchInvitation({
      invitations: repo,
      issueLink: async () => {
        issued++
        return { hash: `hash-${issued}`, link: `fake-private-link-${issued}` }
      },
      mail: {
        send: async (_email, link, key) => {
          sent.push({ link, key })
          return send()
        },
      },
    })
  const request = (attempts = 0, acknowledgeUnknown = false) => ({
    id,
    attempts,
    acknowledgeUnknown,
  })
  const row = () =>
    db
      .prepare(
        "SELECT state, hash, delivery_state AS deliveryState, delivery_attempts AS attempts, delivery_lease AS lease FROM chat_invitations WHERE id = ?",
      )
      .get(id)
  return { db, repo, id, create, sent, dispatch, request, row }
}

it("records queued intent atomically, preserves settled request IDs and does not store a replay secret", async () => {
  const f = fixture()
  expect(await f.create()).toMatchObject({
    created: true,
    invitation: { delivery: { state: "queued", attempts: 0 } },
  })
  expect(await f.create()).toMatchObject({ created: false })
  expect(f.sent).toHaveLength(0)
  await f.repo.revoke(owner.id, f.id)
  expect(await f.create()).toMatchObject({ reason: "used" })
  expect(f.row()).toMatchObject({ state: "revoked", deliveryState: "queued", attempts: 0 })
  expect(
    f.db
      .prepare("PRAGMA table_info(chat_invitations)")
      .all()
      .map((row) => row.name),
  ).not.toContain("token")
})

it("allows only current managers to read, retry or cancel without leaking invitation metadata", async () => {
  const f = fixture()
  await f.create()
  const before = f.row()
  for (const id of ["member", "disabled", "outsider"]) {
    expect(await f.repo.findMany(id)).toMatchObject({ reason: "forbidden" })
    expect(await f.repo.claimDelivery(id, f.request(), "new-hash", "new-lease")).toMatchObject({
      reason: "forbidden",
    })
    expect(await f.repo.revoke(id, f.id)).toBe(false)
  }
  expect(f.row()).toEqual(before)
  expect(await f.repo.findMany("admin")).toHaveLength(1)
})

it("resumes persisted queued work after restart and prevents duplicate jobs from sending twice", async () => {
  const f = fixture()
  await f.create()
  const dispatcher = f.dispatch()
  await Promise.all([
    dispatcher.execute(owner, f.request()),
    f.dispatch().execute(owner, f.request()),
  ])
  expect(f.sent).toHaveLength(1)
  expect(f.sent[0]?.key).toBe(`invitation:${f.id}:1`)
  expect(f.row()).toMatchObject({ deliveryState: "sent", attempts: 1, lease: null })
  expect(await f.dispatch().execute(owner, f.request(1))).toMatchObject({
    reason: "delivery-state",
  })
  expect(await f.create()).toMatchObject({ created: false })
  expect(f.sent).toHaveLength(1)
})

it("bounds explicit known-failure retries and rejects stale recovery requests", async () => {
  const f = fixture()
  await f.create()
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(await f.dispatch(async () => "failed").execute(owner, f.request(attempt))).toEqual({
      ok: true,
    })
    expect(await f.dispatch().execute(owner, f.request(attempt))).toMatchObject({
      reason: "delivery-state",
    })
  }
  expect(await f.dispatch().execute(owner, f.request(3, true))).toMatchObject({
    reason: "delivery-state",
  })
  expect(f.sent).toHaveLength(3)
  expect(new Set(f.sent.map((mail) => mail.key)).size).toBe(3)
  expect(f.row()).toMatchObject({ deliveryState: "failed", attempts: 3 })
})

it("allows an active admin to resume another currently authorized manager's queued intent", async () => {
  const f = fixture()
  await f.create()
  expect(await f.dispatch().execute({ ...owner, id: "admin", role: "admin" }, f.request())).toEqual(
    { ok: true },
  )
  expect(f.sent).toHaveLength(1)
  expect(f.row()).toMatchObject({ deliveryState: "sent", attempts: 1 })
})

it("treats timeout as unknown and ignores a late accepted response", async () => {
  vi.useFakeTimers()
  const f = fixture()
  await f.create()
  let accepted!: (value: InvitationDeliveryOutcome) => void
  const running = f
    .dispatch(
      () =>
        new Promise((resolve) => {
          accepted = resolve
        }),
    )
    .execute(owner, f.request())
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await running).toEqual({ ok: true })
  expect(f.row()).toMatchObject({ deliveryState: "unknown", attempts: 1 })
  accepted("sent")
  await Promise.resolve()
  expect(f.row()).toMatchObject({ deliveryState: "unknown" })
  expect(await f.dispatch().execute(owner, f.request(1))).toMatchObject({
    reason: "delivery-state",
  })
  expect(f.sent).toHaveLength(1)
})

it("requires explicit acknowledgement after accepted mail loses its response; recovery rotates the old link", async () => {
  const f = fixture()
  await f.create()
  await f
    .dispatch(async () => {
      throw new Error("private provider diagnostics")
    })
    .execute(owner, f.request())
  const oldHash = f.row()?.hash
  expect(f.row()).toMatchObject({ deliveryState: "unknown" })
  expect(await f.dispatch().execute(owner, f.request(1))).toMatchObject({
    reason: "delivery-state",
  })
  expect(await f.dispatch().execute(owner, f.request(1, true))).toEqual({ ok: true })
  expect(f.sent).toHaveLength(2)
  expect(f.row()?.hash === oldHash).toBe(false)
  expect(f.row()).toMatchObject({ deliveryState: "sent", attempts: 2 })
})

it("marks crashed leased work unknown after expiry instead of automatically redelivering", async () => {
  const f = fixture()
  await f.create()
  await f.repo.claimDelivery(owner.id, f.request(), "crashed-hash", "crashed-lease")
  expect(await f.repo.findMany(owner.id)).toMatchObject([{ delivery: { state: "sending" } }])
  f.db.exec("UPDATE chat_invitations SET delivery_lease_until = 0")
  expect(await f.repo.findMany(owner.id)).toMatchObject([{ delivery: { state: "unknown" } }])
  expect(await f.dispatch().execute(owner, f.request(1))).toMatchObject({
    reason: "delivery-state",
  })
  await f.repo.settleDelivery(f.id, "crashed-lease", "sent")
  // An expired worker cannot settle a lease even if it eventually receives an acknowledgement.
  expect(f.row()).toMatchObject({ deliveryState: "unknown" })
  expect(f.sent).toHaveLength(0)
})

it("never dispatches cancelled, expired, accepted or currently unauthorized invitations", async () => {
  for (const mutation of [
    "UPDATE chat_invitations SET expires_at = 0",
    "UPDATE chat_invitations SET state = 'accepted'",
    "UPDATE chat_members SET role = 'member' WHERE id = 'owner'",
    "UPDATE chat_members SET status = 'disabled' WHERE id = 'owner'",
  ]) {
    const f = fixture()
    await f.create()
    f.db.exec(mutation)
    expect(
      await f.dispatch().execute({ ...owner, id: "admin", role: "admin" }, f.request()),
    ).toMatchObject({ reason: "delivery-state" })
    expect(f.sent).toHaveLength(0)
  }
  const f = fixture()
  await f.create()
  await f.repo.revoke(owner.id, f.id)
  expect(await f.dispatch().execute(owner, f.request(0, true))).toMatchObject({
    reason: "delivery-state",
  })
  expect(f.sent).toHaveLength(0)
})

it("rechecks cancellation and inviter role loss between lease acquisition and dispatch", async () => {
  for (const cancel of [true, false]) {
    const f = fixture()
    await f.create()
    const dispatcher = new DispatchInvitation({
      invitations: {
        claimDelivery: async (...args) => {
          const result = await f.repo.claimDelivery(...args)
          if (cancel) await f.repo.revoke(owner.id, f.id)
          else f.db.exec("UPDATE chat_members SET role = 'member' WHERE id = 'owner'")
          return result
        },
        canDeliver: (...args) => f.repo.canDeliver(...args),
        settleDelivery: (...args) => f.repo.settleDelivery(...args),
      },
      issueLink: async () => ({ hash: "race-hash", link: "fake-link" }),
      mail: {
        send: async () => {
          throw new Error("must not dispatch")
        },
      },
    })
    expect(await dispatcher.execute(owner, f.request())).toMatchObject({ reason: "delivery-state" })
    expect(f.row()).toMatchObject(cancel ? { state: "revoked" } : { deliveryState: "failed" })
  }
})

it("does not resurrect cancellation or overwrite recovery when an earlier worker responds late", async () => {
  const f = fixture()
  await f.create()
  await f.repo.claimDelivery(owner.id, f.request(), "old-hash", "old-lease")
  f.db.exec("UPDATE chat_invitations SET delivery_lease_until = 0")
  await f.dispatch().execute(owner, f.request(1, true))
  await f.repo.settleDelivery(f.id, "old-lease", "failed")
  expect(f.row()).toMatchObject({ deliveryState: "sent", attempts: 2 })
  await f.repo.revoke(owner.id, f.id)
  await f.repo.settleDelivery(f.id, "old-lease", "sent")
  expect(await f.dispatch().execute(owner, f.request(2, true))).toMatchObject({
    reason: "delivery-state",
  })
  expect(f.row()).toMatchObject({ state: "revoked", attempts: 2 })
})
