/**
 * 城市库合并：主 JSON + 静态兜底；总数封顶，避免异常体积。
 */

const MAX_CITIES = 50

/** 推荐顺序（优先出现在合并结果中） */
export const CITY_PRIORITY = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "南京",
  "成都",
  "武汉",
  "西安",
  "重庆",
  "天津",
  "苏州",
  "长沙",
  "郑州",
  "合肥",
  "福州",
  "厦门",
  "青岛",
  "宁波",
  "昆明",
  "南昌",
  "贵阳",
  "沈阳",
  "大连",
  "哈尔滨",
  "长春",
  "济南",
  "石家庄",
  "太原",
  "兰州",
  "海口",
  "南宁",
  "乌鲁木齐",
  "呼和浩特",
  "银川",
  "拉萨",
  "东京",
  "香港",
  "新加坡",
  "纽约",
  "伦敦",
  "巴黎",
  "柏林",
  "悉尼",
  "多伦多"
]

export function stripCostFields(row) {
  if (!row || typeof row !== "object") return null
  const rent = Number(row.rent)
  const food = Number(row.food)
  const transport = Number(row.transport)
  const shopping = Number(row.shopping)
  const utility = Number(row.utility)
  if (![rent, food, transport, shopping, utility].every((x) => Number.isFinite(x))) {
    return null
  }
  const letter = typeof row.letter === "string" ? row.letter : ""
  const kw = Array.isArray(row.kw) ? row.kw.map(String) : []
  return {
    rent,
    food,
    transport,
    shopping,
    utility,
    ...(letter ? { letter } : {}),
    ...(kw.length ? { kw } : {})
  }
}

/**
 * 合并远程与兜底数据集；按 CITY_PRIORITY 排序后截断。
 */
/** 极简兜底库（网络失败或主 JSON 损坏时合并） */
export const STATIC_MINIMAL_CITIES = {
  北京: {
    rent: 7495,
    food: 2600,
    transport: 650,
    shopping: 1300,
    utility: 650,
    letter: "B",
    kw: ["beijing", "bj", "Beijing"]
  },
  上海: {
    rent: 8200,
    food: 2900,
    transport: 700,
    shopping: 1500,
    utility: 730,
    letter: "S",
    kw: ["shanghai", "sh", "Shanghai"]
  },
  杭州: {
    rent: 5600,
    food: 2300,
    transport: 560,
    shopping: 1050,
    utility: 520,
    letter: "H",
    kw: ["hangzhou", "hz", "Hangzhou"]
  }
}

export function mergeCityDatasets(primary, fallback = {}) {
  const merged = { ...fallback, ...primary }
  const orderedNames = []
  for (const name of CITY_PRIORITY) {
    if (merged[name] && stripCostFields(merged[name])) orderedNames.push(name)
  }
  const rest = Object.keys(merged)
    .filter((n) => !orderedNames.includes(n))
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
  const fullOrder = [...orderedNames, ...rest]
  const out = {}
  let count = 0
  for (const name of fullOrder) {
    if (count >= MAX_CITIES) break
    const row = stripCostFields(merged[name])
    if (!row) continue
    out[name] = row
    count++
  }
  return out
}
