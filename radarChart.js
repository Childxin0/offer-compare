/**
 * Trade-off 雷达图：命中层与装饰层分离，避免 polygon/text 拦截 hover；
 * 每轴单一合并热区，重叠顶点也能稳定出 tooltip。
 */

const AXES = [
  { key: "money", label: "高收入", hint: "可支配收入与现金流安全（模型归一化得分）" },
  { key: "time", label: "时间自由", hint: "真时薪与单位时间回报（模型归一化得分）" },
  { key: "live", label: "居住舒适", hint: "可租面积代理下的居住体感（模型归一化得分）" },
  { key: "career", label: "职业成长", hint: "成长空间与履历背书综合（模型归一化得分）" }
]

function polar(cx, cy, radius, angleRad) {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad)
  }
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return NaN
  return Math.max(0, Math.min(100, n))
}

function scoresFromMetrics(m) {
  const d = m.dimensionScores || {}
  return AXES.map((a) => clampScore(d[a.key]))
}

function buildPolygonPoints(cx, cy, maxR, scores) {
  const n = AXES.length
  const pts = []
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const r = (scores[i] / 100) * maxR
    const p = polar(cx, cy, r, angle)
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  }
  return pts.join(" ")
}

function buildTooltipPayload(axis, nameA, nameB, scoreA, scoreB) {
  const lines = [
    `维度：${axis.label}`,
    `说明：${axis.hint}`,
    `${nameA}：${scoreA.toFixed(0)} 分`,
    `${nameB}：${scoreB.toFixed(0)} 分`
  ]
  return lines.join("\n")
}

/**
 * @returns {{ ok: boolean, reason?: string }}
 */
export function renderTradeoffRadar(rootEl, svgEl, tooltipEl, legendNoteEl, metricsA, metricsB, nameA, nameB) {
  const warnEl = rootEl.querySelector("[data-radar-warning]")
  try {
    const scoresA = scoresFromMetrics(metricsA)
    const scoresB = scoresFromMetrics(metricsB)
    if (scoresA.some((x) => !Number.isFinite(x)) || scoresB.some((x) => !Number.isFinite(x))) {
      throw new Error("NaN dimension score")
    }

    const w = 520
    const h = 420
    const cx = w / 2
    const cy = h / 2 + 10
    const maxR = 132

    const axisLines = AXES.map((axis, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length
      const outer = polar(cx, cy, maxR, angle)
      return `<line pointer-events="none" x1="${cx}" y1="${cy}" x2="${outer.x}" y2="${outer.y}" stroke="#e5e7eb" stroke-width="1.5"/>`
    }).join("")

    const rings = [0.25, 0.5, 0.75, 1]
      .map(
        (t) =>
          `<circle pointer-events="none" cx="${cx}" cy="${cy}" r="${(maxR * t).toFixed(1)}" fill="none" stroke="#eef2ff" stroke-width="1"/>`
      )
      .join("")

    const labels = AXES.map((axis, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length
      const p = polar(cx, cy, maxR + 34, angle)
      return `<text pointer-events="none" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-size="13" font-weight="600">${axis.label}</text>`
    }).join("")

    const polyA = buildPolygonPoints(cx, cy, maxR, scoresA)
    const polyB = buildPolygonPoints(cx, cy, maxR, scoresB)

    const markerDots = []
    const hitZones = []

    for (let i = 0; i < AXES.length; i++) {
      const axis = AXES[i]
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length
      const ra = (scoresA[i] / 100) * maxR
      const rb = (scoresB[i] / 100) * maxR
      const pa = polar(cx, cy, ra, angle)
      const pb = polar(cx, cy, rb, angle)

      markerDots.push(
        `<circle pointer-events="none" cx="${pa.x.toFixed(2)}" cy="${pa.y.toFixed(2)}" r="5" fill="#3b82f6" fill-opacity="0.9" stroke="#ffffff" stroke-width="2"/>`
      )
      markerDots.push(
        `<circle pointer-events="none" cx="${pb.x.toFixed(2)}" cy="${pb.y.toFixed(2)}" r="5" fill="#a855f7" fill-opacity="0.9" stroke="#ffffff" stroke-width="2"/>`
      )

      const mx = (pa.x + pb.x) / 2
      const my = (pa.y + pb.y) / 2
      const spread = Math.hypot(pa.x - pb.x, pa.y - pb.y)
      const rHit = Math.max(26, spread / 2 + 16)

      const tip = buildTooltipPayload(axis, nameA, nameB, scoresA[i], scoresB[i])
      hitZones.push(
        `<circle class="radar-hit-zone" data-tip="${encodeURIComponent(tip)}" cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${rHit.toFixed(1)}" fill="rgba(59,130,246,0.06)" stroke="rgba(148,163,184,0.35)" stroke-width="1" stroke-dasharray="4 4" style="cursor:pointer"/>`
      )
    }

    svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`)
    svgEl.innerHTML = `
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12"/>
        </filter>
      </defs>
      ${rings}
      ${axisLines}
      <polygon pointer-events="none" points="${polyA}" fill="rgba(59,130,246,0.18)" stroke="#2563eb" stroke-width="2.2" filter="url(#softShadow)"/>
      <polygon pointer-events="none" points="${polyB}" fill="rgba(168,85,247,0.15)" stroke="#7c3aed" stroke-width="2.2" stroke-dasharray="6 6"/>
      ${markerDots.join("")}
      ${labels}
      ${hitZones.join("")}
    `

    if (legendNoteEl) {
      legendNoteEl.textContent =
        "指标均为 0–100 的模型归一化得分。悬停或点击轴向上的半透明热区可查看双方分数；重叠城市也会在同一热区内一并展示。"
    }

    const showTip = (ev, tipEncoded) => {
      const tip = decodeURIComponent(tipEncoded || "")
      if (!tooltipEl) return
      tooltipEl.classList.remove("hidden")
      const cx0 = ev.clientX ?? ev.touches?.[0]?.clientX
      const cy0 = ev.clientY ?? ev.touches?.[0]?.clientY
      if (cx0 == null || cy0 == null) return
      tooltipEl.style.left = `${cx0 + 14}px`
      tooltipEl.style.top = `${cy0 + 14}px`
      tooltipEl.replaceChildren()
      tip.split("\n").forEach((line) => {
        const row = document.createElement("div")
        row.textContent = line
        tooltipEl.appendChild(row)
      })
    }

    const moveTip = (ev) => {
      if (!tooltipEl || tooltipEl.classList.contains("hidden")) return
      const cx0 = ev.clientX ?? ev.touches?.[0]?.clientX
      const cy0 = ev.clientY ?? ev.touches?.[0]?.clientY
      if (cx0 == null || cy0 == null) return
      tooltipEl.style.left = `${cx0 + 14}px`
      tooltipEl.style.top = `${cy0 + 14}px`
    }

    const hideTip = () => {
      tooltipEl?.classList.add("hidden")
    }

    svgEl.querySelectorAll(".radar-hit-zone").forEach((zone) => {
      const encoded = zone.getAttribute("data-tip") || ""
      zone.addEventListener("mouseenter", (ev) => showTip(ev, encoded))
      zone.addEventListener("mousemove", moveTip)
      zone.addEventListener("mouseleave", hideTip)
      zone.addEventListener(
        "touchstart",
        (ev) => {
          showTip(ev, encoded)
        },
        { passive: true }
      )
      zone.addEventListener(
        "touchend",
        () => {
          setTimeout(hideTip, 2200)
        },
        { passive: true }
      )
    })

    rootEl.classList.remove("radar-unavailable")
    if (warnEl) warnEl.classList.add("hidden")
    return { ok: true }
  } catch (err) {
    console.error("[RadarFallback] render failed:", err)
    rootEl.classList.add("radar-unavailable")
    if (warnEl) {
      warnEl.classList.remove("hidden")
      warnEl.textContent = "部分分析暂不可用：雷达图数据异常或渲染失败，请检查输入或稍后重试。"
    }
    if (svgEl) svgEl.innerHTML = ""
    if (legendNoteEl) {
      legendNoteEl.textContent = "雷达图暂不可用；决策天平条形图仍可参考。"
    }
    return { ok: false, reason: String(err?.message || err) }
  }
}

export { AXES as TRADEOFF_AXES }
