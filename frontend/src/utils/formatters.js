export function formatMoney(value, currency = 'KRW') {
  if (currency === 'USD') return `$${Number(value || 0).toFixed(2)}`
  return `₩${Math.round(Number(value || 0)).toLocaleString()}`
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
