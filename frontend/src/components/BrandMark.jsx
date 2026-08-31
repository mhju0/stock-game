function BrandMark({ className = 'auth-brand-mark' }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M21 7v5M16 7h5" />
      </svg>
    </span>
  )
}

export default BrandMark
