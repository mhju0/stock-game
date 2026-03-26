import { apiFetch, apiPost, apiDelete } from '../api'
import { useState, useEffect, useContext } from 'react';
import { UserContext } from '../context/UserContext';
import { useTranslation } from 'react-i18next';

function ProfileSelect() {
  const { t, i18n } = useTranslation();
  const { setCurrentUserId } = useContext(UserContext);
  
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // New game form state
  const [gameName, setGameName] = useState('');
  const [startingCurrency, setStartingCurrency] = useState('KRW');
  const [startingBalanceKrw, setStartingBalanceKrw] = useState(10000000);
  const [startingBalanceUsd, setStartingBalanceUsd] = useState(10000);
  const [duration, setDuration] = useState(90);

  const fetchGames = async () => {
    setLoading(true);
    const data = await apiFetch('/users', {}, (err) => {
      setError(err);
      setLoading(false);
    });
    if (data) {
      setGames(data);
      setLoading(false);
    }
  };

  useEffect(() => { fetchGames(); }, []);

  const handleCreateGame = async (e) => {
    e.preventDefault();
    if (!gameName.trim()) return;
    
    setError('');
    const data = await apiPost('/users/new', {
      name: gameName.trim(),
      starting_currency: startingCurrency,
      starting_balance_krw: startingCurrency === 'KRW' ? startingBalanceKrw : 0,
      starting_balance_usd: startingCurrency === 'USD' ? startingBalanceUsd : 0,
      duration_days: duration,
    }, setError);
    
    if (data && !data.error) {
      setCurrentUserId(data.id);
    } else if (data?.error) {
      setError(data.error);
    }
  };

  const handleDeleteGame = async (e, gameId, gameName) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${gameName}"?\nAll holdings, transactions, and history will be permanently erased.`)) {
      return;
    }
    const data = await apiDelete(`/users/${gameId}`, setError);
    if (data) {
      setGames(games.filter(g => g.id !== gameId));
    }
  };

  const formatKRW = (v) => `₩${Math.round(v).toLocaleString()}`;
  const formatUSD = (v) => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const formatBalance = (v) => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(0)}억원`;
    if (v >= 10000) return `${(v / 10000).toLocaleString()}만원`;
    return `${v.toLocaleString()}원`;
  };

  const activeGames = games.filter(g => !g.is_expired);
  const finishedGames = games.filter(g => g.is_expired);

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="lang-toggle" onClick={() => i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')}>
            {i18n.language === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          {t('common.appName')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          {i18n.language === 'ko' ? '나만의 투자 전략을 만들고 실력을 테스트해보세요' : 'Create strategies, test your skills, beat the market'}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          {i18n.language === 'ko'
            ? '⏱ 시세는 15분 지연됩니다 · 가상 자금으로 실제 시장 데이터를 사용하는 모의투자 게임입니다'
            : '⏱ Prices are 15-min delayed · A virtual trading game using real market data with simulated funds'}
        </p>
      </div>

      {/* Active Games */}
      {activeGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 4 }}>
            {i18n.language === 'ko' ? '진행 중' : 'Active'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeGames.map(game => (
              <div key={game.id} className="card" style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }}
                onClick={() => setCurrentUserId(game.id)}>
                <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{game.username}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{i18n.language === 'ko' ? '일' : 'd'}
                      {game.holdings_count > 0 && ` · ${game.holdings_count} ${i18n.language === 'ko' ? '종목' : 'stocks'}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 18, fontWeight: 700 }}>
                      {game.return_pct >= 0 ? '+' : ''}{game.return_pct}%
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatKRW(game.total_value_krw)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>{Math.round(game.days_elapsed || 0)}{i18n.language === 'ko' ? '일차' : ' days in'}</span>
                  <span>{Math.round(game.days_remaining || 0)}{i18n.language === 'ko' ? '일 남음' : 'd left'}</span>
                  <button className="btn" onClick={(e) => handleDeleteGame(e, game.id, game.username)}
                    style={{ fontSize: 11, padding: '2px 8px', color: 'var(--negative)', border: 'none', background: 'transparent' }}>
                    {i18n.language === 'ko' ? '삭제' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finished Games */}
      {finishedGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 4 }}>
            {i18n.language === 'ko' ? '종료된 게임' : 'Finished'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {finishedGames.map(game => (
              <div key={game.id} className="card" style={{ padding: 0, cursor: 'pointer', overflow: 'hidden', opacity: 0.75 }}
                onClick={() => setCurrentUserId(game.id)}>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{game.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{i18n.language === 'ko' ? '일' : 'd'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 16, fontWeight: 700 }}>
                      {game.return_pct >= 0 ? '+' : ''}{game.return_pct}%
                    </div>
                    <button className="btn" onClick={(e) => handleDeleteGame(e, game.id, game.username)}
                      style={{ fontSize: 11, padding: '2px 8px', color: 'var(--negative)', border: 'none', background: 'transparent' }}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && games.length === 0 && !showCreate && (
        <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📈</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 16 }}>
            {i18n.language === 'ko' ? '첫 번째 투자 전략을 만들어보세요' : 'Create your first investment strategy'}
          </p>
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{t('common.loading')}</p>}

      {/* New Game Button / Form */}
      {!showCreate ? (
        <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 15 }}
          onClick={() => setShowCreate(true)}>
          + {i18n.language === 'ko' ? '새 게임 만들기' : 'New Game'}
        </button>
      ) : (
        <div className="card">
          <div className="card-title">{i18n.language === 'ko' ? '새 게임' : 'New Game'}</div>
          <form onSubmit={handleCreateGame} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                {i18n.language === 'ko' ? '전략 이름' : 'Strategy Name'}
              </label>
              <input
                className="input"
                placeholder={i18n.language === 'ko' ? '공격형, 테크 위주, 배당주...' : 'Aggressive, Tech Only, Dividends...'}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                {i18n.language === 'ko' ? '시작 자금' : 'Starting Balance'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { key: 'KRW', label: 'KRW' },
                  { key: 'USD', label: 'USD' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    className="btn"
                    onClick={() => setStartingCurrency(opt.key)}
                    style={{
                      fontSize: 13,
                      padding: '8px 14px',
                      background: startingCurrency === opt.key ? 'var(--accent)' : 'transparent',
                      color: startingCurrency === opt.key ? 'white' : 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {startingCurrency === 'KRW' ? (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[5000000, 10000000, 50000000, 100000000].map(v => (
                      <button key={v} type="button" className="btn" onClick={() => setStartingBalanceKrw(v)} style={{
                        fontSize: 13, padding: '8px 14px',
                        background: startingBalanceKrw === v ? 'var(--accent)' : 'transparent',
                        color: startingBalanceKrw === v ? 'white' : 'var(--text-primary)',
                        border: '1px solid var(--border)',
                      }}>{formatBalance(v)}</button>
                    ))}
                  </div>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="100000"
                    value={startingBalanceKrw}
                    onChange={(e) => setStartingBalanceKrw(parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'center' }}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[5000, 10000, 50000, 100000].map(v => (
                      <button key={v} type="button" className="btn" onClick={() => setStartingBalanceUsd(v)} style={{
                        fontSize: 13, padding: '8px 14px',
                        background: startingBalanceUsd === v ? 'var(--accent)' : 'transparent',
                        color: startingBalanceUsd === v ? 'white' : 'var(--text-primary)',
                        border: '1px solid var(--border)',
                      }}>{formatUSD(v)}</button>
                    ))}
                  </div>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="10"
                    value={startingBalanceUsd}
                    onChange={(e) => setStartingBalanceUsd(parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'center' }}
                  />
                </>
              )}
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                {i18n.language === 'ko' ? '기간' : 'Duration'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { days: 1, ko: '1일 (24h)', en: '1 Day (24h)' },
                  { days: 7, ko: '1주', en: '1 Week' },
                  { days: 30, ko: '1개월', en: '1 Month' },
                  { days: 90, ko: '3개월', en: '3 Months' },
                  { days: 180, ko: '6개월', en: '6 Months' },
                  { days: 365, ko: '1년', en: '1 Year' },
                ].map(v => (
                  <button key={v.days} type="button" className="btn" onClick={() => setDuration(v.days)} style={{
                    fontSize: 13, padding: '8px 14px',
                    background: duration === v.days ? 'var(--accent)' : 'transparent',
                    color: duration === v.days ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}>{i18n.language === 'ko' ? v.ko : v.en}</button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{i18n.language === 'ko' ? '시작 자금' : 'Balance'}</span>
                <span style={{ fontWeight: 600 }}>
                  {startingCurrency === 'KRW' ? formatKRW(startingBalanceKrw) : formatUSD(startingBalanceUsd)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{i18n.language === 'ko' ? '기간' : 'Duration'}</span>
                <span style={{ fontWeight: 600 }}>
                  {duration}
                  {i18n.language === 'ko'
                    ? (duration === 1 ? '일 (24시간)' : '일')
                    : (duration === 1 ? ' day (24h)' : ' days')}
                </span>
              </div>
            </div>

            {error && <p style={{ color: 'var(--negative)', fontSize: 13 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!gameName.trim()}>
                {i18n.language === 'ko' ? '시작하기' : 'Start Game'}
              </button>
              <button type="button" className="btn" style={{ border: '1px solid var(--border)' }}
                onClick={() => { setShowCreate(false); setError(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default ProfileSelect;
