import { apiFetch } from '../api'
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import TradeModal from "../components/TradeModal";
import { getStockName } from "../utils/stockNames";


function Market() {
  const { t, i18n } = useTranslation();
  const [market, setMarket] = useState("US");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeTicker, setTradeTicker] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/market/top30/${market}`)
      .then((data) => {
        if (data) setStocks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [market]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["US", "KR"].map((m) => (
          <button
            key={m}
            className="btn"
            onClick={() => setMarket(m)}
            style={{
              minWidth: 80,
              background: market === m ? 'var(--text-primary)' : "transparent",
              color: market === m ? "white" : 'var(--text-secondary)',
              border: "1px solid #e5e5e7",
            }}
          >
            {m === "US" ? "US" : "Korea"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">{t("common.loading")}</div>
      ) : stocks.length === 0 ? (
        <div className="empty-state">
          Loading market data... try again in 30 seconds
        </div>
      ) : (
        <div className="card">
          {stocks.map((s, i) => {
            const name = getStockName(s.ticker, s.name, i18n.language);
            return (
              <div
                key={s.ticker}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: "1px solid #f5f5f7",
                  cursor: "pointer",
                }}
                onClick={() => setTradeTicker(s.ticker)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--bg-tertiary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: 'var(--border-light)',
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <strong style={{ fontSize: 14 }}>{name}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {s.ticker}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {s.currency === "KRW"
                      ? `₩${s.price.toLocaleString()}`
                      : `$${s.price.toFixed(2)}`}
                  </div>
                  <div
                    className={s.change >= 0 ? "positive" : "negative"}
                    style={{ fontSize: 13 }}
                  >
                    {s.change >= 0 ? "+" : ""}
                    {s.change_pct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => {
            setTradeTicker(null);
          }}
        />
      )}
    </div>
  );
}

export default Market;
