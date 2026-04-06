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
    const confirmMsg = i18n.language === 'ko'
      ? `"${gameName}" 게임을 삭제하시겠습니까?\n모든 보유 종목, 거래내역, 기록이 영구적으로 삭제됩니다.`
      : `Delete "${gameName}"?\nAll holdings, transactions, and history will be permanently erased.`
    if (!window.confirm(confirmMsg)) {
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

  const isKo = i18n.language === 'ko';

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '40px 20px', minHeight: '100vh' }}>

      {/* ═══ BASQUIAT HEADER ═══ */}
      <div style={{ textAlign: 'center', marginBottom: 40, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="lang-toggle" onClick={() => i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')}>
            {i18n.language === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>

        {/* Crown */}
        <div style={{
          fontFamily: 'var(--font-marker)',
          fontSize: 48,
          color: 'var(--crown-yellow)',
          marginBottom: 4,
          textShadow: '3px 3px 0px var(--basquiat-red)',
          animation: 'crown-pulse 3s ease-in-out infinite',
          letterSpacing: 8,
        }}>
          ♔
        </div>

        <h1 style={{
          fontFamily: 'var(--font-marker)',
          fontSize: 32,
          fontWeight: 700,
          marginBottom: 8,
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: 4,
          position: 'relative',
          display: 'inline-block',
        }}>
          {t('common.appName')}
        </h1>

        {/* Crossed-out decorative word */}
        <div style={{
          fontFamily: 'var(--font-hand)',
          fontSize: 14,
          color: 'var(--text-secondary)',
          textDecoration: 'line-through',
          textDecorationColor: 'var(--basquiat-red)',
          textDecorationThickness: 2,
          opacity: 0.4,
          marginBottom: 12,
          letterSpacing: 6,
        }}>
          WALL STREET
        </div>

        <p style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-hand)',
          fontSize: 20,
          lineHeight: 1.4,
        }}>
          {isKo ? '나만의 투자 전략을 만들고 실력을 테스트해보세요' : 'Create strategies, test your skills, beat the market'}
        </p>

        <p style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          marginTop: 12,
          opacity: 0.5,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          {isKo
            ? '⏱ 시세는 15분 지연됩니다 · 모의투자 게임'
            : '⏱ 15-min delayed · virtual trading game'}
        </p>

        {/* Decorative marks */}
        <div style={{
          position: 'absolute',
          top: 80,
          left: 0,
          fontFamily: 'var(--font-marker)',
          fontSize: 10,
          color: 'var(--basquiat-red)',
          opacity: 0.15,
          transform: 'rotate(-90deg)',
          transformOrigin: 'top left',
          letterSpacing: 4,
        }}>
          ©1982
        </div>
      </div>

      {/* ═══ ACTIVE GAMES ═══ */}
      {activeGames.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--crown-yellow)',
            marginBottom: 10,
            paddingLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}>
            {isKo ? '♔ 진행 중' : '♔ ACTIVE'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeGames.map((game, i) => (
              <div key={game.id} className="card"
                style={{
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  borderLeft: '5px solid var(--crown-yellow)',
                  animationDelay: `${i * 0.08}s`,
                }}
                onClick={() => setCurrentUserId(game.id)}>
                <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-marker)',
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}>
                      {game.username}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      marginTop: 4,
                      letterSpacing: 0.5,
                    }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{isKo ? '일' : 'd'}
                      {game.holdings_count > 0 && ` · ${game.holdings_count} ${isKo ? '종목' : 'stocks'}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'} style={{
                      fontFamily: 'var(--font-marker)',
                      fontSize: 22,
                      fontWeight: 700,
                    }}>
                      {game.return_pct >= 0 ? '+' : ''}{game.return_pct}%
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
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
                  background: 'var(--bg-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  borderTop: '1px dashed var(--border)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}>
                  <span>{Math.round(game.days_elapsed || 0)}{isKo ? '일차' : ' days in'}</span>
                  <span>{Math.round(game.days_remaining || 0)}{isKo ? '일 남음' : 'd left'}</span>
                  <button className="btn" onClick={(e) => handleDeleteGame(e, game.id, game.username)}
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      color: 'var(--negative)',
                      border: 'none',
                      background: 'transparent',
                      fontFamily: 'var(--font-mono)',
                    }}>
                    {isKo ? '삭제' : 'DELETE'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FINISHED GAMES ═══ */}
      {finishedGames.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            paddingLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 4,
            textDecoration: 'line-through',
            textDecorationColor: 'var(--basquiat-red)',
          }}>
            {isKo ? '종료된 게임' : 'FINISHED'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {finishedGames.map(game => (
              <div key={game.id} className="card"
                style={{
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  opacity: 0.6,
                  borderLeft: '5px solid var(--border)',
                }}
                onClick={() => setCurrentUserId(game.id)}>
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-marker)',
                      fontSize: 15,
                      fontWeight: 600,
                    }}>
                      {game.username}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}>
                      {formatBalance(game.starting_balance_krw)} · {game.duration_days}{isKo ? '일' : 'd'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className={game.return_pct >= 0 ? 'positive' : 'negative'}
                      style={{ fontFamily: 'var(--font-marker)', fontSize: 16, fontWeight: 700 }}>
                      {game.return_pct >= 0 ? '+' : ''}{game.return_pct}%
                    </div>
                    <button className="btn" onClick={(e) => handleDeleteGame(e, game.id, game.username)}
                      style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        color: 'var(--negative)',
                        border: 'none',
                        background: 'transparent',
                      }}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EMPTY STATE ═══ */}
      {!loading && games.length === 0 && !showCreate && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-marker)',
            fontSize: 48,
            marginBottom: 8,
            color: 'var(--crown-yellow)',
          }}>♔</div>
          <p style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-hand)',
            fontSize: 20,
            marginBottom: 16,
          }}>
            {isKo ? '첫 번째 투자 전략을 만들어보세요' : 'Create your first investment strategy'}
          </p>
        </div>
      )}

      {loading && <p style={{
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: 3,
        textTransform: 'uppercase',
      }}>{t('common.loading')}</p>}

      {/* ═══ NEW GAME BUTTON / FORM ═══ */}
      {!showCreate ? (
        <button className="btn btn-primary"
          style={{
            width: '100%',
            padding: '16px',
            fontSize: 17,
            position: 'relative',
          }}
          onClick={() => setShowCreate(true)}>
          + {isKo ? '새 게임 만들기' : 'NEW GAME'}
        </button>
      ) : (
        <div className="card" style={{ borderLeft: '5px solid var(--crown-yellow)' }}>
          <div className="card-title">
            {isKo ? '새 게임' : 'NEW GAME'}
          </div>
          <form onSubmit={handleCreateGame} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 3,
              }}>
                {isKo ? '전략 이름' : 'STRATEGY NAME'}
              </label>
              <input
                className="input"
                placeholder={isKo ? '공격형, 테크 위주, 배당주...' : 'Aggressive, Tech Only, Dividends...'}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                maxLength={20}
                autoFocus
                style={{ fontFamily: 'var(--font-hand)', fontSize: 20, fontWeight: 600 }}
              />
            </div>

            <div>
              <label style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 3,
              }}>
                {isKo ? '시작 자금' : 'STARTING BALANCE'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  { key: 'KRW', label: 'KRW ₩' },
                  { key: 'USD', label: 'USD $' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    className="btn"
                    onClick={() => setStartingCurrency(opt.key)}
                    style={{
                      fontSize: 12,
                      padding: '8px 16px',
                      background: startingCurrency === opt.key ? 'var(--crown-yellow)' : 'transparent',
                      color: startingCurrency === opt.key ? '#0d0d0d' : 'var(--text-primary)',
                      border: `2px solid ${startingCurrency === opt.key ? 'var(--crown-yellow)' : 'var(--border)'}`,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {startingCurrency === 'KRW' ? (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[5000000, 10000000, 50000000, 100000000].map(v => (
                      <button key={v} type="button" className="btn" onClick={() => setStartingBalanceKrw(v)} style={{
                        fontSize: 12, padding: '8px 14px',
                        background: startingBalanceKrw === v ? 'var(--crown-yellow)' : 'transparent',
                        color: startingBalanceKrw === v ? '#0d0d0d' : 'var(--text-primary)',
                        border: `2px solid ${startingBalanceKrw === v ? 'var(--crown-yellow)' : 'var(--border)'}`,
                        fontFamily: 'var(--font-mono)',
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[5000, 10000, 50000, 100000].map(v => (
                      <button key={v} type="button" className="btn" onClick={() => setStartingBalanceUsd(v)} style={{
                        fontSize: 12, padding: '8px 14px',
                        background: startingBalanceUsd === v ? 'var(--crown-yellow)' : 'transparent',
                        color: startingBalanceUsd === v ? '#0d0d0d' : 'var(--text-primary)',
                        border: `2px solid ${startingBalanceUsd === v ? 'var(--crown-yellow)' : 'var(--border)'}`,
                        fontFamily: 'var(--font-mono)',
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
              <label style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 3,
              }}>
                {isKo ? '기간' : 'DURATION'}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { days: 1, ko: '1일', en: '1D' },
                  { days: 7, ko: '1주', en: '1W' },
                  { days: 30, ko: '1개월', en: '1M' },
                  { days: 90, ko: '3개월', en: '3M' },
                  { days: 180, ko: '6개월', en: '6M' },
                  { days: 365, ko: '1년', en: '1Y' },
                ].map(v => (
                  <button key={v.days} type="button" className="btn" onClick={() => setDuration(v.days)} style={{
                    fontSize: 12, padding: '8px 14px',
                    background: duration === v.days ? 'var(--crown-yellow)' : 'transparent',
                    color: duration === v.days ? '#0d0d0d' : 'var(--text-primary)',
                    border: `2px solid ${duration === v.days ? 'var(--crown-yellow)' : 'var(--border)'}`,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                  }}>{isKo ? v.ko : v.en}</button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: 'var(--bg-secondary)',
              border: '2px solid var(--border)',
              padding: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 }}>
                  {isKo ? '시작 자금' : 'Balance'}
                </span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-marker)', fontSize: 16 }}>
                  {startingCurrency === 'KRW' ? formatKRW(startingBalanceKrw) : formatUSD(startingBalanceUsd)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 }}>
                  {isKo ? '기간' : 'Duration'}
                </span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-marker)', fontSize: 16 }}>
                  {duration}{isKo ? (duration === 1 ? '일' : '일') : (duration === 1 ? ' day' : ' days')}
                </span>
              </div>
            </div>

            {error && <p style={{ color: 'var(--negative)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!gameName.trim()}>
                {isKo ? '시작하기' : 'START GAME'}
              </button>
              <button type="button" className="btn" style={{ border: '2px solid var(--border)' }}
                onClick={() => { setShowCreate(false); setError(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ BASQUIAT FOOTER MARK ═══ */}
      <div style={{
        textAlign: 'center',
        marginTop: 48,
        paddingBottom: 24,
      }}>
        <div style={{
          fontFamily: 'var(--font-marker)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          opacity: 0.25,
          letterSpacing: 6,
        }}>
          SAMO© IS DEAD
        </div>
      </div>
    </div>
  );
}

export default ProfileSelect;
