import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoomActions, PlayHud, ImportSetupHud } from './ExperienceHud'
import { PRESETS } from '../settings/graphics'

describe('desktop room controls', () => {
  it('offers local import even while the demo is unavailable, but gates Play', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<RoomActions canPlay={false} loading={false} onPlay={vi.fn()} onImport={onImport} />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    const file = new File(['room'], 'meeting-room.glb', { type: 'model/gltf-binary' })
    await user.upload(screen.getByLabelText('Import room file'), file)
    expect(onImport).toHaveBeenCalledWith(file)
  })

  it('shows desktop instructions and an explicit resume action without editing tools', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    const onExit = vi.fn()
    render(<PlayHud ready paused name="Meeting room" onResume={onResume} onExit={onExit}
      onReset={vi.fn()} settings={PRESETS.low} onSettingsChange={vi.fn()} />)
    expect(screen.getByText(/WASD/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    await user.click(screen.getByRole('button', { name: 'Exit play' }))
    expect(onResume).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('requires a validated floor point and resets units through the setup interface', async () => {
    const user = userEvent.setup()
    const onScale = vi.fn()
    const props = { name: 'room.glb', dimensions: [5, 3, 4] as [number, number, number], scale: 1,
      validating: false, valid: false, message: null, onScale, onCommit: vi.fn(), onCancel: vi.fn(),
      settings: PRESETS.low, onSettingsChange: vi.fn() }
    const { rerender } = render(<ImportSetupHud {...props} />)
    expect(screen.getByRole('button', { name: 'Open room' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Model units'), '0.01')
    expect(onScale).toHaveBeenCalledWith(0.01)
    rerender(<ImportSetupHud {...props} valid />)
    expect(screen.getByRole('button', { name: 'Open room' })).toBeEnabled()
  })

  it('offers a keyboard-labelled clickable interaction and updates the action without changing controls', async () => {
    const user = userEvent.setup()
    const onInteract = vi.fn()
    const props = { ready: true, paused: false, name: 'Meeting room', onResume: vi.fn(), onExit: vi.fn(),
      onReset: vi.fn(), settings: PRESETS.low, onSettingsChange: vi.fn(), onInteract }
    const { rerender } = render(<PlayHud {...props} interaction={{ label: 'Sit on chair', available: true }} />)
    const button = screen.getByRole('button', { name: 'Sit on chair' })
    expect(button).toHaveAttribute('aria-keyshortcuts', 'E')
    expect(screen.getByLabelText('Desktop controls')).toHaveTextContent('E Interact')
    await user.click(button)
    expect(onInteract).toHaveBeenCalledOnce()
    rerender(<PlayHud {...props} interaction={{ label: 'Stand up', available: true }} />)
    expect(screen.queryByRole('button', { name: 'Sit on chair' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stand up' })).toBeEnabled()
  })

  it('explains unavailable interactions and hides them while loading or paused', async () => {
    const user = userEvent.setup()
    const onInteract = vi.fn()
    const props = { ready: true, paused: false, name: 'Meeting room', onResume: vi.fn(), onExit: vi.fn(),
      onReset: vi.fn(), settings: PRESETS.low, onSettingsChange: vi.fn(), onInteract,
      interaction: { label: 'Sit on chair', available: false, reason: 'Move to the front of the chair.' } }
    const { rerender } = render(<PlayHud {...props} />)
    const button = screen.getByRole('button', { name: 'Sit on chair' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Move to the front of the chair.')
    expect(screen.getByRole('status')).toHaveTextContent('Move to the front of the chair.')
    await user.click(button)
    expect(onInteract).not.toHaveBeenCalled()
    rerender(<PlayHud {...props} paused />)
    expect(screen.queryByRole('button', { name: 'Sit on chair' })).not.toBeInTheDocument()
    rerender(<PlayHud {...props} ready={false} />)
    expect(screen.queryByRole('button', { name: 'Sit on chair' })).not.toBeInTheDocument()
    rerender(<PlayHud {...props} interaction={null} />)
    expect(screen.queryByRole('button', { name: 'Sit on chair' })).not.toBeInTheDocument()
  })
})
