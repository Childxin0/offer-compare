/**
 * 规则模板兜底：当结构化叙事失败时使用，保证可解释输出始终可用。
 */

import { phraseDisposableVs, phraseSalaryVs } from "./copyHelpers.js"

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function ruleBasedExplanationFallback(ctx) {
  const { nameA, nameB, metricsA, metricsB } = ctx
  const dA = metricsA.disposable ?? 0
  const dB = metricsB.disposable ?? 0
  const hA = metricsA.happinessScore ?? 0
  const hB = metricsB.happinessScore ?? 0
  const prefer =
    hA === hB
      ? "两侧综合分数接近"
      : hA > hB
        ? `更偏向 ${esc(nameA)}`
        : `更偏向 ${esc(nameB)}`
  const dispPhrase = phraseDisposableVs(nameA, nameB, dA, dB)
  const salPhrase = phraseSalaryVs(metricsA.city, metricsB.city, metricsA.monthlySalary, metricsB.monthlySalary)

  return `
    <p><strong>规则模板摘要（兜底）</strong>：${prefer}；${esc(dispPhrase)}。</p>
    <p>${esc(salPhrase)}。</p>
    <p>收入与成本：${esc(nameA)} 剩余可支配约 ${Math.round(dA)} 元/月，${esc(nameB)} 约 ${Math.round(dB)} 元/月；请结合房租与通勤覆盖是否贴合你本人生活习惯。</p>
    <p>时间自由：${esc(nameA)} 真时薪约 ${(metricsA.trueHourly ?? 0).toFixed(1)} 元/小时，${esc(nameB)} 约 ${(metricsB.trueHourly ?? 0).toFixed(1)} 元/小时。</p>
    <p>长期成长：成长空间与履历背书已折算进职业维度得分（${esc(nameA)} ${Math.round(metricsA.dimensionScores?.career ?? 0)} vs ${esc(nameB)} ${Math.round(metricsB.dimensionScores?.career ?? 0)}）。</p>
    <p>幸福感与压力：综合指数 ${Math.round(hA)} vs ${Math.round(hB)}；若加班更长或可支配偏低，压力合成会偏高——建议结合睡眠恢复与通勤恢复时间自行校准。</p>
  `.trim()
}
