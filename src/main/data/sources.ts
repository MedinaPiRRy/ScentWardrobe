import Database from 'better-sqlite3'
import { closeSync, openSync, readSync } from 'fs'
import { extname } from 'path'
import { StringDecoder } from 'string_decoder'

export type Row = Record<string, string>

export interface Source {
  format: 'csv' | 'jsonl' | 'sqlite'
  tables: string[] | null
  table: string | null
  columns: string[]
  rows(): Iterable<Row>
  /** JSONL only: the parsed objects as-is, for readers that understand nested data. */
  records?(): Iterable<Record<string, unknown>>
  close(): void
}

const CHUNK_BYTES = 4 * 1024 * 1024

/** True when the buffer is not valid UTF-8 (so the file is probably Latin-1 / Windows-1252). */
function looksLikeLatin1(sample: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true })
    return false
  } catch {
    return true
  }
}

/** Streams a file as text without ever holding all of it in memory (some dumps are over 500 MB). */
export function* readTextChunks(path: string): Generator<string> {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(CHUNK_BYTES)
    let decoder: StringDecoder | null = null
    let first = true
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK_BYTES, null)
      if (n === 0) break
      if (!decoder) decoder = new StringDecoder(looksLikeLatin1(buf.subarray(0, Math.min(n, 256 * 1024))) ? 'latin1' : 'utf8')
      let text = decoder.write(buf.subarray(0, n))
      if (first) {
        first = false
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      }
      if (text) yield text
    }
    const rest = decoder?.end()
    if (rest) yield rest
  } finally {
    closeSync(fd)
  }
}

/** Picks the delimiter that appears most often in the header line (outside quotes). */
export function detectDelimiter(headerLine: string): string {
  let best = ','
  let bestCount = 0
  for (const d of [',', ';', '\t', '|']) {
    let count = 0
    let quoted = false
    for (const ch of headerLine) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** RFC 4180 style parser over a stream of text chunks: quoted fields, escaped quotes, embedded newlines, CRLF. */
export function* parseCsvRows(input: string | Iterable<string>, delimiter: string): Generator<string[]> {
  const chunks = typeof input === 'string' ? [input] : input
  let field = ''
  let row: string[] = []
  let quoted = false
  let quoteSeen = false // inside quotes, just saw a '"' that may be the first half of an escaped quote
  let crSeen = false

  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]
      if (quoteSeen) {
        quoteSeen = false
        if (ch === '"') {
          field += '"'
          continue
        }
        quoted = false // that quote closed the field; handle this character normally
      } else if (quoted) {
        if (ch === '"') quoteSeen = true
        else field += ch
        continue
      }
      if (crSeen) {
        crSeen = false
        if (ch === '\n') continue
      }
      if (ch === '"' && field === '') quoted = true
      else if (ch === delimiter) {
        row.push(field)
        field = ''
      } else if (ch === '\n' || ch === '\r') {
        crSeen = ch === '\r'
        row.push(field)
        field = ''
        if (row.length > 1 || row[0] !== '') yield row
        row = []
      } else field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') yield row
  }
}

function csvSource(path: string): Source {
  // Delimiter comes from the first line of the first chunk.
  const probe = readTextChunks(path).next()
  if (probe.done) throw new Error('The file is empty.')
  const head = probe.value
  const nl = head.search(/\r|\n/)
  const delimiter = detectDelimiter(nl < 0 ? head : head.slice(0, nl))

  const headerIter = parseCsvRows(readTextChunks(path), delimiter)
  const header = headerIter.next().value as string[] | undefined
  headerIter.return(undefined)
  if (!header) throw new Error('The file is empty.')
  const columns = header.map((h, i) => h.trim() || `column_${i + 1}`)

  return {
    format: 'csv',
    tables: null,
    table: null,
    columns,
    *rows() {
      let first = true
      for (const cells of parseCsvRows(readTextChunks(path), delimiter)) {
        if (first) {
          first = false // header
          continue
        }
        const r: Row = {}
        for (let i = 0; i < columns.length; i++) r[columns[i]] = (cells[i] ?? '').trim()
        yield r
      }
    },
    close() {}
  }
}

const asText = (v: unknown): string => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).trim()

function* jsonLines(path: string): Generator<string> {
  let carry = ''
  for (const chunk of readTextChunks(path)) {
    const parts = (carry + chunk).split('\n')
    carry = parts.pop() ?? ''
    for (const p of parts) if (p.trim()) yield p
  }
  if (carry.trim()) yield carry
}

/** One JSON object per line; a damaged line, or one that is not an object, is skipped instead of aborting a long import. */
function parseJsonObject(line: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(line) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function jsonlSource(path: string): Source {
  const columns = new Set<string>()
  let seen = 0
  for (const l of jsonLines(path)) {
    const o = parseJsonObject(l)
    if (!o) continue
    for (const k of Object.keys(o)) columns.add(k)
    if (++seen >= 200) break
  }
  if (seen === 0) throw new Error('The file is empty.')
  return {
    format: 'jsonl',
    tables: null,
    table: null,
    columns: [...columns],
    *rows() {
      for (const l of jsonLines(path)) {
        const o = parseJsonObject(l)
        if (!o) continue
        yield Object.fromEntries(Object.entries(o).map(([k, v]) => [k, asText(v)]))
      }
    },
    *records() {
      for (const l of jsonLines(path)) {
        const o = parseJsonObject(l)
        if (o) yield o
      }
    },
    close() {}
  }
}

function sqliteSource(path: string, table?: string): Source {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name)
  if (tables.length === 0) {
    db.close()
    throw new Error('This database has no tables.')
  }
  const chosen = table && tables.includes(table) ? table : tables[0]
  const quoted = `"${chosen.replace(/"/g, '""')}"`
  const columns = (db.prepare(`PRAGMA table_info(${quoted})`).all() as { name: string }[]).map((c) => c.name)
  return {
    format: 'sqlite',
    tables,
    table: chosen,
    columns,
    *rows() {
      for (const r of db.prepare(`SELECT * FROM ${quoted}`).iterate() as Iterable<Record<string, unknown>>) {
        yield Object.fromEntries(Object.entries(r).map(([k, v]) => [k, asText(v)]))
      }
    },
    close() {
      db.close()
    }
  }
}

export function openSource(path: string, table?: string): Source {
  const ext = extname(path).toLowerCase()
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') return csvSource(path)
  if (ext === '.jsonl' || ext === '.ndjson' || ext === '.json') return jsonlSource(path)
  if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') return sqliteSource(path, table)
  throw new Error(`Unsupported file type "${ext}". Use a .csv, .jsonl or .db / .sqlite file. Unzip archives first.`)
}
