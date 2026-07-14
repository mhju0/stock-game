import { useTranslation } from 'react-i18next'

const DEFAULT_OPTIONS = [
  ['alloc_desc', 'sort.allocDesc'],
  ['alloc_asc', 'sort.allocAsc'],
  ['mcap_desc', 'sort.mcapDesc'],
  ['mcap_asc', 'sort.mcapAsc'],
  ['name_asc', 'sort.nameAsc'],
  ['name_desc', 'sort.nameDesc'],
  ['value_desc', 'sort.valueDesc'],
  ['value_asc', 'sort.valueAsc'],
  ['pnl_desc', 'sort.pnlDesc'],
  ['pnl_asc', 'sort.pnlAsc'],
]

function SortSelect({ value, onChange, options = DEFAULT_OPTIONS, style }) {
  const { t } = useTranslation()
  return (
    <select className="input" aria-label={t('sort.ariaLabel')} style={{ width: 'auto', fontSize: 12, padding: '4px 8px', minWidth: 100, ...style }}
      value={value} onChange={onChange}>
      {options.map(([optionValue, labelKey]) => (
        <option key={optionValue} value={optionValue}>{t(labelKey)}</option>
      ))}
    </select>
  )
}

export default SortSelect
