import { useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import TradeModal from "../components/TradeModal";
import SortSelect from "../components/SortSelect";
import { getStockName } from "../utils/stockNames";
import { formatMoney } from '../utils/formatters'
import { UserContext } from "../context/userContext";
import { useWatchlistQuery, useWatchlistToggleMutation } from '../query/queries'
import { gamePath, isSessionEnded } from "../sessionRoutes";


const WATCHLIST_SORT_OPTIONS = [
  ['name_asc', 'sort.nameAsc'],
  ['name_desc', 'sort.nameDesc'],
  ['price_desc', 'sort.priceDesc'],
  ['price_asc', 'sort.priceAsc'],
]


function WatchlistSection({ title, items, onOpenDetails, onTrade, onRemove, sort, setSort, i18n, t }) {
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const nameA = getStockName(a.ticker, a.name, i18n.language)
      const nameB = getStockName(b.ticker, b.name, i18n.language)
      switch (sort) {
        case 'name_asc': return nameA.localeCompare(nameB)
        case 'name_desc': return nameB.localeCompare(nameA)
        case 'price_desc':
        case 'price_asc':
          if (!Number.isFinite(a.price) || !Number.isFinite(b.price)) return Number(Number.isFinite(b.price)) - Number(Number.isFinite(a.price))
          return sort === 'price_desc' ? b.price - a.price : a.price - b.price
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
        <SortSelect
          value={sort}
          onChange={e => setSort(e.target.value)}
          options={WATCHLIST_SORT_OPTIONS}
        />
      </div>
      {sorted.map((item) => {
        const name = getStockName(item.ticker, item.name, i18n.language);
        return (
          <div
            key={item.ticker}
            className="watchlist-row"
          >
            <button
              type="button"
              className="watchlist-row-main"
              onClick={() => onOpenDetails(item.ticker)}
              aria-label={`${name}, ${Number.isFinite(item.price) ? formatMoney(item.price, item.currency) : t('common.unavailable')}. ${t('stock.viewDetails')}`}
            >
              <div>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {item.ticker}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {Number.isFinite(item.price) ? formatMoney(item.price, item.currency) : t('common.unavailable')}
                </div>
              </div>
            </button>
            <div className="watchlist-actions">
              <button
                type="button"
                className="btn watchlist-trade-btn"
                onClick={() => onTrade(item.ticker)}
              >
                {t("watchlist.trade")}
              </button>
              <button
                type="button"
                className="btn watchlist-remove-btn"
                onClick={() => onRemove(item.ticker)}
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
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { session } = useOutletContext() || {};
  const { currentUserId } = useContext(UserContext);
  const toggleMutation = useWatchlistToggleMutation(currentUserId)
  const tradeDisabledReason = isSessionEnded(session) ? t('game.tradeUnavailableEnded') : ''

  const [tradeTicker, setTradeTicker] = useState(null);
  const [sortUS, setSortUS] = useState('name_asc');
  const [sortKR, setSortKR] = useState('name_asc');
  const [removeError, setRemoveError] = useState('')
  const { data: watchlist = [], isLoading: loading, isError, refetch: refetchWatchlist } = useWatchlistQuery(currentUserId)

  const remove = async (ticker) => {
    setRemoveError('')
    try {
      await toggleMutation.mutateAsync({ ticker, isInWatchlist: true })
    } catch (error) {
      setRemoveError(error.message || t('common.error'))
    }
  };

  const openStockDetails = (ticker) => {
    const query = `?ticker=${encodeURIComponent(ticker)}`;
    navigate(sessionId ? `${gamePath(sessionId, 'search')}${query}` : `/search${query}`);
  };

  const usStocks = useMemo(() => watchlist.filter(w => w.market === 'US'), [watchlist])
  const krStocks = useMemo(() => watchlist.filter(w => w.market !== 'US'), [watchlist])
  const searchPath = sessionId ? gamePath(sessionId, 'search') : '/search'
  const watchlistHeader = (
    <div className="page-header utility-page-header">
      <div className="page-header-copy">
        <div className="page-eyebrow">{t('watchlist.eyebrow')}</div>
        <h1 className="page-title">{t('watchlist.title')}</h1>
        <p className="page-subtitle">{t('watchlist.subtitle')}</p>
        <div className="page-header-meta">
          <span>{t('watchlist.savedCount', { count: watchlist.length })}</span>
          <span>{t('watchlist.delayed')}</span>
        </div>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => navigate(searchPath)}>
          {t('watchlist.findAction')}
        </button>
      </div>
    </div>
  )

  if (loading) return <p>{t("common.loading")}</p>;

  if (isError) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
        <button className="btn btn-primary" onClick={() => refetchWatchlist()}>{t('common.retry')}</button>
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div>
        {watchlistHeader}
        <div className="empty-state">
          <h2 style={{ fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
            {t("watchlist.emptyTitle")}
          </h2>
          <p style={{ marginBottom: 18 }}>{t("watchlist.emptyBody")}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate(searchPath)}>
            {t("nav.search")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {watchlistHeader}
      {removeError && <p role="alert" className="negative">{removeError}</p>}

      <WatchlistSection
        title={t('watchlist.koreaSection')}
        items={krStocks}
        onOpenDetails={openStockDetails}
        onTrade={setTradeTicker}
        onRemove={remove}
        sort={sortKR}
        setSort={setSortKR}
        i18n={i18n}
        t={t}
      />

      <WatchlistSection
        title={t('watchlist.usSection')}
        items={usStocks}
        onOpenDetails={openStockDetails}
        onTrade={setTradeTicker}
        onRemove={remove}
        sort={sortUS}
        setSort={setSortUS}
        i18n={i18n}
        t={t}
      />

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          sessionId={sessionId}
          tradeDisabledReason={tradeDisabledReason}
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
