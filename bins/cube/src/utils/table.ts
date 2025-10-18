export function printTable(data: Record<string, string>[]) {
  const maxLengthByColumn: Record<string, number> = {}
  for (const row of data) {
    for (const key in row) {
      const value = row[key]
      const length = value.length
      if (!maxLengthByColumn[key] || length > maxLengthByColumn[key]) {
        maxLengthByColumn[key] = length
      }
    }
  }
  for (const key in maxLengthByColumn) {
    if (key.length > maxLengthByColumn[key]) {
      maxLengthByColumn[key] = key.length
    }
  }
  const headers = Object.keys(maxLengthByColumn)
  const headerLine = headers
    .map((key) => key.toUpperCase().padEnd(maxLengthByColumn[key]))
    .join(' | ')
  console.log(headerLine)
  console.log(headers.map((key) => '-'.repeat(maxLengthByColumn[key])).join('-|-'))
  for (const row of data) {
    const line = headers.map((key) => (row[key] || '').padEnd(maxLengthByColumn[key])).join(' | ')
    console.log(line)
  }
}
