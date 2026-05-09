import {
  INPUT_DEFAULTS,
  buildEffectiveCostRow,
  coerceGrowth,
  coerceNumber,
  coerceWorkMode,
  resolveCityCostRow
} from "./fallbacks.js"
import { mergeCityDatasets, STATIC_MINIMAL_CITIES } from "./cityDataset.js"
import {
  describeLivabilityComparison,
  phraseRentVs,
  phraseSalaryVs,
  safeAreaText
} from "./copyHelpers.js"
import { safeGenerateExplanation } from "./explanation.js"
import { mountCityPicker } from "./cityPicker.js"
import { renderTradeoffRadar } from "./radarChart.js"
import embeddedCities from "./cities.embedded.json"

const STORAGE_KEY = "offer-compare:last-state"
/** 兼容 Vite base（含 Vercel 子路径部署）：相对站点根的 cities.json */
const __BASE = import.meta.env.BASE_URL ?? "/"
const CITIES_DATA_URL = `${__BASE.endsWith("/") ? __BASE : `${__BASE}/`}cities.json`
const formatter = new Intl.NumberFormat("zh-CN")
const SCORE_WARN_THRESHOLD = 40
const WORK_HOURS_MAP = {
  "955": 40,
  "bigsmall": 60,
  "996": 72
}
const BEIJING_BASE_RENT_PER_SQM = 125

const GROWTH_LABEL = {
  low: "成长受限",
  mid: "成长中等",
  high: "成长充足"
}

let cityCostData = {}
let cityPickerA = null
let cityPickerB = null

const el = {
  cityA: document.getElementById("cityA"),
  cityB: document.getElementById("cityB"),
  wrapCityA: document.getElementById("wrapCityA"),
  wrapCityB: document.getElementById("wrapCityB"),
  salaryA: document.getElementById("salaryA"),
  salaryB: document.getElementById("salaryB"),
  rentA: document.getElementById("rentA"),
  rentB: document.getElementById("rentB"),
  commuteA: document.getElementById("commuteA"),
  commuteB: document.getElementById("commuteB"),
  growthA: document.getElementById("growthA"),
  growthB: document.getElementById("growthB"),
  brandA: document.getElementById("brandA"),
  brandB: document.getElementById("brandB"),
  workModeA: document.getElementById("workModeA"),
  workModeB: document.getElementById("workModeB"),
  leftDisposable: document.getElementById("leftDisposable"),
  rightDisposable: document.getElementById("rightDisposable"),
  winnerText: document.getElementById("winnerText"),
  eqTextAtoB: document.getElementById("eqTextAtoB"),
  eqTextBtoA: document.getElementById("eqTextBtoA"),
  eqValueAtoB: document.getElementById("eqValueAtoB"),
  eqValueBtoA: document.getElementById("eqValueBtoA"),
  detailA: document.getElementById("detailA"),
  detailB: document.getElementById("detailB"),
  detailTitleA: document.getElementById("detailTitleA"),
  detailTitleB: document.getElementById("detailTitleB"),
  compareBtn: document.getElementById("compareBtn"),
  loadStatus: document.getElementById("loadStatus"),
  loadError: document.getElementById("loadError"),
  retryBtn: document.getElementById("retryBtn"),
  insightPPP: document.getElementById("insightPPP"),
  insightRisk: document.getElementById("insightRisk"),
  scoreLabelA: document.getElementById("scoreLabelA"),
  scoreLabelB: document.getElementById("scoreLabelB"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  scoreBarA: document.getElementById("scoreBarA"),
  scoreBarB: document.getElementById("scoreBarB"),
  stressWarning: document.getElementById("stressWarning"),
  weightsTitleA: document.getElementById("weightsTitleA"),
  weightsTitleB: document.getElementById("weightsTitleB"),
  moneyScoreA: document.getElementById("moneyScoreA"),
  timeScoreA: document.getElementById("timeScoreA"),
  liveScoreA: document.getElementById("liveScoreA"),
  careerScoreA: document.getElementById("careerScoreA"),
  moneyScoreB: document.getElementById("moneyScoreB"),
  timeScoreB: document.getElementById("timeScoreB"),
  liveScoreB: document.getElementById("liveScoreB"),
  careerScoreB: document.getElementById("careerScoreB"),
  moneyBarA: document.getElementById("moneyBarA"),
  timeBarA: document.getElementById("timeBarA"),
  liveBarA: document.getElementById("liveBarA"),
  careerBarA: document.getElementById("careerBarA"),
  moneyBarB: document.getElementById("moneyBarB"),
  timeBarB: document.getElementById("timeBarB"),
  liveBarB: document.getElementById("liveBarB"),
  careerBarB: document.getElementById("careerBarB"),
  aiExplainBody: document.getElementById("aiExplainBody"),
  aiExplainBanner: document.getElementById("aiExplainBanner"),
  tradeoffCard: document.getElementById("tradeoffCard"),
  radarRoot: document.getElementById("radarRoot"),
  radarSvg: document.getElementById("radarSvg"),
  radarTooltip: document.getElementById("radarTooltip"),
  radarLegendNote: document.getElementById("radarLegendNote")
}

const PMInsightEngine = {
  calculateEquivalentSalary(sourceSalary, sourceCost, targetCost) {
    return sourceSalary - sourceCost + targetCost
  },

  calculateTrueHourly(monthlySalary, workMode) {
    const annualPackage = Number(monthlySalary) * 12
    const weeklyHours = Math.max(1, WORK_HOURS_MAP[workMode] || WORK_HOURS_MAP["955"])
    const denom = weeklyHours * 52
    const v = annualPackage / denom
    return Number.isFinite(v) ? v : 0
  },

  calculateLivabilityArea(disposable, city) {
    try {
      const beijingRent = Number(cityCostData["北京"]?.rent) || 1
      const cityRentRaw = cityCostData[city]?.rent
      const cityRent = Number.isFinite(Number(cityRentRaw)) && Number(cityRentRaw) > 0 ? Number(cityRentRaw) : beijingRent
      const ratio = cityRent / beijingRent
      if (!Number.isFinite(ratio) || ratio <= 0) return 0
      const cityRentPerSqm = BEIJING_BASE_RENT_PER_SQM * ratio
      const disp = Number(disposable)
      if (!Number.isFinite(disp)) return 0
      return Math.max(0, disp / Math.max(cityRentPerSqm, 1e-9))
    } catch {
      return 0
    }
  },

  calculateHappinessScore(metrics) {
    const scores = metrics.dimensionScores || this.calculateDimensionScores(metrics)
    return Math.round(scores.money * 0.4 + scores.time * 0.25 + scores.live * 0.2 + scores.career * 0.15)
  },

  careerDimensionScore(metrics) {
    const growth = metrics.growth || "mid"
    const baseTable = { low: 40, mid: 54, high: 68 }
    const base = baseTable[growth] ?? 54
    const branded = metrics.brandBonus ? Math.min(100, base + 24) : Math.min(100, base)
    return branded
  },

  calculateDimensionScores(metrics) {
    return {
      money: Math.max(0, Math.min(100, metrics.disposable / 300)),
      time: Math.max(0, Math.min(100, metrics.trueHourly * 1.2)),
      live: Math.max(0, Math.min(100, metrics.livableArea * 2)),
      career: this.careerDimensionScore(metrics)
    }
  },

  getRiskMessage(a, b) {
    const hourlyDropPct = b.trueHourly > 0 ? ((b.trueHourly - a.trueHourly) / b.trueHourly) * 100 : 0
    if (a.monthlySalary > b.monthlySalary && a.trueHourly < b.trueHourly) {
      return `该 Offer 属于“用命换钱”型，A 的时薪较 B 降低 ${Math.abs(Math.round(hourlyDropPct))}% ，请慎重考虑时间成本。`
    }
    const reverseDropPct = a.trueHourly > 0 ? ((a.trueHourly - b.trueHourly) / a.trueHourly) * 100 : 0
    if (b.monthlySalary > a.monthlySalary && b.trueHourly < a.trueHourly) {
      return `该 Offer 属于“用命换钱”型，B 的时薪较 A 降低 ${Math.abs(Math.round(reverseDropPct))}% ，请慎重考虑时间成本。`
    }
    return "两份 Offer 的时薪与总包匹配度相对健康，建议进一步结合团队文化与成长空间决策。"
  },

  getPPPMessage(a, b) {
    try {
      const salaryPart = phraseSalaryVs(a.city, b.city, a.monthlySalary, b.monthlySalary)
      const rentPart = phraseRentVs(a.city, b.city, a.effectiveRent ?? 0, b.effectiveRent ?? 0)
      const areaAStr = safeAreaText(a.livableArea)
      const areaBStr = safeAreaText(b.livableArea)
      const livPart = describeLivabilityComparison(a.city, b.city, a.livableArea, b.livableArea)
      return `${salaryPart}；${rentPart}。在同等可支配换算口径下，${a.city} 预计可租面积约 ${areaAStr}㎡，${b.city} 约 ${areaBStr}㎡；${livPart}`
    } catch (err) {
      console.error("[PPPFallback]", err)
      return "购买力对比暂不可用：请检查城市与薪资输入后重试。"
    }
  }
}

function enrichMetrics(metrics) {
  const dimensionScores = PMInsightEngine.calculateDimensionScores(metrics)
  const happinessScore = Math.round(
    dimensionScores.money * 0.4 +
      dimensionScores.time * 0.25 +
      dimensionScores.live * 0.2 +
      dimensionScores.career * 0.15
  )
  return { ...metrics, dimensionScores, happinessScore }
}

function formatMoney(num) {
  return `¥${formatter.format(Math.round(num))}`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function showStatus(message) {
  if (!message) {
    el.loadStatus.classList.add("hidden")
    el.loadStatus.textContent = ""
    return
  }
  el.loadStatus.textContent = message
  el.loadStatus.classList.remove("hidden")
}

function showLoadError(isVisible) {
  if (isVisible) {
    el.loadError.classList.remove("hidden")
    return
  }
  el.loadError.classList.add("hidden")
}

function cityTotalCostFromRow(row) {
  return row.rent + row.food + row.transport + row.shopping + row.utility
}

function renderAiExplanation(metricsA, metricsB, labelA, labelB) {
  if (!el.aiExplainBody) return
  const safe = safeGenerateExplanation({
    nameA: labelA,
    nameB: labelB,
    metricsA,
    metricsB
  })

  if (el.aiExplainBanner) {
    if (safe.message) {
      el.aiExplainBanner.textContent = safe.message
      el.aiExplainBanner.classList.remove("hidden")
    } else {
      el.aiExplainBanner.textContent = ""
      el.aiExplainBanner.classList.add("hidden")
    }
  }

  if (safe.kind === "structured") {
    el.aiExplainBody.innerHTML = safe.sections
      .map(
        (s) => `
      <article class="ai-section-card">
        <div class="ai-section-head">${escapeHtml(s.title)}</div>
        <p class="ai-section-body">${escapeHtml(s.body)}</p>
      </article>`
      )
      .join("")
  } else {
    el.aiExplainBody.innerHTML = safe.html
  }
}

function renderTradeoffSafe(metricsA, metricsB, nameA, nameB) {
  if (!el.radarRoot || !el.radarSvg || !el.tradeoffCard) return
  try {
    renderTradeoffRadar(el.radarRoot, el.radarSvg, el.radarTooltip, el.radarLegendNote, metricsA, metricsB, nameA, nameB)
  } catch (err) {
    console.error("[TradeoffFallback]", err)
    el.tradeoffCard.classList.add("tradeoff-unavailable")
    const warn = el.radarRoot.querySelector("[data-radar-warning]")
    if (warn) {
      warn.classList.remove("hidden")
      warn.textContent = "部分分析暂不可用：Trade-off 模块异常，请稍后重试。"
    }
  }
}

function saveState() {
  const payload = {
    cityA: el.cityA.value,
    cityB: el.cityB.value,
    salaryA: Number(el.salaryA.value) || 0,
    salaryB: Number(el.salaryB.value) || 0,
    rentA: el.rentA?.value ?? "",
    rentB: el.rentB?.value ?? "",
    commuteA: el.commuteA?.value ?? "",
    commuteB: el.commuteB?.value ?? "",
    growthA: el.growthA?.value ?? "mid",
    growthB: el.growthB?.value ?? "mid",
    brandA: el.brandA.checked,
    brandB: el.brandB.checked,
    workModeA: el.workModeA.value,
    workModeB: el.workModeB.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getDefaultSelection(cities) {
  return {
    cityA: cities.includes("北京") ? "北京" : cities[0],
    cityB: cities.includes("杭州") ? "杭州" : cities[1] || cities[0]
  }
}

async function loadCityCostData() {
  showStatus("正在加载城市数据...")
  showLoadError(false)
  let remote = {}
  try {
    const response = await fetch(CITIES_DATA_URL)
    if (response.ok) {
      remote = await response.json()
    } else {
      console.warn(`[DataLoad] ${CITIES_DATA_URL} HTTP ${response.status}`)
    }
  } catch (error) {
    console.warn(`[DataLoad] fetch failed for ${CITIES_DATA_URL}:`, error)
  }

  let parsed = remote
  if (!parsed || typeof parsed !== "object") parsed = {}
  const remoteKeys = Object.keys(parsed).filter((k) => parsed[k] && typeof parsed[k] === "object")

  /** 网络为空或失败时使用打包入 bundle 的完整库，避免只剩 STATIC 三城 */
  const primary = remoteKeys.length > 0 ? parsed : embeddedCities
  cityCostData = mergeCityDatasets(primary, STATIC_MINIMAL_CITIES)

  if (!Object.keys(cityCostData).length) {
    cityCostData = mergeCityDatasets(embeddedCities, STATIC_MINIMAL_CITIES)
  }

  showStatus("")
}

function getWinnerClass(a, b) {
  if (a > b) return "good"
  if (a < b) return "bad"
  return "mid"
}

function renderDetail(container, titleMeta, row) {
  const total = cityTotalCostFromRow(row)
  const rentNote = row._usedRentDefault ? '<span class="meta-chip">房租：城市基准</span>' : '<span class="meta-chip alt">房租：自定义</span>'
  const commuteNote = row._usedCommuteDefault ? '<span class="meta-chip">通勤：城市基准</span>' : '<span class="meta-chip alt">通勤：自定义</span>'
  container.innerHTML = `
    <div class="detail-meta">${titleMeta}</div>
    <div class="line"><span>一室公寓（房租）</span><strong>${formatMoney(row.rent)}</strong>${rentNote}</div>
    <div class="line"><span>外卖/餐饮（月）</span><strong>${formatMoney(row.food)}</strong></div>
    <div class="line"><span>出行通勤（月）</span><strong>${formatMoney(row.transport)}</strong>${commuteNote}</div>
    <div class="line"><span>服饰购物（月）</span><strong>${formatMoney(row.shopping)}</strong></div>
    <div class="line"><span>水电网（月）</span><strong>${formatMoney(row.utility)}</strong></div>
    <div class="line"><span>月生活总成本</span><strong>${formatMoney(total)}</strong></div>
  `
}

function renderPMInsights(metricsA, metricsB) {
  const pppText = PMInsightEngine.getPPPMessage(metricsA, metricsB)
  const riskText = PMInsightEngine.getRiskMessage(metricsA, metricsB)
  const dimA = metricsA.dimensionScores
  const dimB = metricsB.dimensionScores
  const scoreA = metricsA.happinessScore
  const scoreB = metricsB.happinessScore

  el.insightPPP.textContent = pppText
  el.insightRisk.textContent = riskText
  el.insightRisk.classList.toggle("warning", riskText.includes("用命换钱"))

  el.scoreLabelA.textContent = `${metricsA.city}（时薪 ${formatMoney(metricsA.trueHourly)}/h）`
  el.scoreLabelB.textContent = `${metricsB.city}（时薪 ${formatMoney(metricsB.trueHourly)}/h）`
  el.scoreA.textContent = `${scoreA}`
  el.scoreB.textContent = `${scoreB}`
  el.scoreBarA.style.width = `${scoreA}%`
  el.scoreBarB.style.width = `${scoreB}%`

  el.weightsTitleA.textContent = `${metricsA.city} 决策天平`
  el.weightsTitleB.textContent = `${metricsB.city} 决策天平`

  el.moneyScoreA.textContent = `${Math.round(dimA.money)}`
  el.timeScoreA.textContent = `${Math.round(dimA.time)}`
  el.liveScoreA.textContent = `${Math.round(dimA.live)}`
  el.careerScoreA.textContent = `${Math.round(dimA.career)}`
  el.moneyScoreB.textContent = `${Math.round(dimB.money)}`
  el.timeScoreB.textContent = `${Math.round(dimB.time)}`
  el.liveScoreB.textContent = `${Math.round(dimB.live)}`
  el.careerScoreB.textContent = `${Math.round(dimB.career)}`

  el.moneyBarA.style.width = `${dimA.money}%`
  el.timeBarA.style.width = `${dimA.time}%`
  el.liveBarA.style.width = `${dimA.live}%`
  el.careerBarA.style.width = `${dimA.career}%`
  el.moneyBarB.style.width = `${dimB.money}%`
  el.timeBarB.style.width = `${dimB.time}%`
  el.liveBarB.style.width = `${dimB.live}%`
  el.careerBarB.style.width = `${dimB.career}%`

  const warnings = []
  if (dimA.money < SCORE_WARN_THRESHOLD || dimA.time < SCORE_WARN_THRESHOLD || dimA.live < SCORE_WARN_THRESHOLD || dimA.career < SCORE_WARN_THRESHOLD) {
    warnings.push(`${metricsA.city} 该选项可能导致生活质量滑坡，请慎重。`)
  }
  if (dimB.money < SCORE_WARN_THRESHOLD || dimB.time < SCORE_WARN_THRESHOLD || dimB.live < SCORE_WARN_THRESHOLD || dimB.career < SCORE_WARN_THRESHOLD) {
    warnings.push(`${metricsB.city} 该选项可能导致生活质量滑坡，请慎重。`)
  }
  if (warnings.length) {
    el.stressWarning.textContent = `! 极端值警示：${warnings.join(" ")}`
    el.stressWarning.classList.remove("hidden")
  } else {
    el.stressWarning.classList.add("hidden")
    el.stressWarning.textContent = ""
  }
}

function compare() {
  if (!Object.keys(cityCostData).length) return

  const cityA = el.cityA.value
  const cityB = el.cityB.value

  const salaryA = coerceNumber(el.salaryA.value, INPUT_DEFAULTS.salary)
  const salaryB = coerceNumber(el.salaryB.value, INPUT_DEFAULTS.salary)
  el.salaryA.value = String(salaryA)
  el.salaryB.value = String(salaryB)

  const rentARaw = el.rentA?.value === "" ? null : Number(el.rentA?.value)
  const rentBRaw = el.rentB?.value === "" ? null : Number(el.rentB?.value)
  const commuteARaw = el.commuteA?.value === "" ? null : Number(el.commuteA?.value)
  const commuteBRaw = el.commuteB?.value === "" ? null : Number(el.commuteB?.value)

  const growthA = coerceGrowth(el.growthA?.value)
  const growthB = coerceGrowth(el.growthB?.value)
  if (el.growthA) el.growthA.value = growthA
  if (el.growthB) el.growthB.value = growthB

  const brandA = el.brandA.checked
  const brandB = el.brandB.checked
  const workModeA = coerceWorkMode(el.workModeA.value)
  const workModeB = coerceWorkMode(el.workModeB.value)
  el.workModeA.value = workModeA
  el.workModeB.value = workModeB

  const resolvedA = resolveCityCostRow(cityA, cityCostData)
  const resolvedB = resolveCityCostRow(cityB, cityCostData)
  const rowA = buildEffectiveCostRow(resolvedA.row, rentARaw, commuteARaw)
  const rowB = buildEffectiveCostRow(resolvedB.row, rentBRaw, commuteBRaw)

  const costA = cityTotalCostFromRow(rowA)
  const costB = cityTotalCostFromRow(rowB)
  const disposableA = salaryA - costA
  const disposableB = salaryB - costB

  el.leftDisposable.textContent = formatMoney(disposableA)
  el.rightDisposable.textContent = formatMoney(disposableB)
  el.leftDisposable.className = `v ${getWinnerClass(disposableA, disposableB)}`
  el.rightDisposable.className = `v ${getWinnerClass(disposableB, disposableA)}`

  if (disposableA > disposableB) {
    el.winnerText.textContent = `${cityA} 更有优势`
    el.winnerText.className = "v good"
  } else if (disposableB > disposableA) {
    el.winnerText.textContent = `${cityB} 更有优势`
    el.winnerText.className = "v good"
  } else {
    el.winnerText.textContent = "两者相近"
    el.winnerText.className = "v mid"
  }

  const equalSalaryInB = PMInsightEngine.calculateEquivalentSalary(salaryA, costA, costB)
  const equalSalaryInA = PMInsightEngine.calculateEquivalentSalary(salaryB, costB, costA)

  el.eqTextAtoB.textContent = `如果你在 ${cityA} 拿 ${formatMoney(salaryA)}，在 ${cityB} 需要`
  el.eqValueAtoB.textContent = formatMoney(equalSalaryInB)
  el.eqTextBtoA.textContent = `如果你在 ${cityB} 拿 ${formatMoney(salaryB)}，在 ${cityA} 需要`
  el.eqValueBtoA.textContent = formatMoney(equalSalaryInA)

  const metaA =
    resolvedA.source === "national_average_fallback"
      ? `<span class="warn-chip">城市成本：全国均值兜底</span>`
      : `<span class="ok-chip">城市成本：本地库</span>`
  const metaB =
    resolvedB.source === "national_average_fallback"
      ? `<span class="warn-chip">城市成本：全国均值兜底</span>`
      : `<span class="ok-chip">城市成本：本地库</span>`

  el.detailTitleA.textContent = `${resolvedA.cityLabel} 成本拆解`
  el.detailTitleB.textContent = `${resolvedB.cityLabel} 成本拆解`
  renderDetail(el.detailA, metaA, rowA)
  renderDetail(el.detailB, metaB, rowB)

  const metricsA = enrichMetrics({
    city: cityA,
    monthlySalary: salaryA,
    disposable: disposableA,
    monthlyLivingCost: costA,
    effectiveRent: rowA.rent,
    effectiveCommute: rowA.transport,
    trueHourly: PMInsightEngine.calculateTrueHourly(salaryA, workModeA),
    livableArea: PMInsightEngine.calculateLivabilityArea(disposableA, cityA),
    brandBonus: brandA,
    growth: growthA,
    growthLabel: GROWTH_LABEL[growthA],
    weeklyHours: WORK_HOURS_MAP[workModeA] || 40,
    workMode: workModeA
  })
  const metricsB = enrichMetrics({
    city: cityB,
    monthlySalary: salaryB,
    disposable: disposableB,
    monthlyLivingCost: costB,
    effectiveRent: rowB.rent,
    effectiveCommute: rowB.transport,
    trueHourly: PMInsightEngine.calculateTrueHourly(salaryB, workModeB),
    livableArea: PMInsightEngine.calculateLivabilityArea(disposableB, cityB),
    brandBonus: brandB,
    growth: growthB,
    growthLabel: GROWTH_LABEL[growthB],
    weeklyHours: WORK_HOURS_MAP[workModeB] || 40,
    workMode: workModeB
  })

  renderPMInsights(metricsA, metricsB)
  renderAiExplanation(metricsA, metricsB, resolvedA.cityLabel, resolvedB.cityLabel)
  el.tradeoffCard?.classList.remove("tradeoff-unavailable")
  renderTradeoffSafe(metricsA, metricsB, resolvedA.cityLabel, resolvedB.cityLabel)
  saveState()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function compareWithLoading() {
  el.compareBtn.disabled = true
  const card = el.compareBtn.closest(".card")
  const originalText = el.compareBtn.textContent
  el.compareBtn.textContent = "计算中..."
  card?.classList.add("calculating")
  await sleep(500)
  compare()
  card?.classList.remove("calculating")
  el.compareBtn.textContent = originalText
  el.compareBtn.disabled = false
}

function initCityOptions(savedState) {
  const cities = Object.keys(cityCostData)
  if (!cities.length) return

  const defaults = getDefaultSelection(cities)
  const cityA = savedState?.cityA && cities.includes(savedState.cityA) ? savedState.cityA : defaults.cityA
  const cityB = savedState?.cityB && cities.includes(savedState.cityB) ? savedState.cityB : defaults.cityB

  if (el.wrapCityA && el.wrapCityB && el.cityA && el.cityB) {
    if (!cityPickerA) {
      cityPickerA = mountCityPicker(el.wrapCityA, el.cityA, cityCostData, { onChange: saveState })
    } else {
      cityPickerA.refreshCatalog(cityCostData)
    }
    if (!cityPickerB) {
      cityPickerB = mountCityPicker(el.wrapCityB, el.cityB, cityCostData, { onChange: saveState })
    } else {
      cityPickerB.refreshCatalog(cityCostData)
    }
    cityPickerA.setValue(cityA)
    cityPickerB.setValue(cityB)
  } else {
    el.cityA.value = cityA
    el.cityB.value = cityB
  }

  el.salaryA.value = savedState?.salaryA ?? 22000
  el.salaryB.value = savedState?.salaryB ?? 18000
  if (el.rentA) el.rentA.value = savedState?.rentA ?? ""
  if (el.rentB) el.rentB.value = savedState?.rentB ?? ""
  if (el.commuteA) el.commuteA.value = savedState?.commuteA ?? ""
  if (el.commuteB) el.commuteB.value = savedState?.commuteB ?? ""
  if (el.growthA) el.growthA.value = coerceGrowth(savedState?.growthA) || "mid"
  if (el.growthB) el.growthB.value = coerceGrowth(savedState?.growthB) || "mid"
  el.brandA.checked = savedState?.brandA ?? INPUT_DEFAULTS.brand
  el.brandB.checked = savedState?.brandB ?? INPUT_DEFAULTS.brand
  el.workModeA.value = coerceWorkMode(savedState?.workModeA)
  el.workModeB.value = coerceWorkMode(savedState?.workModeB)
}

function bindEvents() {
  el.compareBtn.addEventListener("click", compareWithLoading)
  el.retryBtn.addEventListener("click", init)

  ;[
    el.cityA,
    el.cityB,
    el.salaryA,
    el.salaryB,
    el.rentA,
    el.rentB,
    el.commuteA,
    el.commuteB,
    el.growthA,
    el.growthB,
    el.brandA,
    el.brandB,
    el.workModeA,
    el.workModeB
  ]
    .filter(Boolean)
    .forEach((node) => {
      const eventName = node.tagName === "INPUT" && node.type === "number" ? "input" : "change"
      node.addEventListener(eventName, saveState)
    })
}

async function init() {
  try {
    await loadCityCostData()
    const savedState = loadState()
    initCityOptions(savedState)
    compare()
  } catch (error) {
    console.error(error)
    showStatus("")
    showLoadError(true)
  }
}

bindEvents()
init()
