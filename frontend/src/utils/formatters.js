export function formatMoney(value, currency = 'KRW') {
  const amount = Number(value || 0)
  if (currency === 'USD') {
    const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${amount < 0 && formatted !== '0.00' ? '-' : ''}$${formatted}`
  }
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  return `${sign}₩${Math.abs(rounded).toLocaleString()}`
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
