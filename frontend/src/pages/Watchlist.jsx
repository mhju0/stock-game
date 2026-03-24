import { apiFetch, apiDelete } from '../api'
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import TradeModal from "../components/TradeModal";
import { getStockName } from "../utils/stockNames";
import { UserContext } from "../context/UserContext";


function Watchlist() {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useContext(UserContext); // Get user ID
  
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeTicker, setTradeTicker] = useState(null);

  const fetchWatchlist = async () => {
    setLoading(true);
    const data = await apiFetch(`/watchlist/?user_id=${currentUserId}`);
    if (data) setWatchlist(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchWatchlist();
  }, [currentUserId]);

  const remove = async (ticker, e) => {
    e.stopPropagation();
    await apiDelete(`/watchlist/remove/${ticker}?user_id=${currentUserId}`);
    fetchWatchlist();
  };

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
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {t("watchlist.title")}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Prices are 15-min delayed
          </span>
        </div>
        {watchlist.map((item) => {
          const name = getStockName(item.ticker, item.name, i18n.language);
          return (
            <div
              key={item.ticker}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: "1px solid #f5f5f7", cursor: "pointer",
              }}
              onClick={() => setTradeTicker(item.ticker)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {item.ticker} · {item.market}
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
                  onClick={(e) => remove(item.ticker, e)}
                  style={{ fontSize: 12, color: 'var(--negative)', border: "1px solid #fde8e8", padding: "4px 10px" }}
                >
                  {t("watchlist.remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => {
            setTradeTicker(null);
            fetchWatchlist();
          }}
        />
      )}
    </div>
  );
}

export default Watchlist;