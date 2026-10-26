import { it, expect } from "vite-plus/test"
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readAttachment } from "./read-attachment"

it("bounds reads and refuses empty or oversized files before upload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "void-chat-file-"))
  const paths = [
    join(directory, "empty.txt"),
    join(directory, "large.txt"),
    join(directory, "limit.txt"),
  ]
  try {
    await writeFile(paths[0], "")
    await writeFile(paths[1], Buffer.alloc(512 * 1024 + 1, 120))
    await writeFile(paths[2], Buffer.alloc(512 * 1024, 120))
    expect(await readAttachment(paths[0])).toBeInstanceOf(Error)
    expect(await readAttachment(paths[1])).toBeInstanceOf(Error)
    const valid = await readAttachment(paths[2])
    expect(valid).toBeInstanceOf(Uint8Array)
    if (!(valid instanceof Error)) expect(valid.byteLength).toBe(512 * 1024)
  } finally {
    for (const path of paths) await unlink(path)
    await rmdir(directory)
  }
})
