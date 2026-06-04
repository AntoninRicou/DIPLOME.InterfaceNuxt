import { defineEventHandler, createError, setHeader, sendStream } from 'h3'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, relative, basename, extname } from 'node:path'

// The originals live in the sibling "project" repo's datas/images. On a fresh
// clone that folder may carry its GitHub name (feedback-three-map) instead —
// accept either. NOTE: datas/ is git-ignored, so the images must be copied
// to the machine manually; they are not part of the clone.
const IMAGES_DIR =
  ['project/datas/images', 'feedback-three-map/datas/images']
    .map((p) => resolve(process.cwd(), '..', p))
    .find((p) => existsSync(p)) ?? resolve(process.cwd(), '..', 'project', 'datas', 'images')

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export default defineEventHandler(async (event) => {
  const name = basename(String(event.context.params?.file ?? ''))
  if (!name) throw createError({ statusCode: 400, statusMessage: 'missing file' })

  const filePath = resolve(IMAGES_DIR, name)
  const rel = relative(IMAGES_DIR, filePath)
  if (!rel || rel.startsWith('..')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid path' })
  }

  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) throw createError({ statusCode: 404, statusMessage: 'not found' })

  const ext = extname(filePath).toLowerCase()
  setHeader(event, 'Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  setHeader(event, 'Content-Length', info.size)
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return sendStream(event, createReadStream(filePath))
})
