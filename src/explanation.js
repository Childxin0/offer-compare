/**
 * AI 决策解释：结构化叙事 + 决策 Copilot 口吻；失败由 explanationRules 兜底。
 */

import {
  phraseDisposableVs,
  phraseRentVs,
  phraseSalaryVs
} from "./copyHelpers.js"
import { ruleBasedExplanationFallback } from "./explanationRules.js"

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function stressIndex(metrics) {
  const weekly = metrics.weeklyHours || 40
  const disposable = metrics.disposable || 0
  const moneyScore = metrics.dimensionScores?.money ?? 0
  const overwork = clamp((weekly - 40) / 40, 0, 1)
  const cashStress = clamp(1 - moneyScore / 100, 0, 1)
  const dispStress = clamp(1 - clamp(disposable / 8000, 0, 1), 0, 1)
  return clamp(0.45 * overwork + 0.35 * cashStress + 0.2 * dispStress, 0, 1)
}

function happinessProxy(metrics) {
  return clamp((metrics.happinessScore ?? 50) / 100, 0, 1)
}

function pct(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** 短期现金 vs 隐性「生活吞噬」 */
function narrativeShortTermHidden(metricsA, metricsB, nameA, nameB) {
  const ratio = (m) => {
    const sal = Number(m.monthlySalary)
    const cost = Number(m.monthlyLivingCost)
    if (!Number.isFinite(sal) || sal <= 0 || !Number.isFinite(cost)) return NaN
    return cost / sal
  }
  const rA = ratio(metricsA)
  const rB = ratio(metricsB)
  if (!Number.isFinite(rA) || !Number.isFinite(rB)) {
    return `短期视角下，先把「名义月薪」与「模型估算的生活总成本」对齐核对：若你与真实消费习惯偏差很大，可支配现金会被系统性高估或低估——这会直接影响你对短期现金流与技术晋升节奏的容错空间。`
  }
  const swallow =
    Math.abs(rA - rB) < 0.03
      ? "两边用于覆盖固定生活账单的月薪占比接近"
      : rA > rB
        ? `${nameA} 的生活成本对月薪的吞噬更明显`
        : `${nameB} 的生活成本对月薪的吞噬更明显`
  return `短期收益不是只看总包，而是看「薪资减去城市生活底盘」之后还剩什么：${nameA} 估算生活成本约占月薪 ${pct(rA)}%，${nameB} 约 ${pct(rB)}%。${swallow}。隐性成本的第一层就在这里——它决定储蓄节奏、机动支出与抗风险缓冲，也会反向塑造你对加班压力的承受能力。`
}

/** 时间成本：真时薪与加班结构 */
function narrativeTimeCost(metricsA, metricsB, nameA, nameB) {
  const hA = metricsA.trueHourly || 0
  const hB = metricsB.trueHourly || 0
  const diff = hA - hB
  const wA = metricsA.weeklyHours || 40
  const wB = metricsB.weeklyHours || 40
  const hourStory =
    Math.abs(wA - wB) < 1
      ? "两侧工作制映射的周工时接近，时间成本主要来自「城市物价 × 通勤摩擦」而不是工时差异。"
      : wA > wB
        ? `${nameA} 映射的周工时更高：名义月薪可能被更长工时摊薄；这时要把「多出来的小时」看作机会成本——睡眠、社交恢复与学习投入都会被挤压。`
        : `${nameB} 映射的周工时更高：若总包优势不明显，就要追问这笔钱是否足以买回你的恢复周期。`
  const hourlyStory =
    Math.abs(diff) < 2
      ? `真时薪几乎同一档位（${hA.toFixed(1)} vs ${hB.toFixed(1)} 元/小时），短期取舍更取决于通勤恢复成本与团队节奏等模型外的变量。`
      : diff > 0
        ? `${nameA} 真时薪更高（${hA.toFixed(1)} vs ${hB.toFixed(1)} 元/小时）：同样的日历时间，单位时间回报更厚；另一边若总包更高，优先怀疑隐性加班或通勤摩擦是否在吃掉溢价。`
        : `${nameB} 真时薪更高（${hB.toFixed(1)} vs ${hA.toFixed(1)} 元/小时）：这是典型的时间成本信号——不要被名义月薪牵着走。`
  return `「时间成本」在这里拆成两层：首先是加班结构（${hourStory}），其次是真时薪（${hourlyStory}）。`
}

/** 生活压力：现金流紧张 × 工时强度 */
function narrativeLifePressure(metricsA, metricsB, nameA, nameB) {
  const sa = stressIndex(metricsA)
  const sb = stressIndex(metricsB)
  const dA = metricsA.disposable ?? 0
  const dB = metricsB.disposable ?? 0
  const pressureLead =
    Math.abs(sa - sb) < 0.08
      ? "合成压力指数在同一档位：真正的体感差异往往来自通勤时长、团队预期与上级节奏——它们不一定能被模型完整捕获。"
      : sa >= sb
        ? `${nameA} 的合成压力更高（可支配缓冲偏弱、工时强度或现金流紧张度叠加）。这不等于「不该去」，而是提醒你把恢复预算（睡眠、运动、社交）写进决策里。`
        : `${nameB} 的合成压力更高：若其名义待遇更强，你需要判断「多出来的钱」是否足以覆盖长期透支与情绪消耗。`
  return `生活压力不是矫情指标，而是「现金流安全 × 可支配缓冲 × 加班强度」的综合结果：${nameA} 估算可支配 ${Math.round(dA)} 元/月，${nameB} ${Math.round(dB)} 元/月。${pressureLead}`
}

function narrativeIncomeVsCost(winner, metricsA, metricsB, nameA, nameB) {
  const dA = metricsA.disposable ?? 0
  const dB = metricsB.disposable ?? 0
  const gap = Math.abs(dA - dB)
  const head = phraseDisposableVs(nameA, nameB, dA, dB)
  const rentPhrase = phraseRentVs(nameA, nameB, metricsA.effectiveRent ?? 0, metricsB.effectiveRent ?? 0)
  const stronger =
    gap > 800
      ? `两者可支配差距约 ${Math.round(gap)} 元/月，对储蓄节奏与抗风险能力的影响通常实质性可见。`
      : `可支配差距约 ${Math.round(gap)} 元/月，现金流派不构成压倒性分歧，更适合把时间成本与成长结构拉回决策中心。`
  const tail =
    winner === "tie" || dA === dB
      ? "当前权重下，购买力底盘接近：更像在两条生活方式之间做 trade-off，而不是谁碾压谁。"
      : `结合房租口径：${rentPhrase}——这也是 PPP 视角的关键：同一笔钱在不同城市的「厚度」并不相同。`
  return [head, stronger, tail].join("")
}

function narrativeTimeFreedom(mA, mB, nameA, nameB) {
  return narrativeTimeCost(mA, mB, nameA, nameB)
}

function narrativeGrowth(mA, mB, nameA, nameB) {
  const gRank = { low: 0, mid: 1, high: 2 }
  const ga = gRank[mA.growth] ?? 1
  const gb = gRank[mB.growth] ?? 1
  const careerA = mA.dimensionScores?.career ?? 0
  const careerB = mB.dimensionScores?.career ?? 0
  const cmp =
    ga === gb
      ? `成长结构评级一致（${mA.growthLabel}）。长期分化更多取决于业务跑道、导师密度与是否在做「可迁移能力」的项目——城市只是容器。`
      : ga > gb
        ? `${nameA} 的成长空间输入更乐观：若你愿意用短期现金换学习与曝光，长期复利更可能落在这一侧；${nameB} 若舒适度或现金流显著更好，也可能是你有意押注当下确定性。`
        : `${nameB} 的成长空间输入更乐观；若 ${nameA} 在现金流或安全感上明显占优，你更接近「拿钱换当下」的路径——关键是这是否与你的职业窗口期匹配。`
  return [
    `长期成长不是玄学 KPI：模型把「成长自评 + 履历背书」折进职业维度（${nameA} ${Math.round(careerA)} vs ${nameB} ${Math.round(careerB)}）。`,
    cmp
  ].join("")
}

/** 幸福感 trade-off：多维效用拉扯 */
function narrativeHappinessTradeoff(mA, mB, nameA, nameB) {
  const ha = mA.happinessScore ?? 0
  const hb = mB.happinessScore ?? 0
  const moneyGap = (mA.dimensionScores?.money ?? 0) - (mB.dimensionScores?.money ?? 0)
  const timeGap = (mA.dimensionScores?.time ?? 0) - (mB.dimensionScores?.time ?? 0)
  const liveGap = (mA.dimensionScores?.live ?? 0) - (mB.dimensionScores?.live ?? 0)
  const careerGap = (mA.dimensionScores?.career ?? 0) - (mB.dimensionScores?.career ?? 0)
  const tug = []
  if (Math.abs(moneyGap) > 8) tug.push(`现金流维度 ${moneyGap > 0 ? nameA : nameB} 更强`)
  if (Math.abs(timeGap) > 8) tug.push(`时间回报维度 ${timeGap > 0 ? nameA : nameB} 更强`)
  if (Math.abs(liveGap) > 8) tug.push(`居住体感维度 ${liveGap > 0 ? nameA : nameB} 更强`)
  if (Math.abs(careerGap) > 8) tug.push(`职业跳板维度 ${careerGap > 0 ? nameA : nameB} 更强`)
  const tugText =
    tug.length > 0
      ? `当前这组输入里，拉扯主要来自：${tug.join("；")}——幸福感 trade-off 的含义是：你可能无法同时最大化每一项，只能决定你愿意牺牲哪一类边际效用。`
      : `四维得分差距不大：这说明「主观偏好」与「模型未捕捉的现实摩擦」（通勤、团队氛围、家庭约束）会在最终体感里占更高权重。`
  return `综合幸福指数（模型近似）：${nameA} ${ha} vs ${nameB} ${hb}。${tugText}`
}

function narrativeHappinessStress(mA, mB, nameA, nameB) {
  const ha = happinessProxy(mA)
  const hb = happinessProxy(mB)
  const sa = stressIndex(mA)
  const sb = stressIndex(mB)
  const happyLead =
    Math.abs(ha - hb) < 0.06
      ? "整体幸福感指数接近"
      : ha >= hb
        ? `${nameA} 的综合效用略占优`
        : `${nameB} 的综合效用略占优`
  const stressLead =
    Math.abs(sa - sb) < 0.08
      ? "压力指数同一档位：真正的分水岭往往在通勤恢复、预期管理与团队文化。"
      : sa >= sb
        ? `${nameA} 的压力合成更高（现金流紧、工时强或缓冲薄的组合），要把恢复预算当成硬约束。`
        : `${nameB} 的压力合成更高：若待遇更强，评估是不是「可控的高压」还是「不可持续的透支」。`
  return [
    `${happyLead}；压力合成并非单一加班指标，而是现金流紧张度、加班强度与可支配缓冲的合力：${stressLead}`,
    `隐性成本提醒：模型外的摩擦（租房通勤、医疗应急、家庭变量）仍可能放大压力——结论用于辅助复盘，不替代你对真实生活的判断。`
  ].join("")
}

function narrativeExecutive(nameA, nameB, metricsA, metricsB, winner) {
  const salLine = phraseSalaryVs(metricsA.city, metricsB.city, metricsA.monthlySalary, metricsB.monthlySalary)
  const prefer =
    winner === "tie"
      ? `在当前权重下，系统不把结论强行偏向某一侧，更像在两条路径之间做 trade-off 复盘。`
      : winner === "A"
        ? `综合效用略偏向 ${nameA}（不等于否定 ${nameB}，而是多数维度叠加后的「偏好方向」）。`
        : `综合效用略偏向 ${nameB}（不等于否定 ${nameA}）。`
  return `${prefer}先对齐事实层：${salLine}。下文按「短期—时间—压力—长期—幸福 trade-off」展开，帮助你把纠结翻译成可讨论的结构化问题。`
}

function pickWinner(hA, hB, dA, dB) {
  const ndA = Math.max(0, Math.min(100, (dA || 0) / 300))
  const ndB = Math.max(0, Math.min(100, (dB || 0) / 300))
  const scoreA = 0.62 * (hA || 0) + 0.38 * ndA
  const scoreB = 0.62 * (hB || 0) + 0.38 * ndB
  if (Math.abs(scoreA - scoreB) < 2) return "tie"
  return scoreA > scoreB ? "A" : "B"
}

export function generateStructuredExplanation(ctx) {
  const { nameA, nameB, metricsA, metricsB } = ctx
  const hA = metricsA.happinessScore ?? 0
  const hB = metricsB.happinessScore ?? 0
  const dA = metricsA.disposable ?? 0
  const dB = metricsB.disposable ?? 0
  const winner = pickWinner(hA, hB, dA, dB)

  const sections = [
    {
      title: "执行摘要（Decision Copilot）",
      body: narrativeExecutive(nameA, nameB, metricsA, metricsB, winner)
    },
    {
      title: "短期收益 vs 隐性成本（生活底盘）",
      body: narrativeShortTermHidden(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "收入 / 成本与 PPP（购买力底盘）",
      body: narrativeIncomeVsCost(winner, metricsA, metricsB, nameA, nameB)
    },
    {
      title: "时间成本（真时薪 × 加班结构）",
      body: narrativeTimeFreedom(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "生活压力与恢复空间",
      body: narrativeLifePressure(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "长期成长（复利与窗口期）",
      body: narrativeGrowth(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "幸福感 trade-off（多维效用拉扯）",
      body: narrativeHappinessTradeoff(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "压力、隐性摩擦与复盘提示",
      body: narrativeHappinessStress(metricsA, metricsB, nameA, nameB)
    },
    {
      title: "没有完美 Offer，只有取舍",
      body: `若你更看重当下现金流与居住舒适度，往往会削弱对成长速度或时间恢复的偏好；若你更看重长期跃迁，可能要容忍更紧的现金流。Copilot 的价值是把张力摊开；最终签字权在你。`
    }
  ]

  return { winnerLabel: winner, sections }
}

export function safeGenerateExplanation(ctx) {
  try {
    const result = generateStructuredExplanation(ctx)
    if (!result?.sections?.length) {
      return {
        kind: "fallback_rules",
        html: ruleBasedExplanationFallback(ctx),
        message: "已切换规则模板解释（结构化报告为空）。"
      }
    }
    return { kind: "structured", ...result, message: null }
  } catch (err) {
    console.error("[ExplainFallback] generateStructuredExplanation failed:", err)
    return {
      kind: "fallback_rules",
      html: ruleBasedExplanationFallback(ctx),
      message: "解释生成异常，已使用规则模板输出。"
    }
  }
}
