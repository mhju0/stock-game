export function formatMoney(value, currency = 'KRW') {
  if (currency === 'USD') return `$${Number(value || 0).toFixed(2)}`
  return `₩${Math.round(Number(value || 0)).toLocaleString()}`
}

export function formatMarketCap(value, currency = 'KRW') {
  if (!value) return '-'
  const prefix = currency === 'KRW' ? '₩' : '$'
  if (value >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${prefix}${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`
  return `${prefix}${Number(value).toLocaleString()}`
}

export function formatDateTime(isoDate, locale = 'en-US', withTime = true) {
  const date = new Date(isoDate)
  if (withTime) {
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
