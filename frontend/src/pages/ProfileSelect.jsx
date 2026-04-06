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
    const confirmMsg = i18n.language === 'ko'
      ? `"${gameName}" 게임을 삭제하시겠습니까?\n모든 보유 종목, 거래내역, 기록이 영구적으로 삭제됩니다.`
      : `Delete "${gameName}"?\nAll holdings, transactions, and history will be permanently erased.`
    if (!window.confirm(confirmMsg)) return;
    const data = await apiDelete(`/users/${gameId}`, setError);
    if (data) setGames(games.filter(g => g.id !== gameId));
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
  const isKo = i18n.language === 'ko';

  const glassStyle = {
    background: 'var(--glass)',
    backdropFilter: 'var(--blur-md)',
    WebkitBackdropFilter: 'var(--blur-md)',
    border: '1px solid var(--glass-border)',
    borderRadius: 20,
    overflow: 'hidden',
    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px', minHeight: '100vh', position: 'relative', zIndex: 1 }}>

      {/* ── HEADER ── */}
      <div style={{
        textAlign: 'center',
        paddingTop: 56,
        marginBottom: 36,
        animation: 'glass-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button className="lang-toggle" onClick={() => i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')}>
            {i18n.language === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>

        {/* Prismatic orb */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet), var(--prism-pink))',
          margin: '0 auto 20px',
          opacity: 0.8,
          boxShadow: '0 8px 40px rgba(96, 165, 250, 0.2), 0 0 80px rgba(167, 139, 250, 0.1)',
          animation: 'glass-scale-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
        }} />

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 800,
          marginBottom: 10,
          letterSpacing: -1,
          lineHeight: 1.2,
        }}>
          {t('common.appName')}
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 400,
          lineHeight: 1.5,
        }}>
          {isKo ? '나만의 투자 전략을 만들고 실력을 테스트해보세요' : 'Create strategies, test your skills, beat the market'}
        </p>

        <p style={{
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          marginTop: 10,
          fontWeight: 400,
        }}>
          {isKo
            ? '⏱ 시세는 15분 지연됩니다 · 가상 자금으로 실제 시장 데이터를 사용하는 모의투자 게임입니다'
            : '⏱ Prices are 15-min delayed · A virtual trading game using real market data with simulated funds'}
        </p>
      </div>

      {/* ── ACTIVE GAMES ── */}
      {activeGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            paddingLeft: 4,
            letterSpacing: 0.5,
          }}>
            {isKo ? '진행 중' : 'Active'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeGames.map((game, i) => (
              <div key={game.id}
                style={{
                  ...glassStyle,
                  padding: 0,
                  cursor: 'pointer',
                  animation: `glass-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${0.1 + i * 0.06}s both`,
                }}
                onClick={() => setCurrentUserId(game.id)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--glass-border-hover)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: -0.3,
                    }}>
                      {game.username}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      marginTop: 3,
                    }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{isKo ? '일' : 'd'}
                      {game.holdings_count > 0 && ` · ${game.holdings_count} ${isKo ? '종목' : 'stocks'}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'} style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 20,
                      fontWeight: 800,
                      letterSpacing: -0.5,
                    }}>
                      {game.return_pct >= 0 ? '+' : ''}{game.return_pct}%
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}>
                      {formatKRW(game.total_value_krw)}
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 16px',
                  background: 'var(--glass)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-display)',
                  borderTop: '1px solid var(--border-light)',
                }}>
                  <span>{Math.round(game.days_elapsed || 0)}{isKo ? '일차' : ' days in'}</span>
                  <span>{Math.round(game.days_remaining || 0)}{isKo ? '일 남음' : 'd left'}</span>
                  <button className="btn" onClick={(e) => handleDeleteGame(e, game.id, game.username)}
                    style={{ fontSize: 11, padding: '2px 8px', color: 'var(--negative)', border: 'none', background: 'transparent' }}>
                    {isKo ? '삭제' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FINISHED GAMES ── */}
      {finishedGames.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            paddingLeft: 4,
          }}>
            {isKo ? '종료된 게임' : 'Finished'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {finishedGames.map(game => (
              <div key={game.id}
                style={{ ...glassStyle, padding: 0, cursor: 'pointer', opacity: 0.65 }}
                onClick={() => setCurrentUserId(game.id)}>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{game.username}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{isKo ? '일' : 'd'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'}
                      style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
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

      {/* ── EMPTY STATE ── */}
      {!loading && games.length === 0 && !showCreate && (
        <div style={{
          ...glassStyle,
          textAlign: 'center',
          padding: 40,
          marginBottom: 24,
          animation: 'glass-scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        }}>
          {/* Animated gradient orb */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet))',
            margin: '0 auto 16px',
            opacity: 0.6,
            boxShadow: '0 4px 24px rgba(96, 165, 250, 0.15)',
          }} />
          <p style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            marginBottom: 16,
          }}>
            {isKo ? '첫 번째 투자 전략을 만들어보세요' : 'Create your first investment strategy'}
          </p>
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>{t('common.loading')}</p>}

      {/* ── NEW GAME BUTTON / FORM ── */}
      {!showCreate ? (
        <button className="btn btn-primary"
          style={{
            width: '100%',
            padding: '15px',
            fontSize: 15,
            borderRadius: 16,
            animation: 'glass-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both',
          }}
          onClick={() => setShowCreate(true)}>
          + {isKo ? '새 게임 만들기' : 'New Game'}
        </button>
      ) : (
        <div style={{
          ...glassStyle,
          padding: 24,
          animation: 'glass-scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}>
          <div className="card-title" style={{ fontFamily: 'var(--font-display)' }}>
            {isKo ? '새 게임' : 'New Game'}
          </div>
          <form onSubmit={handleCreateGame} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontWeight: 500,
              }}>
                {isKo ? '전략 이름' : 'Strategy Name'}
              </label>
              <input
                className="input"
                placeholder={isKo ? '공격형, 테크 위주, 배당주...' : 'Aggressive, Tech Only, Dividends...'}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>

            <div>
              <label style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontWeight: 500,
              }}>
                {isKo ? '시작 자금' : 'Starting Balance'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { key: 'KRW', label: 'KRW' },
                  { key: 'USD', label: 'USD' },
                ].map(opt => (
                  <button key={opt.key} type="button" className="btn"
                    onClick={() => setStartingCurrency(opt.key)}
                    style={{
                      fontSize: 13, padding: '8px 16px',
                      background: startingCurrency === opt.key
                        ? 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet))'
                        : 'var(--glass)',
                      color: startingCurrency === opt.key ? 'white' : 'var(--text-primary)',
                      border: startingCurrency === opt.key ? 'none' : '1px solid var(--glass-border)',
                    }}>
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
                        background: startingBalanceKrw === v
                          ? 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet))'
                          : 'var(--glass)',
                        color: startingBalanceKrw === v ? 'white' : 'var(--text-primary)',
                        border: startingBalanceKrw === v ? 'none' : '1px solid var(--glass-border)',
                      }}>{formatBalance(v)}</button>
                    ))}
                  </div>
                  <input className="input" type="number" min="0" step="100000"
                    value={startingBalanceKrw} onChange={(e) => setStartingBalanceKrw(parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'center' }} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[5000, 10000, 50000, 100000].map(v => (
                      <button key={v} type="button" className="btn" onClick={() => setStartingBalanceUsd(v)} style={{
                        fontSize: 13, padding: '8px 14px',
                        background: startingBalanceUsd === v
                          ? 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet))'
                          : 'var(--glass)',
                        color: startingBalanceUsd === v ? 'white' : 'var(--text-primary)',
                        border: startingBalanceUsd === v ? 'none' : '1px solid var(--glass-border)',
                      }}>{formatUSD(v)}</button>
                    ))}
                  </div>
                  <input className="input" type="number" min="0" step="10"
                    value={startingBalanceUsd} onChange={(e) => setStartingBalanceUsd(parseFloat(e.target.value) || 0)}
                    style={{ textAlign: 'center' }} />
                </>
              )}
            </div>

            <div>
              <label style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontWeight: 500,
              }}>
                {isKo ? '기간' : 'Duration'}
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
                    background: duration === v.days
                      ? 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet))'
                      : 'var(--glass)',
                    color: duration === v.days ? 'white' : 'var(--text-primary)',
                    border: duration === v.days ? 'none' : '1px solid var(--glass-border)',
                  }}>{isKo ? v.ko : v.en}</button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: 'var(--glass)',
              backdropFilter: 'var(--blur-sm)',
              WebkitBackdropFilter: 'var(--blur-sm)',
              borderRadius: 14,
              padding: 16,
              fontSize: 14,
              fontFamily: 'var(--font-display)',
              border: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{isKo ? '시작 자금' : 'Balance'}</span>
                <span style={{ fontWeight: 700 }}>
                  {startingCurrency === 'KRW' ? formatKRW(startingBalanceKrw) : formatUSD(startingBalanceUsd)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{isKo ? '기간' : 'Duration'}</span>
                <span style={{ fontWeight: 700 }}>
                  {duration}{isKo ? (duration === 1 ? '일 (24시간)' : '일') : (duration === 1 ? ' day (24h)' : ' days')}
                </span>
              </div>
            </div>

            {error && <p style={{ color: 'var(--negative)', fontSize: 13, fontFamily: 'var(--font-display)' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, borderRadius: 14 }} disabled={!gameName.trim()}>
                {isKo ? '시작하기' : 'Start Game'}
              </button>
              <button type="button" className="btn" style={{ borderRadius: 14 }}
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
