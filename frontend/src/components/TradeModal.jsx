import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/userContext";
import { useQueryClient } from '@tanstack/react-query'
import { useAccountQuery, useWatchlistContainsQuery, useWatchlistToggleMutation, queryKeys } from '../query/queries'


function TradeModal({ ticker, onClose, onComplete, onWatchlistUpdated }) {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useContext(UserContext);
  const queryClient = useQueryClient()

  const [stock, setStock] = useState(null);
  const [myHolding, setMyHolding] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null); // "BUY" or "SELL"
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const { data: account } = useAccountQuery(currentUserId)
  const { data: watchlistContains } = useWatchlistContainsQuery(currentUserId, ticker)
  const toggleWatchlistMutation = useWatchlistToggleMutation(currentUserId)
  const isInWatchlist = !!watchlistContains?.in_watchlist

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMessage("");
    setIsSuccess(false);
    setConfirmAction(null);
    setQuantity(1);

    Promise.all([
      apiFetch(`/stock/${ticker}`, {}, setMessage),
      apiFetch(`/portfolio/holdings?user_id=${currentUserId}`, {}, setMessage),
    ])
      .then(([stockData, holdingsData]) => {
        setStock(stockData);
        const held = (holdingsData || []).find(h => h.ticker === ticker);
        setMyHolding(held ? held.quantity : 0);
        setLoading(false);
      })
      .catch(() => {
        setMessage(t("common.error"));
        setLoading(false);
      });
  }, [ticker, currentUserId, t]);

  if (!ticker) return null;

  const buy = async () => {
    if (submitting) return false;
    setMessage("");
    setIsSuccess(false);
    setSubmitting(true);
    const data = await apiPost(
      `/trade/buy?user_id=${currentUserId}`,
      { ticker, quantity },
      (err) => setMessage(err)
    );
    setSubmitting(false);
    if (data) {
      setMessage(t("trade.buySuccess"));
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId) })
      if (onComplete) setTimeout(onComplete, 800);
      return true;
    }
    return false;
  };

  const sell = async () => {
    if (submitting) return false;
    setMessage("");
    setIsSuccess(false);
    setSubmitting(true);
    const data = await apiPost(
      `/trade/sell?user_id=${currentUserId}`,
      { ticker, quantity },
      (err) => setMessage(err)
    );
    setSubmitting(false);
    if (data) {
      setMessage(t("trade.sellSuccess"));
      setIsSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId) })
      if (onComplete) setTimeout(onComplete, 800);
      return true;
    }
    return false;
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
    } catch {
      setMessage(t("common.error"))
    } finally {
      setWatchlistLoading(false)
    }
  }

  const submitTrade = async () => {
    const succeeded = confirmAction === 'BUY' ? await buy() : await sell()
    if (succeeded) setConfirmAction(null)
  }

  const displayName = stock ? getStockName(ticker, stock.name, i18n.language) : ticker;
  const fmt = (v) =>
    stock?.currency === "KRW"
      ? `₩${Math.round(v).toLocaleString()}`
      : `$${v.toFixed(2)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={i18n.language === 'ko' ? '주식 거래' : 'Stock trade'}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeButtonRef}
          className="modal-close-btn"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>
        {loading ? (
          <p>{t("common.loading")}</p>
        ) : !stock || stock.error ? (
          <p style={{ color: message ? 'var(--negative)' : 'var(--text-secondary)' }}>
            {message || t("stock.notFound")}
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div id="trade-modal-title" style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {ticker} · {stock.market}
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: myHolding > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {i18n.language === 'ko' ? `보유: ${myHolding}주` : `Holdings: ${myHolding} shares`}
                </div>
              </div>

              <button
                type="button"
                className="btn"
                onClick={toggleWatchlist}
                disabled={watchlistLoading || submitting}
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
                  disabled={submitting}
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
              disabled={submitting}
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
                    onClick={() => setConfirmAction(null)}
                    disabled={submitting}>
                    {t("common.cancel")}
                  </button>
                  <button
                    className={confirmAction === 'BUY' ? "btn btn-buy" : "btn btn-sell"}
                    style={{ flex: 1 }}
                    onClick={submitTrade}
                    disabled={submitting || quantity <= 0}
                  >
                    {submitting ? t("common.loading") : t("common.confirm")}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-buy" style={{ flex: 1 }} onClick={() => setConfirmAction('BUY')} disabled={submitting || quantity <= 0}>
                  {t("stock.buy")}
                </button>
                <button className="btn btn-sell" style={{ flex: 1 }} onClick={() => setConfirmAction('SELL')} disabled={submitting || quantity <= 0}>
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
