import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/userContext";
import { useQueryClient } from '@tanstack/react-query'
import { useAccountQuery, useWatchlistContainsQuery, useWatchlistToggleMutation, queryKeys } from '../query/queries'


function TradeModal({ ticker, sessionId = null, onClose, onComplete, onWatchlistUpdated }) {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useContext(UserContext);
  const queryClient = useQueryClient()

  const [stock, setStock] = useState(null);
  const [myHolding, setMyHolding] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null); // "BUY" or "SELL"
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const { data: account } = useAccountQuery(currentUserId, sessionId)
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
    setQuantity("1");

    Promise.all([
      apiFetch(`/stock/${ticker}`, {}, setMessage),
      apiFetch(
        sessionId
          ? `/game/sessions/${sessionId}/portfolio/holdings`
          : `/portfolio/holdings?user_id=${currentUserId}`,
        {}
      ),
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
  }, [ticker, currentUserId, sessionId, t]);

  if (!ticker) return null;

  const buy = async () => {
    if (submitting) return false;
    setMessage("");
    setIsSuccess(false);
    setSubmitting(true);
    const data = await apiPost(
      sessionId
        ? `/game/sessions/${sessionId}/trade/buy`
        : `/trade/buy?user_id=${currentUserId}`,
      { ticker, quantity: quantityNumber },
      (err) => setMessage(err)
    );
    setSubmitting(false);
    if (data) {
      setMessage(t("trade.buySuccess"));
      setIsSuccess(true);
      setMyHolding((current) => current + quantityNumber);
      if (data.balance) {
        queryClient.setQueryData(queryKeys.account(currentUserId, sessionId), (current) => ({
          ...(current || {}),
          balance_krw: data.balance.krw,
          balance_usd: data.balance.usd,
        }))
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId, sessionId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId, sessionId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId, sessionId) })
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
      sessionId
        ? `/game/sessions/${sessionId}/trade/sell`
        : `/trade/sell?user_id=${currentUserId}`,
      { ticker, quantity: quantityNumber },
      (err) => setMessage(err)
    );
    setSubmitting(false);
    if (data) {
      setMessage(t("trade.sellSuccess"));
      setIsSuccess(true);
      setMyHolding((current) => Math.max(0, current - quantityNumber));
      if (data.balance) {
        queryClient.setQueryData(queryKeys.account(currentUserId, sessionId), (current) => ({
          ...(current || {}),
          balance_krw: data.balance.krw,
          balance_usd: data.balance.usd,
        }))
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId, sessionId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId, sessionId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.analyticsPerformance(currentUserId, sessionId) })
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
  const quantityNumber = typeof quantity === "number" ? quantity : Number(quantity);
  const isWholeQuantity = /^\d+$/.test(String(quantity));
  const fmt = (v) =>
    stock?.currency === "KRW"
      ? `₩${Math.round(v).toLocaleString()}`
      : `$${v.toFixed(2)}`;
  const availableCash = account && stock
    ? stock.currency === "KRW"
      ? account.balance_krw
      : account.balance_usd
    : 0;
  const safeWholeHolding = Math.max(0, Math.floor(Number(myHolding) || 0));
  const estimatedTotal = stock && Number.isFinite(quantityNumber) ? stock.price * quantityNumber : 0;
  const maxBuyQuantity = stock?.price > 0 ? Math.floor(availableCash / stock.price) : 0;
  const invalidWholeQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0 && !isWholeQuantity;
  const invalidQuantity = !Number.isFinite(quantityNumber) || quantityNumber <= 0 || invalidWholeQuantity;
  const exceedsCash = !!account && !!stock && estimatedTotal > availableCash;
  const exceedsHolding = !!stock && quantityNumber > safeWholeHolding;
  const showCashWarning = !invalidQuantity && exceedsCash && (!confirmAction || confirmAction === 'BUY');
  const showHoldingWarning = !invalidQuantity && exceedsHolding && confirmAction === 'SELL';
  const confirmDisabled = submitting ||
    invalidQuantity ||
    (confirmAction === 'BUY' && exceedsCash) ||
    (confirmAction === 'SELL' && exceedsHolding);
  const quickQuantities = [
    { key: 'one', label: `1${t('holdings.shares')}`, value: 1 },
    { key: 'five', label: `5${t('holdings.shares')}`, value: 5 },
    { key: 'ten', label: `10${t('holdings.shares')}`, value: 10 },
    { key: 'max', label: t('trade.maxBuy'), value: maxBuyQuantity, disabled: maxBuyQuantity <= 0 },
    { key: 'all', label: t('trade.sellAll'), value: safeWholeHolding, disabled: safeWholeHolding <= 0 },
  ];
  const setQuickQuantity = (value) => {
    setQuantity(String(value));
    setConfirmAction(null);
  };
  const handleQuantityChange = (event) => {
    const nextValue = event.target.value;
    if (nextValue === "" || /^\d*\.?\d*$/.test(nextValue)) {
      setQuantity(nextValue);
      setConfirmAction(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trade-modal-header">
          <div className="trade-modal-heading">
            <div id="trade-modal-title" className="trade-modal-title">
              {displayName}
            </div>
            {!loading && stock && !stock.error && (
              <>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {ticker} · {stock.market}
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: myHolding > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {i18n.language === 'ko' ? `보유: ${safeWholeHolding}주` : `Holdings: ${safeWholeHolding} shares`}
                </div>
              </>
            )}
          </div>

          <div className="trade-modal-actions">
            {!loading && stock && !stock.error && (
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
            )}
            <button
              type="button"
              ref={closeButtonRef}
              className="modal-close-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
        </div>

        {loading ? (
          <p>{t("common.loading")}</p>
        ) : !stock || stock.error ? (
          <p style={{ color: message ? 'var(--negative)' : 'var(--text-secondary)' }}>
            {message || t("stock.notFound")}
          </p>
        ) : (
          <>
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

            <div className="trade-guide">
              {t('trade.guidance')}
            </div>

            <div className="trade-context-grid">
              <div className="trade-context-item">
                <div className="trade-context-label">{t("trade.availableCash")}</div>
                <div className="trade-context-value">
                  {stock.currency === "KRW"
                    ? `₩${Math.round(availableCash).toLocaleString()}`
                    : `$${availableCash.toFixed(2)}`}
                </div>
              </div>
              <div className="trade-context-item">
                <div className="trade-context-label">{t("trade.ownedQuantity")}</div>
                <div className="trade-context-value">
                  {safeWholeHolding} {t('holdings.shares')}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              {t("trade.quickQuantity")}
            </div>
            <div className="quantity-chip-row">
              {quickQuantities.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="btn quantity-chip"
                  onClick={() => setQuickQuantity(preset.value)}
                  disabled={submitting || preset.disabled}
                  style={{
                    fontSize: 13,
                    background:
                      isWholeQuantity && quantityNumber === preset.value ? "var(--text-primary)" : "transparent",
                    color:
                      isWholeQuantity && quantityNumber === preset.value
                        ? "var(--bg-primary)"
                        : "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <input
              className="input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={quantity}
              onChange={handleQuantityChange}
              disabled={submitting}
              style={{ marginBottom: 8, textAlign: "center", fontSize: 16 }}
            />

            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-secondary)",
                marginBottom: 12,
              }}
            >
              <div style={{ marginBottom: 4 }}>{t("trade.estimatedTotal")}</div>
              <strong style={{ color: 'var(--text-primary)', fontSize: 16 }}>
                {fmt(estimatedTotal)}
              </strong>
            </div>

            {(invalidQuantity || showCashWarning || showHoldingWarning) && (
              <div className="trade-warning">
                {invalidWholeQuantity ? (
                  <div>{t("trade.quantityWholeNumber")}</div>
                ) : (
                  invalidQuantity && <div>{t("trade.quantityInvalid")}</div>
                )}
                {showCashWarning && <div>{t("trade.exceedsCash")}</div>}
                {showHoldingWarning && <div>{t("trade.exceedsHolding")}</div>}
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
                    {displayName} × {quantityNumber}
                  </div>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {fmt(estimatedTotal)}
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
                    disabled={confirmDisabled}
                  >
                    {submitting ? t("common.loading") : t("common.confirm")}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-buy" style={{ flex: 1 }} onClick={() => setConfirmAction('BUY')} disabled={submitting || invalidQuantity || exceedsCash}>
                  {t("stock.buy")}
                </button>
                <button className="btn btn-sell" style={{ flex: 1 }} onClick={() => setConfirmAction('SELL')} disabled={submitting || invalidQuantity || exceedsHolding}>
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
