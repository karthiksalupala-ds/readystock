import { useCallback, useEffect, useState } from 'react'

export function usePlaySession() {
  const [active, setActive] = useState(false)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const exit = useCallback(() => { setActive(false); setReady(false); setPaused(false) }, [])
  const start = useCallback(() => { setReady(false); setPaused(false); setActive(true) }, [])
  const markReady = useCallback(() => setReady(true), [])
  const resume = useCallback(() => setPaused(false), [])
  const reset = useCallback(() => setResetToken(value => value + 1), [])

  useEffect(() => {
    if (!active) return
    const blur = () => setPaused(true)
    const visibility = () => { if (document.hidden) blur() }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) exit()
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', keydown)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', keydown)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [active, exit])

  return { active, ready, paused, resetToken, start, markReady, resume, reset, exit }
}
