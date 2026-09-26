import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hud } from './Hud'
import { sampleGraph } from '../test/sampleGraph'
import { PRESETS } from '../settings/graphics'
import type { ComponentProps } from 'react'

function renderHud(overrides: Partial<ComponentProps<typeof Hud>> = {}) {
  const props: ComponentProps<typeof Hud> = {
    mode: 'raw',
    graph: sampleGraph,
    scanProgress: 1,
    query: '',
    reply: null,
    error: null,
    editing: false,
    highlightedIds: [],
    settings: PRESETS.high,
    analysisSteps: [
      { from: 'Unknown object', to: 'Table' },
      { from: 'Unknown opening', to: 'Door' },
    ],
    visibleStepCount: 1,
    onToggleEdit: vi.fn(),
    onQueryChange: vi.fn(),
    onAsk: vi.fn((event) => event.preventDefault()),
    onAskSuggestion: vi.fn(),
    onReconstruct: vi.fn(),
    onSkipScan: vi.fn(),
    onSelectObject: vi.fn(),
    onSettingsChange: vi.fn(),
    ...overrides,
  }
  return { user: userEvent.setup(), props, ...render(<Hud {...props} />) }
}

describe('Hud', () => {
  it('keeps reconstruct available and ask locked in the raw scan', () => {
    renderHud()
    expect(screen.getByRole('button', { name: /AI Reconstruct/ })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: /ask the spatial assistant/i })).toBeDisabled()
    expect(screen.getByText('Raw mesh')).toBeInTheDocument()
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0)
  })

  it('unlocks ask and hides reconstruct in the semantic twin', async () => {
    const { user, props } = renderHud({ mode: 'twin', query: 'Show me all the chairs.' })
    expect(screen.queryByRole('button', { name: /AI Reconstruct/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /ask the spatial assistant/i })).toBeEnabled()
    expect(screen.getByText('table')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show me all the chairs.' }))
    expect(props.onAskSuggestion).toHaveBeenCalledWith('Show me all the chairs.')
  })

  it('shows analysis steps while reconstructing and disables edit', () => {
    renderHud({ mode: 'analysing' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Table')
    expect(status).not.toHaveTextContent('Door')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  })

  it('turns on the furniture-drag affordance from the edit toggle', async () => {
    const { user, props, rerender } = renderHud()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(props.onToggleEdit).toHaveBeenCalledTimes(1)

    rerender(<Hud {...props} editing />)
    expect(screen.getByRole('button', { name: 'Editing' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/drag tables, chairs, and equipment/i)).toBeInTheDocument()
  })

  it('surfaces backend errors in the ask bar', () => {
    renderHud({ error: 'Backend unavailable. Start the API on port 8000.' })
    expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument()
  })

  it('reports sweep progress instead of the reconstruct CTA while capturing', () => {
    renderHud({ scanProgress: 0.02 })
    expect(screen.queryByRole('button', { name: /AI Reconstruct/ })).not.toBeInTheDocument()
    expect(screen.getByText('Demo playback')).toBeInTheDocument()

    const meter = screen.getByRole('progressbar', { name: /demo playback/i })
    expect(meter).toHaveAttribute('aria-valuenow', '2')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
  })

  it('lists objects only once the sweep has found them', () => {
    const { rerender, props } = renderHud({ scanProgress: 0.02 })
    expect(screen.getByText('Unknown object')).toBeInTheDocument()
    expect(screen.queryByText('Unknown opening')).not.toBeInTheDocument()

    rerender(<Hud {...props} scanProgress={1} />)
    expect(screen.getByText('Unknown opening')).toBeInTheDocument()
  })

  it('names nothing before reconstruct, whatever the scan already knows', () => {
    const { rerender, props } = renderHud({ graph: { ...sampleGraph, source: 'simulated' } })
    expect(screen.queryByText('Conference table')).not.toBeInTheDocument()
    expect(screen.getByText('Unknown object')).toBeInTheDocument()
    expect(screen.getByText('Unknown opening')).toBeInTheDocument()

    rerender(<Hud {...props} mode="twin" />)
    expect(screen.getByText('Conference table')).toBeInTheDocument()
    expect(screen.queryByText('Unknown object')).not.toBeInTheDocument()
  })

  it('never presents a simulated scan as an iPhone capture', () => {
    renderHud({ mode: 'twin', graph: { ...sampleGraph, source: 'simulated' } })
    expect(screen.getByText('Simulated LiDAR · no device')).toBeInTheDocument()
    expect(screen.getByText('Simulated scan · no device')).toBeInTheDocument()
    expect(screen.queryByText(/iPhone LiDAR/)).not.toBeInTheDocument()
  })

  it('credits a device capture to the device', () => {
    renderHud({ mode: 'twin', graph: { ...sampleGraph, source: 'roomplan' } })
    expect(screen.getAllByText('iPhone LiDAR · RoomPlan').length).toBeGreaterThan(0)
  })

  it('lets a presenter skip the opening sweep', async () => {
    const { user, props } = renderHud({ scanProgress: 0.3 })
    await user.click(screen.getByRole('button', { name: /skip/i }))
    expect(props.onSkipScan).toHaveBeenCalledTimes(1)
  })

  it('holds edit closed until the sweep completes', () => {
    renderHud({ scanProgress: 0.3 })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  })

  it('does not pretend to scan when the backend never answered', () => {
    renderHud({ graph: null, scanProgress: 0, error: 'Backend unavailable. Start the API on port 8000.' })
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI Reconstruct/ })).toBeDisabled()
    expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument()
  })

  it('offers the graphics menu in every mode, including mid-sweep', async () => {
    const { user, props } = renderHud({ scanProgress: 0.3 })
    const menu = screen.getByRole('button', { name: /graphics/i })
    expect(menu).toBeEnabled()

    await user.click(menu)
    await user.click(screen.getByRole('switch', { name: /point cloud/i }))
    expect(props.onSettingsChange).toHaveBeenCalledWith({ ...PRESETS.high, pointCloud: false })
  })

  it('marks the objects an answer highlighted', () => {
    renderHud({ mode: 'twin', highlightedIds: ['door-1'] })
    expect(screen.getByRole('button', { name: /Door/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Conference table/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('highlights an object picked from the scene list', async () => {
    const { user, props } = renderHud({ mode: 'twin' })
    await user.click(screen.getByRole('button', { name: /Conference table/ }))
    expect(props.onSelectObject).toHaveBeenCalledWith('table-1')
  })
})

describe('AI reply read aloud', () => {
  const speak = vi.fn<(utterance: SpeechSynthesisUtterance) => void>()
  const cancel = vi.fn()

  beforeEach(() => {
    speak.mockReset()
    cancel.mockReset()
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string
      onend = null
      onerror = null
      constructor(text: string) { this.text = text }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reads the reply only on request and lets the user stop without asking again', async () => {
    const { user, props } = renderHud({ mode: 'twin', reply: 'The door is on your left.' })
    expect(speak).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    expect(speak).toHaveBeenCalledTimes(1)
    expect(speak.mock.calls[0][0].text).toBe(props.reply)
    cancel.mockClear()
    await user.click(screen.getByRole('button', { name: 'Stop reading' }))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeEnabled()
    expect(props.onAsk).not.toHaveBeenCalled()
  })

  it('allows replay after speech finishes', async () => {
    const { user } = renderHud({ reply: 'Two chairs.' })
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    const utterance = speak.mock.calls[0][0]
    act(() => utterance.onend?.call(utterance, new Event('end') as SpeechSynthesisEvent))
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    expect(speak).toHaveBeenCalledTimes(2)
  })

  it('cancels the old reply when it changes and ignores late speech events', async () => {
    const { user, props, rerender } = renderHud({ reply: 'Two chairs.' })
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    const oldUtterance = speak.mock.calls[0][0]
    const lateEnd = oldUtterance.onend
    cancel.mockClear()
    rerender(<Hud {...props} reply="The door is ahead." />)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(speak).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    act(() => lateEnd?.call(oldUtterance, new Event('end') as SpeechSynthesisEvent))
    expect(screen.getByRole('button', { name: 'Stop reading' })).toBeEnabled()
    expect(speak.mock.calls[1][0].text).toBe('The door is ahead.')
  })

  it.each(['clear', 'unmount'])('stops playback on %s', async (action) => {
    const { user, props, rerender, unmount } = renderHud({ reply: 'Two chairs.' })
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    cancel.mockClear()
    if (action === 'clear') rerender(<Hud {...props} reply={null} />)
    else unmount()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Read aloud' })).not.toBeInTheDocument()
  })

  it.each(['event', 'exception'])('shows a retryable error for a speech %s', async (failure) => {
    if (failure === 'exception') speak.mockImplementationOnce(() => { throw new Error('Unavailable') })
    const { user } = renderHud({ reply: 'Two chairs.' })
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    if (failure === 'event') {
      const utterance = speak.mock.calls[0][0]
      act(() => utterance.onerror?.call(utterance, new Event('error') as SpeechSynthesisErrorEvent))
    }
    expect(screen.getByRole('status')).toHaveTextContent(/couldn't read.*try again/i)
    await user.click(screen.getByRole('button', { name: 'Read aloud' }))
    expect(screen.queryByText(/couldn't read/i)).not.toBeInTheDocument()
    expect(speak).toHaveBeenCalledTimes(2)
  })

  it('explains when speech is unsupported while keeping the reply readable', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    renderHud({ reply: 'Two chairs.' })
    expect(screen.getByText('Two chairs.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeDisabled()
    expect(screen.getByText(/read aloud is not supported in this browser/i)).toBeVisible()
  })

  it.each([null, '', '   '])('offers no speech control for an empty reply (%s)', (reply) => {
    renderHud({ reply })
    expect(screen.queryByRole('button', { name: 'Read aloud' })).not.toBeInTheDocument()
    expect(speak).not.toHaveBeenCalled()
  })
})
