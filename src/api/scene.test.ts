import { afterEach, describe, expect, it, vi } from 'vitest'
import { askScene, ingestScene, reconstructScene } from './scene'
import { sampleGraph } from '../test/sampleGraph'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('scene API client', () => {
  it('posts ingest to /scene/ingest', async () => {
    const fetchMock = mockFetch(sampleGraph)
    await expect(ingestScene()).resolves.toEqual(sampleGraph)
    expect(fetchMock).toHaveBeenCalledWith(
      '/scene/ingest',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
  })

  it('posts reconstruct and ask with the live graph', async () => {
    const result = { graph: sampleGraph, analysisSteps: [{ from: 'Unknown object', to: 'Table' }] }
    const fetchMock = mockFetch(result)
    await reconstructScene(sampleGraph)
    expect(fetchMock).toHaveBeenCalledWith(
      '/scene/reconstruct',
      expect.objectContaining({
        body: JSON.stringify({ graph: sampleGraph }),
      }),
    )

    mockFetch({ reply: '4 chairs', highlightIds: ['chair-1'] })
    await expect(askScene(sampleGraph, 'Show me all the chairs.')).resolves.toEqual({
      reply: '4 chairs',
      highlightIds: ['chair-1'],
    })
  })

  it('throws when the backend returns an error', async () => {
    mockFetch('nope', false, 500)
    await expect(ingestScene()).rejects.toThrow(/nope/)
  })
})
