import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CaptureImport } from './CaptureImport'
import { SIMULATED_ROOM } from '../scene/simulatedCapture'
import { roomPlanCapture } from '../test/roomPlanCapture'

function open() {
  const onImport = vi.fn()
  const user = userEvent.setup()
  render(<CaptureImport onImport={onImport} />)
  return { onImport, user }
}

describe('bringing a room in without a device', () => {
  it('loads the simulated floor when no iPhone is available', async () => {
    const { onImport, user } = open()
    await user.click(screen.getByRole('button', { name: 'Import scan' }))
    await user.click(screen.getByRole('button', { name: /simulated scan/i }))

    expect(onImport).toHaveBeenCalledTimes(1)
    const graph = onImport.mock.calls[0][0]
    expect(graph.source).toBe('simulated')
    expect(graph.room).toMatchObject(SIMULATED_ROOM)
    expect(graph.objects.length).toBeGreaterThan(80)
  })

  it('says plainly that the simulated floor was not measured', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Import scan' }))
    expect(screen.getByText(/no sensor/i)).toBeInTheDocument()
  })

  it('still imports a real capture file', async () => {
    const { onImport, user } = open()
    await user.click(screen.getByRole('button', { name: 'Import scan' }))
    await user.upload(
      screen.getByLabelText('Choose scan from Files'),
      new File([JSON.stringify(roomPlanCapture)], 'room.intelidar.json', { type: 'application/json' }),
    )
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0].source).toBe('roomplan')
  })

  it('reports a file it cannot read and keeps the current scene', async () => {
    const { onImport, user } = open()
    await user.click(screen.getByRole('button', { name: 'Import scan' }))
    await user.upload(
      screen.getByLabelText('Choose scan from Files'),
      new File(['{}'], 'bad.json', { type: 'application/json' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/InteLiDar Capture/)
    expect(onImport).not.toHaveBeenCalled()
  })
})
