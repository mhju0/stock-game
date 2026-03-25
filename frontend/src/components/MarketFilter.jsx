import { useTranslation } from 'react-i18next'

function MarketFilter({ value, onChange, style }) {
  const { t } = useTranslation()
  return (
    <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px', minWidth: 80, ...style }}
      value={value} onChange={onChange}>
      <option value="ALL">{t('filter.allMarkets')}</option>
      <option value="US">{t('filter.usOnly')}</option>
      <option value="KRX">{t('filter.krxOnly')}</option>
    </select>
  )
}

export default MarketFilter
