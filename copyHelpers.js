/**
 * 决策文案：金额方向、体感差异等统一口径，避免「高 ¥-17200」类逻辑错误。
 */

const fmt = new Intl.NumberFormat("zh-CN")

export function formatMoneyAbs(amount) {
  const n = Math.abs(Number(amount) || 0)
  return `¥${fmt.format(Math.round(n))}`
}

/** 税前月薪对比：始终用「高/低 + 正数金额」 */
export function phraseSalaryVs(cityA, cityB, salaryA, salaryB) {
  const a = Number(salaryA)
  const b = Number(salaryB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return `${cityA} 与 ${cityB} 的税前月薪输入不足以对比`
  }
  const d = a - b
  if (Math.abs(d) < 1e-6) {
    return `${cityA} 与 ${cityB} 税前月薪基本一致`
  }
  if (d > 0) {
    return `${cityA} 比 ${cityB} 税前月薪高 ${formatMoneyAbs(d)}`
  }
  return `${cityB} 比 ${cityA} 税前月薪高 ${formatMoneyAbs(d)}`
}

/** 模型口径下的房租（有效房租）对比 */
export function phraseRentVs(cityA, cityB, rentA, rentB) {
  const a = Number(rentA)
  const b = Number(rentB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return "房租口径不足以对比"
  }
  const d = a - b
  if (Math.abs(d) < 1e-6) {
    return `在模型口径下，${cityA} 与 ${cityB} 的基准房租接近`
  }
  if (d > 0) {
    return `在模型口径下，${cityA} 月房租比 ${cityB} 高 ${formatMoneyAbs(d)}`
  }
  return `在模型口径下，${cityB} 月房租比 ${cityA} 高 ${formatMoneyAbs(d)}`
}

/** 可支配现金流对比 */
export function phraseDisposableVs(cityA, cityB, dispA, dispB) {
  const a = Number(dispA)
  const b = Number(dispB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return `${cityA} 与 ${cityB} 的可支配口径不足以对比`
  }
  const d = a - b
  if (Math.abs(d) < 1e-6) {
    return `${cityA} 与 ${cityB} 估算可支配基本持平`
  }
  if (d > 0) {
    return `${cityA} 比 ${cityB} 可支配高约 ${formatMoneyAbs(d)}`
  }
  return `${cityB} 比 ${cityA} 可支配高约 ${formatMoneyAbs(d)}`
}

export function safeAreaText(area) {
  const x = Number(area)
  if (!Number.isFinite(x) || x < 0) return "—"
  return x.toFixed(1)
}

/**
 * 居住体感（可租面积代理）：对称相对差 + 小差异合并 + 不可靠时不输出百分比。
 */
export function describeLivabilityComparison(cityA, cityB, areaA, areaB) {
  const a = Number(areaA)
  const b = Number(areaB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return "当前数据不足以形成明显差异：可租面积估算不可靠。"
  }
  if (a <= 0 && b <= 0) {
    return "当前数据不足以形成明显差异：两侧可租面积估算均偏低，不适合用百分比概括。"
  }
  if (a <= 0 || b <= 0) {
    return "当前数据不足以形成明显差异：一侧可租面积估算异常，建议核对房租与可支配收入。"
  }
  const denom = a + b
  if (!Number.isFinite(denom) || denom <= 0) {
    return "当前数据不足以形成明显差异。"
  }
  const sym = (2 * Math.abs(a - b)) / denom * 100
  if (!Number.isFinite(sym) || sym > 500) {
    return "当前数据不足以形成明显差异。"
  }
  if (sym < 3) {
    return "整体居住体感接近：在模型口径下，可租面积的相对差距很小。"
  }
  const rounded = Math.min(999, Math.round(sym))
  const richer = a > b ? cityA : cityB
  const leaner = a > b ? cityB : cityA
  return `若以「可租面积」代理居住体感，两者相对差距约 ${rounded}%（${richer} 相对更宽裕，${leaner} 相对更紧凑；仅供参考）。`
}
