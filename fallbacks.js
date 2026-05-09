/**
 * Fallback 架构：所有兜底策略集中在此，便于审计与产品说明。
 * - 输入缺失 → INPUT_DEFAULTS
 * - 城市无数据 → NATIONAL_AVERAGE（基于已加载 cities 聚合）
 * - 解释/图表失败 → 见 explanation.js / radarChart.js 内调用方
 */

export const INPUT_DEFAULTS = {
  salary: 20000,
  /** 用户未填房租时，使用城市基准 rent（来自 cities.json 或全国均值） */
  rent: null,
  /** 用户未填通勤时，使用城市 transport 基准 */
  commute: null,
  workMode: "955",
  /** low | mid | high */
  growth: "mid",
  brand: false
}

/** 在 cities.json 尚未加载时使用的占位全国均值（与 DEMO 数据量级一致） */
export const STATIC_NATIONAL_FALLBACK = {
  rent: 5500,
  food: 2400,
  transport: 600,
  shopping: 1000,
  utility: 550
}

/**
 * 基于已加载城市表计算全国平均成本（Fallback：城市键不存在时使用）。
 */
export function computeNationalAverageCost(cityCostData) {
  const keys = Object.keys(cityCostData || {})
  if (!keys.length) {
    return { ...STATIC_NATIONAL_FALLBACK, _source: "static_national_fallback" }
  }
  const sums = { rent: 0, food: 0, transport: 0, shopping: 0, utility: 0 }
  for (const k of keys) {
    const row = cityCostData[k]
    if (!row) continue
    sums.rent += row.rent || 0
    sums.food += row.food || 0
    sums.transport += row.transport || 0
    sums.shopping += row.shopping || 0
    sums.utility += row.utility || 0
  }
  const n = keys.length
  return {
    rent: Math.round(sums.rent / n),
    food: Math.round(sums.food / n),
    transport: Math.round(sums.transport / n),
    shopping: Math.round(sums.shopping / n),
    utility: Math.round(sums.utility / n),
    _source: "computed_national_average"
  }
}

/**
 * 解析单城成本行：城市存在则用库内数据，否则用全国聚合均值。
 */
export function resolveCityCostRow(cityName, cityCostData) {
  const national = computeNationalAverageCost(cityCostData)
  if (cityCostData[cityName]) {
    return {
      row: cityCostData[cityName],
      source: "city_table",
      cityLabel: cityName
    }
  }
  return {
    row: {
      rent: national.rent,
      food: national.food,
      transport: national.transport,
      shopping: national.shopping,
      utility: national.utility
    },
    source: "national_average_fallback",
    cityLabel: `${cityName}（全国均值估算）`
  }
}

/**
 * 合并用户可选覆盖：房租、通勤缺失时用基准行对应字段。
 */
export function buildEffectiveCostRow(baseRow, rentOverride, commuteOverride) {
  const rent = Number.isFinite(rentOverride) && rentOverride >= 0 ? rentOverride : baseRow.rent
  const transport =
    Number.isFinite(commuteOverride) && commuteOverride >= 0 ? commuteOverride : baseRow.transport
  return {
    ...baseRow,
    rent,
    transport,
    _usedRentDefault: !(Number.isFinite(rentOverride) && rentOverride >= 0),
    _usedCommuteDefault: !(Number.isFinite(commuteOverride) && commuteOverride >= 0)
  }
}

export function coerceNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function coerceGrowth(value) {
  if (value === "low" || value === "mid" || value === "high") return value
  return INPUT_DEFAULTS.growth
}

export function coerceWorkMode(value) {
  if (value === "955" || value === "996" || value === "bigsmall") return value
  return INPUT_DEFAULTS.workMode
}
