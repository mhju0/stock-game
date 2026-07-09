export function getSessionIdFromPath(pathname) {
  const match = pathname.match(/^\/games\/([^/]+)/)
  if (!match || match[1] === 'new') return null
  return decodeURIComponent(match[1])
}

export function gamePath(sessionId, section = 'status') {
  if (!sessionId) return '/games'
  const base = `/games/${sessionId}`
  if (section === 'status') return base
  return `${base}/${section}`
}

export function sessionStatusLabelKey(session) {
  if (session?.status === 'active' && !session?.is_expired) return 'games.statusActive'
  if (session?.status === 'completed') return 'games.statusCompleted'
  if (session?.status === 'archived') return 'games.statusArchived'
  return 'games.statusExpired'
}

export function isSessionEnded(session) {
  return Boolean(
    session?.is_expired ||
    ['completed', 'expired', 'archived'].includes(session?.status)
  )
}
