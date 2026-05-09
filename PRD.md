# OFFER-COMPARE PM Decision Model

## Happiness Index Formula

```text
HappinessIndex = (M * 0.4) + (T * 0.25) + (L * 0.2) + (C * 0.15)
```

- `M` = cashflow safety (disposable income score)
- `T` = true hourly value (annual package / annual working hours)
- `L` = livability dignity (estimated rentable area from disposable income)
- `C` = career leverage (major-brand endorsement premium)

## Normalization

- `M = clamp(disposable / 300, 0, 100)`
- `T = clamp(trueHourly * 1.2, 0, 100)`
- `L = clamp(livableArea * 2, 0, 100)`
- `C = 100 if brand-backed, else 45`

## Stress Test Rule

If any dimension (`M`, `T`, `L`, or `C`) is below `40`, trigger warning:

`该选项可能导致生活质量滑坡，请慎重。`
