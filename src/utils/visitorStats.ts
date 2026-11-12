const VISITOR_STATS_SRC = 'https://events.vercount.one/js'

export function loadVisitorStats(): () => void {
  if (!navigator.onLine) return () => {}

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${VISITOR_STATS_SRC}"]`)
  if (existing) return () => {}

  const script = document.createElement('script')
  script.src = VISITOR_STATS_SRC
  script.defer = true
  document.head.appendChild(script)

  return () => {
    script.parentNode?.removeChild(script)
  }
}
