import { apiDelete } from '../api'
import { useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from '@tanstack/react-query'
import TradeModal from "../components/TradeModal";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/UserContext";
import { useWatchlistQuery, queryKeys } from '../query/queries'


function WatchlistSection({ title, items, onTrade, onRemove, sort, setSort, i18n, t, isKR }) {
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const nameA = getStockName(a.ticker, a.name, i18n.language)
      const nameB = getStockName(b.ticker, b.name, i18n.language)
      switch (sort) {
        case 'name_asc': return nameA.localeCompare(nameB)
        case 'name_desc': return nameB.localeCompare(nameA)
        case 'price_desc': return (b.price || 0) - (a.price || 0)
        case 'price_asc': return (a.price || 0) - (b.price || 0)
        default: return 0
      }
    })
  }, [items, sort, i18n.language])

  if (items.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {title} ({items.length})
        </div>
        <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px', minWidth: 100 }}
          value={sort} onChange={e => setSort(e.target.value)}>
          <option value="name_asc">{isKR ? '이름 ㄱ→ㅎ' : 'Name A→Z'}</option>
          <option value="name_desc">{isKR ? '이름 ㅎ→ㄱ' : 'Name Z→A'}</option>
          <option value="price_desc">{isKR ? '가격 ↓' : 'Price ↓'}</option>
          <option value="price_asc">{isKR ? '가격 ↑' : 'Price ↑'}</option>
        </select>
      </div>
      {sorted.map((item) => {
        const name = getStockName(item.ticker, item.name, i18n.language);
        return (
          <div
            key={item.ticker}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 0", borderBottom: "1px solid var(--border-light)", cursor: "pointer",
            }}
            onClick={() => onTrade(item.ticker)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div>
              <strong style={{ fontSize: 15 }}>{name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {item.ticker}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {item.currency === "KRW"
                    ? `₩${item.price?.toLocaleString() || "-"}`
                    : `$${item.price?.toFixed(2) || "-"}`}
                </div>
              </div>
              <button
                className="btn"
                onClick={(e) => { e.stopPropagation(); onRemove(item.ticker); }}
                style={{ fontSize: 12, color: 'var(--negative)', border: "1px solid #fde8e8", padding: "4px 10px" }}
              >
                {t("watchlist.remove")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )
}


function Watchlist() {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useContext(UserContext);
  const queryClient = useQueryClient()

  const [tradeTicker, setTradeTicker] = useState(null);
  const [sortUS, setSortUS] = useState('name_asc');
  const [sortKR, setSortKR] = useState('name_asc');
  const { data: watchlist = [], isLoading: loading, refetch: refetchWatchlist } = useWatchlistQuery(currentUserId)

  const remove = async (ticker) => {
    await apiDelete(`/watchlist/remove/${ticker}?user_id=${currentUserId}`);
    queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(currentUserId) })
  };

  const usStocks = useMemo(() => watchlist.filter(w => w.market === 'US'), [watchlist])
  const krStocks = useMemo(() => watchlist.filter(w => w.market !== 'US'), [watchlist])

  if (loading) return <p>{t("common.loading")}</p>;

  if (watchlist.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("watchlist.empty")}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t("watchlist.title")}</div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {t('watchlist.delayed')}
        </span>
      </div>

      <WatchlistSection
        title={i18n.language === 'ko' ? '🇰🇷 한국' : '🇰🇷 Korea'}
        items={krStocks}
        onTrade={setTradeTicker}
        onRemove={remove}
        sort={sortKR}
        setSort={setSortKR}
        i18n={i18n}
        t={t}
        isKR={true}
      />

      <WatchlistSection
        title={i18n.language === 'ko' ? '🇺🇸 미국' : '🇺🇸 US'}
        items={usStocks}
        onTrade={setTradeTicker}
        onRemove={remove}
        sort={sortUS}
        setSort={setSortUS}
        i18n={i18n}
        t={t}
        isKR={false}
      />

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onWatchlistUpdated={refetchWatchlist}
          onComplete={() => {
            setTradeTicker(null);
            refetchWatchlist();
          }}
        />
      )}
    </div>
  );
}

export default Watchlist;
