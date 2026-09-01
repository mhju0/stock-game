import { useMemo } from 'react'
import {
  PortfolioAccessContext,
  createLegacyPortfolioAccess,
  createSessionPortfolioAccess,
} from './portfolioAccess'

export function SessionPortfolioScope({ userId, sessionId, children }) {
  const access = useMemo(
    () => createSessionPortfolioAccess(userId, sessionId),
    [userId, sessionId],
  )
  return (
    <PortfolioAccessContext.Provider value={access}>
      {children}
    </PortfolioAccessContext.Provider>
  )
}

export function LegacyPortfolioScope({ userId, children }) {
  const access = useMemo(
    () => createLegacyPortfolioAccess(userId),
    [userId],
  )
  return (
    <PortfolioAccessContext.Provider value={access}>
      {children}
    </PortfolioAccessContext.Provider>
  )
}
