import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/UserContext";


function TradeModal({ ticker, onClose, onComplete }) {
  const { t } = useTranslation();
  const { currentUserId } = useContext(UserContext);

  const [stock, setStock] = useState(null);
  const [account, setAccount] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setMessage("");
    setIsSuccess(false);
    setQuantity(1);

    Promise.all([
      apiFetch(`/stock/${ticker}`),
      apiFetch(`/portfolio/account?user_id=${currentUserId}`),
    ])
      .then(([stockData, accountData]) => {
        setStock(stockData);
        setAccount(accountData);
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
      if (onComplete) setTimeout(onComplete, 800);
    }
  };

  const displayName = stock ? getStockName(ticker, stock.name) : ticker;
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
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{displayName}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {ticker} · {stock.market}
              </div>
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
                  color: "#007aff",
                  marginBottom: 16,
                  fontWeight: 500,
                }}
              >
                Available Cash:{" "}
                {stock.currency === "KRW"
                  ? `₩${Math.round(account.balance_krw).toLocaleString()}`
                  : `$${account.balance_usd.toFixed(2)}`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-buy" style={{ flex: 1 }} onClick={buy}>
                {t("stock.buy")}
              </button>
              <button
                className="btn btn-sell"
                style={{ flex: 1 }}
                onClick={sell}
              >
                {t("stock.sell")}
              </button>
            </div>

            {message && (
              <p
                style={{
                  marginTop: 12,
                  textAlign: "center",
                  fontSize: 14,
                  color: isSuccess ? "#34c759" : "#ff3b30",
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
