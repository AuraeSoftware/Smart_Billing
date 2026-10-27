/** Shared CSV download for the report exports.
 *
 * A report is a list of sections (a title row, then rows); sections are
 * separated by a blank line so a single file can carry the report header
 * (what filters were applied), the summary figures and the detail rows.
 * Output is UTF-8 with a BOM so Excel opens currency symbols and non-Latin
 * names correctly, and cells that start with = + - @ are prefixed with an
 * apostrophe so a tenant or customer name can't run as a spreadsheet formula. */
export type CsvCell = string | number | boolean | null | undefined
export interface CsvSection { title?: string; headers?: string[]; rows: CsvCell[][] }

function cell(value: CsvCell): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`
  return `"${s.replaceAll('"', '""')}"`
}

export function buildCsv(sections: CsvSection[]): string {
  const lines: string[] = []
  sections.forEach((sec, i) => {
    if (i > 0) lines.push('')
    if (sec.title) lines.push(cell(sec.title))
    if (sec.headers) lines.push(sec.headers.map(cell).join(','))
    sec.rows.forEach((r) => lines.push(r.map(cell).join(',')))
  })
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, sections: CsvSection[]) {
  const blob = new Blob(['﻿', buildCsv(sections)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
