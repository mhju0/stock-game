import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/UserContext";
import { useQueryClient } from '@tanstack/react-query'
import { useAccountQuery, useWatchlistContainsQuery, useWatchlistToggleMutation, queryKeys } from '../query/queries'


function TradeModal({ ticker, onClose, onComplete, onWatchlistUpdated }) {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useContext(UserContext);
  const queryClient = useQueryClient()

  const [stock, setStock] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null); // "BUY" or "SELL"
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const { data: account } = useAccountQuery(currentUserId)
  const { data: watchlistContains } = useWatchlistContainsQuery(currentUserId, ticker)
  const toggleWatchlistMutation = useWatchlistToggleMutation(currentUserId)
  const isInWatchlist = !!watchlistContains?.in_watchlist

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMessage("");
    setIsSuccess(false);
    setConfirmAction(null);
    setQuantity(1);

    Promise.all([
      apiFetch(`/stock/${ticker}`),
    ])
      .then(([stockData]) => {
        setStock(stockData);
        setLoading(false);
      })
      .catch(() => {
        setMessage("Failed to load stock data");
        setLoading(false);
      });
  }, [ticker, currentUserId]);

  if (!ticker) return null;

  const buy = async () => {
    setMessage("");
    setIsSuccess(false);
    const data = await apiPost(
      `/trade/buy?user_id=${currentUserId}`,
      { ticker, quantity },
      (err) => setMessage(err)
    );
    if (data) {
      setMessage(t("trade.buySuccess"));
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId) })
      if (onComplete) setTimeout(onComplete, 800);
    }
  };

  const sell = async () => {
    setMessage("");
    setIsSuccess(false);
    const data = await apiPost(
      `/trade/sell?user_id=${currentUserId}`,
      { ticker, quantity },
      (err) => setMessage(err)
    );
    if (data) {
      setMessage(t("trade.sellSuccess"));
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId) })
      if (onComplete) setTimeout(onComplete, 800);
    }
  };

  const toggleWatchlist = async () => {
    setMessage("")
    setIsSuccess(false)
    if (!currentUserId || !ticker) return

    setWatchlistLoading(true)
    try {
      await toggleWatchlistMutation.mutateAsync({ ticker, isInWatchlist })
      setMessage(isInWatchlist ? t("watchlist.remove") : t("watchlist.add"))
      setIsSuccess(true)
      if (onWatchlistUpdated) onWatchlistUpdated()
    } finally {
      setWatchlistLoading(false)
    }
  }

  const displayName = stock ? getStockName(ticker, stock.name, i18n.language) : ticker;
  const fmt = (v) =>
    stock?.currency === "KRW"
      ? `₩${Math.round(v).toLocaleString()}`
      : `$${v.toFixed(2)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <p>{t("common.loading")}</p>
        ) : !stock || stock.error ? (
          <p>{t("stock.notFound")}</p>
        ) : (
          <>
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {ticker} · {stock.market}
                </div>
              </div>

              <button
                type="button"
                className="btn"
                onClick={toggleWatchlist}
                disabled={watchlistLoading}
                title={isInWatchlist ? t("watchlist.remove") : t("watchlist.add")}
                aria-label={isInWatchlist ? t("watchlist.remove") : t("watchlist.add")}
                style={{
                  flexShrink: 0,
                  width: 40,
                  height: 36,
                  padding: 0,
                  fontSize: 18,
                  borderRadius: 10,
                  border: `1px solid ${isInWatchlist ? "var(--accent)" : "var(--border)"}`,
                  background: isInWatchlist ? "var(--accent-bg)" : "transparent",
                  color: isInWatchlist ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {isInWatchlist ? "★" : "☆"}
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-secondary)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {t("stock.price")}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {fmt(stock.price)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[1, 5, 10, 25].map((v) => (
                <button
                  key={v}
                  className="btn"
                  onClick={() => setQuantity(v)}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: "8px 0",
                    background:
                      quantity === v ? "var(--text-primary)" : "transparent",
                    color:
                      quantity === v
                        ? "var(--bg-primary)"
                        : "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            <input
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              style={{ marginBottom: 8, textAlign: "center", fontSize: 16 }}
            />

            <div
              style={{
                textAlign: "center",
                fontSize: 14,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              = {fmt(stock.price * quantity)}
            </div>

            {account && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  color: 'var(--accent)',
                  marginBottom: 16,
                  fontWeight: 500,
                }}
              >
                {t("trade.availableCash")}:{" "}
                {stock.currency === "KRW"
                  ? `₩${Math.round(account.balance_krw).toLocaleString()}`
                  : `$${account.balance_usd.toFixed(2)}`}
              </div>
            )}

            {confirmAction ? (
              <div>
                <div style={{
                  background: 'var(--bg-secondary)', borderRadius: 12, padding: 16,
                  marginBottom: 12, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {confirmAction === 'BUY' ? t("stock.buy") : t("stock.sell")}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {displayName} × {quantity}
                  </div>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {fmt(stock.price * quantity)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ flex: 1, border: '1px solid var(--border)' }}
                    onClick={() => setConfirmAction(null)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    className={confirmAction === 'BUY' ? "btn btn-buy" : "btn btn-sell"}
                    style={{ flex: 1 }}
                    onClick={() => { confirmAction === 'BUY' ? buy() : sell(); setConfirmAction(null); }}
                  >
                    {t("common.confirm")}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-buy" style={{ flex: 1 }} onClick={() => setConfirmAction('BUY')}>
                  {t("stock.buy")}
                </button>
                <button className="btn btn-sell" style={{ flex: 1 }} onClick={() => setConfirmAction('SELL')}>
                  {t("stock.sell")}
                </button>
              </div>
            )}

            {message && (
              <p
                style={{
                  marginTop: 12,
                  textAlign: "center",
                  fontSize: 14,
                  color: isSuccess ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TradeModal;
