import { useEffect, useId, useRef, useState } from 'react'

/** Mount a fresh control for each reply so playback never outlives its text. */
export function ReadAloud({ text }: { text: string }) {
  const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const supported = Boolean(synthesis && typeof window.SpeechSynthesisUtterance === 'function')
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusId = useId()

  useEffect(() => () => {
    const utterance = utteranceRef.current
    if (!utterance) return
    utteranceRef.current = null
    utterance.onend = null
    utterance.onerror = null
    synthesis?.cancel()
  }, [synthesis])

  function toggleReading() {
    if (!supported || !synthesis) return
    if (utteranceRef.current) {
      const utterance = utteranceRef.current
      utteranceRef.current = null
      utterance.onend = null
      utterance.onerror = null
      synthesis.cancel()
      setReading(false)
      return
    }

    setError(null)
    try {
      synthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text.trim())
      utterance.lang = document.documentElement.lang || navigator.language
      utteranceRef.current = utterance
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return
        utteranceRef.current = null
        setReading(false)
      }
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return
        utteranceRef.current = null
        setReading(false)
        setError("Couldn't read this response aloud. Please try again.")
      }
      setReading(true)
      synthesis.speak(utterance)
    } catch {
      utteranceRef.current = null
      setReading(false)
      setError("Couldn't read this response aloud. Please try again.")
    }
  }

  return (
    <div className="reply-audio">
      <button
        type="button"
        className="read-aloud"
        disabled={!supported}
        onClick={toggleReading}
        aria-describedby={!supported || error ? statusId : undefined}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {reading ? <rect x="5" y="5" width="14" height="14" rx="2" /> : <>
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
          </>}
        </svg>
        {reading ? 'Stop reading' : 'Read aloud'}
      </button>
      {!supported && <p id={statusId} className="speech-note">Read aloud is not supported in this browser.</p>}
      {error && <p id={statusId} className="error" role="status">{error}</p>}
    </div>
  )
}
