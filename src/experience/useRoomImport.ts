import { useCallback, useEffect, useRef, useState } from 'react'
import { loadRoomFile } from '../room/importRoom'
import type { LoadedRoom, NormalizedRoom } from '../room/types'

type CurrentRoom = NormalizedRoom & { loaded: LoadedRoom }

/** Keep the committed room alive until a replacement has passed setup. */
export function useRoomImport(loader: (file: File) => Promise<LoadedRoom> = loadRoomFile) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<LoadedRoom | null>(null)
  const [current, setCurrent] = useState<CurrentRoom | null>(null)
  const request = useRef(0)
  const candidateRef = useRef<LoadedRoom | null>(null)
  const currentRef = useRef<CurrentRoom | null>(null)

  const cancel = useCallback(() => {
    request.current++
    candidateRef.current?.dispose()
    candidateRef.current = null
    setCandidate(null)
    setLoading(false)
    setError(null)
  }, [])

  const load = useCallback(async (file: File) => {
    cancel()
    const ticket = request.current
    setLoading(true)
    try {
      const next = await loader(file)
      if (ticket !== request.current) { next.dispose(); return }
      candidateRef.current = next
      setCandidate(next)
    } catch (cause) {
      if (ticket === request.current) setError(cause instanceof Error ? cause.message : 'Could not read this GLB. Select another room file.')
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }, [cancel, loader])

  const commit = useCallback((normalized: NormalizedRoom) => {
    const loaded = candidateRef.current
    if (!loaded) return
    currentRef.current?.loaded.dispose()
    const next = { ...normalized, loaded }
    currentRef.current = next
    candidateRef.current = null
    setCurrent(next)
    setCandidate(null)
  }, [])

  const backToDemo = useCallback(() => {
    cancel()
    currentRef.current?.loaded.dispose()
    currentRef.current = null
    setCurrent(null)
  }, [cancel])

  useEffect(() => () => {
    request.current++
    candidateRef.current?.dispose()
    currentRef.current?.loaded.dispose()
    candidateRef.current = null
    currentRef.current = null
  }, [])

  return { loading, error, candidate, current, load, cancel, commit, backToDemo }
}
