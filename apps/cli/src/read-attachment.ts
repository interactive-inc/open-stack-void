import { open } from "node:fs/promises"

export async function readAttachment(path: string): Promise<Uint8Array<ArrayBuffer> | Error> {
  const maximum = 512 * 1024
  const file = await open(path, "r")
  try {
    const info = await file.stat()
    if (!info.isFile()) return new Error("通常のファイルを選んでください")
    if (info.size > maximum) return new Error("添付は512KiB以下にしてください")
    const bytes = new Uint8Array(maximum + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > maximum) return new Error("添付は512KiB以下にしてください")
    if (!offset) return new Error("空のファイルは添付できません")
    return bytes.slice(0, offset)
  } finally {
    await file.close()
  }
}
