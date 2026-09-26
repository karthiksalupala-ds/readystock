import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel } from './ExportPanel'
import { parseCapture } from '../scene/importCapture'
import { simulatedCaptureJson } from '../scene/simulatedCapture'

const floor = parseCapture(simulatedCaptureJson())

type Saved = { name: string; type: string; text: () => Promise<string> }
let saves: Saved[] = []

beforeEach(() => {
  saves = []
  // jsdom has no downloads: capture what a click on the anchor would have saved.
  const blobs = new Map<string, Blob>()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:${blobs.size}`
    blobs.set(url, blob as Blob)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href)!
    saves.push({ name: this.download, type: blob.type, text: () => blob.text() })
  })
})

afterEach(() => { vi.restoreAllMocks() })

function open(graph = floor) {
  const user = userEvent.setup()
  render(<ExportPanel graph={graph} />)
  return { user }
}

describe('exporting a room', () => {
  it('is unavailable until there is a scene to export', () => {
    render(<ExportPanel graph={null} />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('names the scene being exported', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByText(/open-plan office floor · 18 × 11.6 m · 106 objects/)).toBeInTheDocument()
  })

  it('saves a scan file that opens again through the importer', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: /Scan file/ }))

    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0].name).toBe('open-plan-office-floor.intelidar.json')
    expect(saves[0].type).toBe('application/json')
    const back = parseCapture(await saves[0].text())
    expect(back.objects).toEqual(floor.objects)
    expect(screen.getByRole('status')).toHaveTextContent('open-plan-office-floor.intelidar.json')
  })

  it('saves a schedule and a plan under the room name', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: /Object schedule/ }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0].name).toBe('open-plan-office-floor.csv')
    expect(await saves[0].text()).toContain('footprint_m2')

    await user.click(screen.getByRole('button', { name: /Floor plan/ }))
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1].name).toBe('open-plan-office-floor.svg')
    expect(saves[1].type).toContain('image/svg+xml')
  })

  it('saves a binary model', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: /3D model/ }))
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 10_000 })
    expect(saves[0].name).toBe('open-plan-office-floor.glb')
    expect(saves[0].type).toBe('model/gltf-binary')
    expect((await saves[0].text()).startsWith('glTF')).toBe(true)
  })

  it('reports a failed export instead of saving a broken file', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error('Out of memory writing the plan.') })
    await user.click(screen.getByRole('button', { name: /Floor plan/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Out of memory writing the plan.')
    expect(saves).toHaveLength(0)
  })

  it('says plainly that the model is boxes, not the catalogue furniture', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByText(/not captured surface detail/i)).toBeInTheDocument()
  })
})
