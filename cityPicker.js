/**
 * 可搜索城市选择器：按首字母分组展示；hidden input 与表单其它逻辑兼容。
 */

import { buildCityCatalog, cityMatchesQuery } from "./cityCatalog.js"

function hide(el) {
  el.classList.add("hidden")
}

function show(el) {
  el.classList.remove("hidden")
}

/**
 * @param {HTMLElement} root
 * @param {HTMLInputElement} hiddenInput
 * @param {Record<string, object>} cityCostData
 * @param {{ onChange?: () => void }} options
 */
export function mountCityPicker(root, hiddenInput, cityCostData, options = {}) {
  const catalog = buildCityCatalog(cityCostData)
  const textInput = root.querySelector(".city-picker-input")
  const panel = root.querySelector(".city-picker-panel")
  if (!textInput || !panel || !hiddenInput) {
    console.error("[CityPicker] missing elements")
    return { setValue() {}, destroy() {} }
  }

  let catalogItems = catalog

  function renderPanel(filtered) {
    const byLetter = new Map()
    for (const item of filtered) {
      if (!byLetter.has(item.letter)) byLetter.set(item.letter, [])
      byLetter.get(item.letter).push(item)
    }
    const letters = [...byLetter.keys()].sort((a, b) => a.localeCompare(b))
    const frag = document.createDocumentFragment()
    for (const L of letters) {
      const head = document.createElement("div")
      head.className = "city-picker-group-title"
      head.textContent = L
      frag.appendChild(head)
      for (const item of byLetter.get(L)) {
        const row = document.createElement("button")
        row.type = "button"
        row.className = "city-picker-item"
        row.textContent = item.name
        row.addEventListener("click", () => select(item.name))
        frag.appendChild(row)
      }
    }
    panel.replaceChildren(frag)
  }

  function select(name) {
    if (!catalogItems.some((c) => c.name === name)) return
    hiddenInput.value = name
    textInput.value = name
    hide(panel)
    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }))
    options.onChange?.()
  }

  function filterAndRender(q) {
    const filtered = catalogItems.filter((item) => cityMatchesQuery(item, q))
    renderPanel(filtered.length ? filtered : catalogItems)
  }

  function syncDisplayFromHidden() {
    const v = hiddenInput.value
    textInput.value = v || ""
  }

  /** 展开时必须展示完整库：不能用当前选中城市名做筛选，否则只剩 1 条（如仅「北京」）。 */
  function openPanel() {
    renderPanel(catalogItems)
    show(panel)
  }

  textInput.addEventListener("focus", () => {
    openPanel()
  })

  textInput.addEventListener("input", () => {
    filterAndRender(textInput.value)
    show(panel)
  })

  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide(panel)
  })

  const onDocClick = (e) => {
    if (!root.contains(e.target)) hide(panel)
  }
  document.addEventListener("click", onDocClick)

  return {
    setValue(name) {
      if (catalogItems.some((c) => c.name === name)) {
        hiddenInput.value = name
        textInput.value = name
      } else if (catalogItems.length) {
        hiddenInput.value = catalogItems[0].name
        textInput.value = catalogItems[0].name
      }
    },
    getValue() {
      return hiddenInput.value
    },
    refreshCatalog(nextData) {
      catalogItems = buildCityCatalog(nextData)
      syncDisplayFromHidden()
    },
    destroy() {
      document.removeEventListener("click", onDocClick)
    }
  }
}
