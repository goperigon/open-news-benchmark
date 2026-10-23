/** Minimal RFC4180-style CSV parser (quoted fields, commas). */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1
      }
      row.push(field)
      field = ''
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
      }
      row = []
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row)
  }
  return rows
}

export function csvRowToRecord(header: string[], cells: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < header.length; i += 1) {
    const key = header[i]?.trim()
    if (!key) {
      continue
    }
    out[key] = cells[i] ?? ''
  }
  return out
}
