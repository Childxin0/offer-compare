/**
 * 城市目录：分组排序 + 搜索匹配（中文 / 英文 / 拼音缩写等来自 cities.json 的 kw）。
 */

export function normalizeKeyword(str) {
  return String(str ?? "")
    .trim()
    .toLowerCase()
}

/** @returns {{ name: string, letter: string, kw: string[] }[]} */
export function buildCityCatalog(cityCostData) {
  const names = Object.keys(cityCostData || {})
  const items = names.map((name) => {
    const row = cityCostData[name]
    const rawLetter = typeof row?.letter === "string" && row.letter.length ? row.letter : "?"
    const letter = rawLetter.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "#"
    const extra = Array.isArray(row?.kw) ? row.kw.map((x) => String(x)) : []
    const kwSet = new Set()
    kwSet.add(name)
    extra.forEach((k) => kwSet.add(k))
    return { name, letter, kw: [...kwSet] }
  })
  items.sort((a, b) => {
    if (a.letter !== b.letter) return a.letter.localeCompare(b.letter)
    return a.name.localeCompare(b.name, "zh-CN")
  })
  return items
}

export function cityMatchesQuery(item, queryRaw) {
  const q0 = String(queryRaw ?? "").trim()
  if (!q0) return true
  const q = normalizeKeyword(q0)
  if (!q) return true
  if (item.name.includes(q0)) return true
  if (normalizeKeyword(item.name).includes(q)) return true
  return item.kw.some((k) => {
    const nk = normalizeKeyword(k)
    return nk.includes(q) || q.includes(nk) || k.includes(q0)
  })
}
