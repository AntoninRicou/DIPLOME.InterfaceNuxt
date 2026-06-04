import { defineEventHandler, createError, setHeader, sendStream } from 'h3'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, relative, basename, extname } from 'node:path'

// The atlas lives in the sibling "process" repo. On a fresh clone that folder
// may carry its GitHub name (DIPLOME.PROCESSDATA) instead — accept either.
const ATLAS_DIR =
  ['process/cache', 'DIPLOME.PROCESSDATA/cache']
    .map((p) => resolve(process.cwd(), '..', p))
    .find((p) => existsSync(p)) ?? resolve(process.cwd(), '..', 'process', 'cache')

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
}

export default defineEventHandler(async (event) => {
  const name = basename(String(event.context.params?.file ?? ''))
  if (!name) throw createError({ statusCode: 400, statusMessage: 'missing file' })

  const filePath = resolve(ATLAS_DIR, name)
  const rel = relative(ATLAS_DIR, filePath)
  if (!rel || rel.startsWith('..')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid path' })
  }

  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) throw createError({ statusCode: 404, statusMessage: 'not found' })

  const ext = extname(filePath).toLowerCase()
  setHeader(event, 'Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  setHeader(event, 'Content-Length', info.size)
  setHeader(event, 'Cache-Control', 'public, max-age=3600')
  return sendStream(event, createReadStream(filePath))
})
