// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createInteractionSession, selectTarget, reconcileToggles } from './session'
import type { SeatInteraction, ToggleInteraction } from './types'
import type { Vec3 } from '../scene/types'

const chair: SeatInteraction = { kind: 'seat', id: 'chair:0', objectId: 'chair', label: 'chair', point: [0, .46, .8], seat: [0, .46, .8], approach: [0, 0, .1], heading: Math.PI, floorY: 0 }
const lamp: ToggleInteraction = { kind: 'toggle', id: 'lamp', objectId: 'lamp', label: 'lamp', point: [.2, 1, 1], toggle: 'lamp' }
const visible = () => true
function setup(motion = true) {
  let position: Vec3 = [0, .015, 0]
  const onChange = vi.fn()
  const adapter = { feet: () => position, heading: () => 0, visible, validateSeat: () => ({ valid: true as const, exit: [0, .015, .1] as Vec3 }), validateExit: (p: Vec3) => p,
    attach: (p: Vec3) => { position = p }, release: (p: Vec3) => { position = p } }
  const session = createInteractionSession([chair, lamp], adapter, { onChange, motion: () => motion })
  return { session, adapter, onChange }
}
describe('interaction session', () => {
  it('selects the nearest visible forward point and keeps a nearby current target stable', () => {
    expect(selectTarget([chair, lamp], [0, 0, 0], 0, visible)?.id).toBe(chair.id)
    expect(selectTarget([chair], [0, 0, 0], Math.PI, visible)).toBeNull()
    expect(selectTarget([chair], [0, 0, -2], 0, visible)).toBeNull()
    expect(selectTarget([chair, lamp], [0, 0, 0], 0, (_, id) => id !== 'chair')?.id).toBe(lamp.id)
    const adjacent = { ...chair, id: 'other', objectId: 'other', point: [.01, .46, .79] as Vec3 }
    expect(selectTarget([adjacent, chair], [0, 0, 0], 0, visible, chair.id)?.id).toBe(chair.id)
  })
  it('runs every sitting phase, emits only changes, and resets immediately', () => {
    const { session, onChange } = setup()
    session.update(0)
    const count = onChange.mock.calls.length
    session.update(.01)
    expect(onChange).toHaveBeenCalledTimes(count)
    session.interact()
    expect(session.snapshot().phase).toBe('aligning')
    session.update(.2)
    expect(session.snapshot().phase).toBe('sitting_down')
    session.update(.7)
    expect(session.snapshot().phase).toBe('seated')
    session.interact()
    expect(session.snapshot().phase).toBe('standing_up')
    session.update(.7)
    expect(session.snapshot().phase).toBe('standing')
    session.update(0); session.interact(); session.reset()
    expect(session.snapshot().phase).toBe('standing')
  })
  it('rejects blocked seats with a reason and refuses unsafe exits', () => {
    const { session, adapter } = setup()
    adapter.validateSeat = () => ({ valid: false, reason: 'Clear the space in front of this seat.' }) as never
    session.update(0); session.interact()
    expect(session.snapshot()).toMatchObject({ phase: 'standing', available: false, reason: expect.stringMatching(/space/) })
    const fast = setup(false)
    fast.session.update(0); fast.session.interact()
    expect(fast.session.snapshot().phase).toBe('seated')
    fast.adapter.validateExit = () => null as never
    fast.session.interact()
    expect(fast.session.snapshot()).toMatchObject({ phase: 'seated', available: false })
  })
  it('keeps duplicate toggles independent and removes deleted object state', () => {
    expect(reconcileToggles({ lamp: true, deleted: true }, [chair, lamp])).toEqual({ lamp: true })
    expect(reconcileToggles({}, [lamp, { ...lamp, id: 'lamp2', objectId: 'lamp2' }])).toEqual({})
    let enabled = false
    const onToggle = vi.fn(() => { enabled = !enabled })
    const { adapter } = setup()
    const session = createInteractionSession([lamp], adapter, { readToggle: () => enabled, onToggle })
    session.update(0); session.interact()
    expect(onToggle).toHaveBeenCalledWith('lamp')
    expect(session.snapshot().label).toBe('Turn off lamp')
  })
})
