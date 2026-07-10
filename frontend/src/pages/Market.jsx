import { apiFetch } from '../api'
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getStockName } from "../utils/stockNames";
import { gamePath } from "../sessionRoutes";


function Market() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [market, setMarket] = useState("US");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStocks = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch(`/market/top30/${market}`, {}, setError).then((data) => {
      if (data) setStocks(data);
      setLoading(false);
    });
  }, [market]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const openStockDetails = (ticker) => {
    const query = `?ticker=${encodeURIComponent(ticker)}`;
    navigate(sessionId ? `${gamePath(sessionId, 'search')}${query}` : `/search${query}`);
  };

  return (
    <div>
      <div className="segmented-control" style={{ marginBottom: 16 }}>
        {["US", "KR"].map((m) => (
          <button
            key={m}
            className={`btn segmented-button ${market === m ? 'segmented-button-selected' : ''}`}
            onClick={() => setMarket(m)}
            style={{
              minWidth: 80,
            }}
          >
            {m === "US" ? t("market.us") : t("market.kr")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">{t("common.loading")}</div>
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
          <button className="btn btn-primary" onClick={fetchStocks}>{t('common.retry')}</button>
        </div>
      ) : stocks.length === 0 ? (
        <div className="empty-state">
          {t('market.empty')}
        </div>
      ) : (
        <div className="card">
          {stocks.map((s, i) => {
            const name = getStockName(s.ticker, s.name, i18n.language);
            return (
              <button
                key={s.ticker}
                type="button"
                className="interactive-row"
                onClick={() => openStockDetails(s.ticker)}
                aria-label={`${name} ${t('stock.viewDetails')}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-light)",
                  cursor: "pointer",
                }}
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
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ textAlign: "right" }}>
                    <div className="numeric" style={{ fontSize: 15, fontWeight: 600 }}>
                      {s.currency === "KRW"
                        ? `₩${s.price.toLocaleString()}`
                        : `$${s.price.toFixed(2)}`}
                    </div>
                    <div
                      className={s.change >= 0 ? "positive numeric" : "negative numeric"}
                      style={{ fontSize: 13 }}
                    >
                      {s.change >= 0 ? "+" : ""}
                      {s.change_pct}%
                    </div>
                  </div>
                  <span className="market-detail-pill">
                    {t('stock.viewDetails')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Market;
