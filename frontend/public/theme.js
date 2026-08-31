(() => {
  try {
    document.documentElement.dataset.theme = localStorage.getItem('stockGameTheme') === 'light'
      ? 'light'
      : 'dark'
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
