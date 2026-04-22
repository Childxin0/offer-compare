const STORAGE_KEY = "offer-compare:last-state"
const CITIES_DATA_URL = "./cities.json"
const formatter = new Intl.NumberFormat("zh-CN")
const SCORE_WARN_THRESHOLD = 40
const WORK_HOURS_MAP = {
  "955": 40,
  "bigsmall": 60,
  "996": 72
}
const BEIJING_BASE_RENT_PER_SQM = 125
let cityCostData = {}

const el = {
  cityA: document.getElementById("cityA"),
  cityB: document.getElementById("cityB"),
  salaryA: document.getElementById("salaryA"),
  salaryB: document.getElementById("salaryB"),
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
  careerBarB: document.getElementById("careerBarB")
}

const PMInsightEngine = {
  calculateEquivalentSalary(sourceSalary, sourceCost, targetCost) {
    return sourceSalary - sourceCost + targetCost
  },

  calculateTrueHourly(monthlySalary, workMode) {
    const annualPackage = monthlySalary * 12
    const weeklyHours = WORK_HOURS_MAP[workMode] || WORK_HOURS_MAP["955"]
    return annualPackage / (weeklyHours * 52)
  },

  calculateLivabilityArea(disposable, city) {
    const beijingRent = cityCostData["北京"]?.rent || 1
    const cityRent = cityCostData[city]?.rent || beijingRent
    const cityRentPerSqm = BEIJING_BASE_RENT_PER_SQM * (cityRent / beijingRent)
    return Math.max(0, disposable / cityRentPerSqm)
  },

  calculateHappinessScore(metrics) {
    const scores = this.calculateDimensionScores(metrics)

    return Math.round(
      scores.money * 0.4 +
      scores.time * 0.25 +
      scores.live * 0.2 +
      scores.career * 0.15
    )
  },

  calculateDimensionScores(metrics) {
    return {
      money: Math.max(0, Math.min(100, metrics.disposable / 300)),
      time: Math.max(0, Math.min(100, metrics.trueHourly * 1.2)),
      live: Math.max(0, Math.min(100, metrics.livableArea * 2)),
      career: metrics.brandBonus ? 100 : 45
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
    const qualityDropPct = a.livableArea > 0 ? ((a.livableArea - b.livableArea) / a.livableArea) * 100 : 0
    return `虽然 ${a.city} 月薪比 ${b.city} 高 ${formatMoney(a.monthlySalary - b.monthlySalary)}，但考虑房租差异，同样可支配预算在 ${a.city} 约能租 ${a.livableArea.toFixed(1)}㎡，在 ${b.city} 约能租 ${b.livableArea.toFixed(1)}㎡，居住体感预计变化 ${Math.abs(Math.round(qualityDropPct))}% 。`
  }
}

function formatMoney(num) {
  return `¥${formatter.format(Math.round(num))}`
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

function saveState() {
  const payload = {
    cityA: el.cityA.value,
    cityB: el.cityB.value,
    salaryA: Number(el.salaryA.value) || 0,
    salaryB: Number(el.salaryB.value) || 0,
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
  const response = await fetch(CITIES_DATA_URL).catch((error) => {
    console.error(`[DataLoad] Request failed for ${CITIES_DATA_URL}:`, error)
    throw error
  })
  if (!response.ok) {
    throw new Error(`failed to load data: ${response.status}`)
  }
  cityCostData = await response.json()
  showStatus("")
}

function cityTotalCost(city) {
  const c = cityCostData[city]
  return c.rent + c.food + c.transport + c.shopping + c.utility
}

function getWinnerClass(a, b) {
  if (a > b) return "good"
  if (a < b) return "bad"
  return "mid"
}

function renderDetail(container, city) {
  const c = cityCostData[city]
  const total = cityTotalCost(city)
  container.innerHTML = `
    <div class="line"><span>一室公寓（市中心）</span><strong>${formatMoney(c.rent)}</strong></div>
    <div class="line"><span>外卖/餐饮（月）</span><strong>${formatMoney(c.food)}</strong></div>
    <div class="line"><span>出行通勤（月）</span><strong>${formatMoney(c.transport)}</strong></div>
    <div class="line"><span>服饰购物（月）</span><strong>${formatMoney(c.shopping)}</strong></div>
    <div class="line"><span>水电网（月）</span><strong>${formatMoney(c.utility)}</strong></div>
    <div class="line"><span>月生活总成本</span><strong>${formatMoney(total)}</strong></div>
  `
}

function renderPMInsights(metricsA, metricsB) {
  const pppText = PMInsightEngine.getPPPMessage(metricsA, metricsB)
  const riskText = PMInsightEngine.getRiskMessage(metricsA, metricsB)
  const dimA = PMInsightEngine.calculateDimensionScores(metricsA)
  const dimB = PMInsightEngine.calculateDimensionScores(metricsB)
  const scoreA = PMInsightEngine.calculateHappinessScore(metricsA)
  const scoreB = PMInsightEngine.calculateHappinessScore(metricsB)

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
  const salaryA = Number(el.salaryA.value) || 0
  const salaryB = Number(el.salaryB.value) || 0
  const brandA = el.brandA.checked
  const brandB = el.brandB.checked
  const workModeA = el.workModeA.value
  const workModeB = el.workModeB.value

  const costA = cityTotalCost(cityA)
  const costB = cityTotalCost(cityB)
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

  el.detailTitleA.textContent = `${cityA} 成本拆解`
  el.detailTitleB.textContent = `${cityB} 成本拆解`
  renderDetail(el.detailA, cityA)
  renderDetail(el.detailB, cityB)

  const metricsA = {
    city: cityA,
    monthlySalary: salaryA,
    disposable: disposableA,
    trueHourly: PMInsightEngine.calculateTrueHourly(salaryA, workModeA),
    livableArea: PMInsightEngine.calculateLivabilityArea(disposableA, cityA),
    brandBonus: brandA
  }
  const metricsB = {
    city: cityB,
    monthlySalary: salaryB,
    disposable: disposableB,
    trueHourly: PMInsightEngine.calculateTrueHourly(salaryB, workModeB),
    livableArea: PMInsightEngine.calculateLivabilityArea(disposableB, cityB),
    brandBonus: brandB
  }
  renderPMInsights(metricsA, metricsB)
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

  const options = cities.map((city) => `<option value="${city}">${city}</option>`).join("")
  el.cityA.innerHTML = options
  el.cityB.innerHTML = options

  const defaults = getDefaultSelection(cities)
  const cityA = savedState?.cityA && cities.includes(savedState.cityA) ? savedState.cityA : defaults.cityA
  const cityB = savedState?.cityB && cities.includes(savedState.cityB) ? savedState.cityB : defaults.cityB
  el.cityA.value = cityA
  el.cityB.value = cityB
  el.salaryA.value = savedState?.salaryA ?? 22000
  el.salaryB.value = savedState?.salaryB ?? 18000
  el.brandA.checked = savedState?.brandA ?? false
  el.brandB.checked = savedState?.brandB ?? false
  el.workModeA.value = savedState?.workModeA ?? "955"
  el.workModeB.value = savedState?.workModeB ?? "955"
}

function bindEvents() {
  el.compareBtn.addEventListener("click", compareWithLoading)
  el.retryBtn.addEventListener("click", init)

  ;[
    el.cityA, el.cityB, el.salaryA, el.salaryB,
    el.brandA, el.brandB, el.workModeA, el.workModeB
  ].forEach((node) => {
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