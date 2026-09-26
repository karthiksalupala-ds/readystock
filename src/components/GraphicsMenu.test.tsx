import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GraphicsMenu } from './GraphicsMenu'
import { GRAPHICS_OPTIONS, PRESETS } from '../settings/graphics'

function renderMenu(overrides: Partial<Parameters<typeof GraphicsMenu>[0]> = {}) {
  const props = { settings: PRESETS.high, onChange: vi.fn(), ...overrides }
  return { user: userEvent.setup(), props, ...render(<GraphicsMenu {...props} />) }
}

function trigger() {
  return screen.getByRole('button', { name: /graphics/i })
}

describe('GraphicsMenu', () => {
  it('stays shut until asked for', () => {
    renderMenu()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('opens on the trigger and lists every setting', async () => {
    const { user } = renderMenu()
    await user.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('switch')).toHaveLength(GRAPHICS_OPTIONS.length)
    for (const option of GRAPHICS_OPTIONS) {
      expect(screen.getByRole('switch', { name: new RegExp(option.label, 'i') })).toBeInTheDocument()
    }
  })

  it('shows each switch in its current state', async () => {
    const { user } = renderMenu({ settings: { ...PRESETS.high, shadows: false } })
    await user.click(trigger())

    expect(screen.getByRole('switch', { name: /shadows/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: /point cloud/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('turns one setting off without touching the others', async () => {
    const { user, props } = renderMenu()
    await user.click(trigger())
    await user.click(screen.getByRole('switch', { name: /point cloud/i }))

    expect(props.onChange).toHaveBeenCalledWith({ ...PRESETS.high, pointCloud: false })
  })

  it('drops everything at once from the low preset', async () => {
    const { user, props } = renderMenu()
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: /^low$/i }))

    expect(props.onChange).toHaveBeenCalledWith(PRESETS.low)
  })

  it('marks the preset the settings currently match', async () => {
    const { user } = renderMenu({ settings: PRESETS.balanced })
    await user.click(trigger())

    expect(screen.getByRole('button', { name: /^balanced$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^high$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('leaves every preset unpressed for a hand-tuned mix', async () => {
    const { user } = renderMenu({ settings: { ...PRESETS.high, beam: false } })
    await user.click(trigger())

    for (const name of [/^high$/i, /^balanced$/i, /^low$/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('closes on escape and gives the trigger back its focus', async () => {
    const { user } = renderMenu()
    await user.click(trigger())
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes when the pointer goes somewhere else', async () => {
    const { user } = renderMenu()
    await user.click(trigger())
    await user.click(document.body)

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('stays open while settings are being changed', async () => {
    const { user } = renderMenu()
    await user.click(trigger())
    await user.click(screen.getByRole('switch', { name: /shadows/i }))

    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
  })
})
