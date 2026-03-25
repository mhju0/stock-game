import { useTranslation } from 'react-i18next'

function SortSelect({ value, onChange, style }) {
  const { t } = useTranslation()
  return (
    <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px', minWidth: 100, ...style }}
      value={value} onChange={onChange}>
      <option value="alloc_desc">{t('sort.allocDesc')}</option>
      <option value="alloc_asc">{t('sort.allocAsc')}</option>
      <option value="mcap_desc">{t('sort.mcapDesc')}</option>
      <option value="mcap_asc">{t('sort.mcapAsc')}</option>
      <option value="name_asc">{t('sort.nameAsc')}</option>
      <option value="name_desc">{t('sort.nameDesc')}</option>
      <option value="value_desc">{t('sort.valueDesc')}</option>
      <option value="value_asc">{t('sort.valueAsc')}</option>
      <option value="pnl_desc">{t('sort.pnlDesc')}</option>
      <option value="pnl_asc">{t('sort.pnlAsc')}</option>
    </select>
  )
}

export default SortSelect
