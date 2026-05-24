import { defineEventHandler, getQuery } from 'h3'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let cache: string[] | null = null

async function loadIds(): Promise<string[]> {
  if (cache) return cache
  const path = resolve(process.cwd(), 'assets/mock', 'mapping.json')
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw) as Array<{ id: string }>
  cache = parsed.map((e) => e.id)
  return cache
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawLimit = Number(query.limit)
  const ids = await loadIds()
  const limit = rawLimit > 0 ? Math.min(rawLimit, ids.length) : ids.length

  return {
    total: ids.length,
    ids: ids.slice(0, limit),
  }
})
