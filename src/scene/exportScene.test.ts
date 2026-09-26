import { describe, expect, it } from 'vitest'
import { captureFileFor, exportName, floorPlanSvg, objectScheduleCsv, slug } from './exportScene'
import { parseCapture } from './importCapture'
import { simulatedCaptureJson } from './simulatedCapture'
import { sampleGraph } from '../test/sampleGraph'
import type { SceneGraph } from './types'

const floor = parseCapture(simulatedCaptureJson())

const measured: SceneGraph = {
  source: 'roomplan',
  room: { id: 'rp:room', name: 'Captured room', width: 5, depth: 4, height: 2.6, units: 'm' },
  objects: [{
    id: 'rp:chair', type: 'chair', label: 'Chair', category: 'furniture',
    position: [1, 0.45, -0.5], size: [0.5, 0.9, 0.5], rotation: [0, 1.2, 0],
    material: 'fabric', color: '#467568', confidence: 0.8,
  }],
}

describe('exporting the scan file', () => {
  it('round-trips a scene through the importer unchanged', () => {
    const back = parseCapture(JSON.stringify(captureFileFor(floor)))
    expect(back.room).toEqual(floor.room)
    expect(back.objects).toEqual(floor.objects)
    expect(back.source).toBe('simulated')
  })

  it('keeps a measured room measured, and its edits with it', () => {
    const moved: SceneGraph = {
      ...measured,
      objects: [{ ...measured.objects[0], position: [-1.5, 0.45, 1], color: '#b96348' }],
    }
    const back = parseCapture(JSON.stringify(captureFileFor(moved)))
    expect(back.source).toBe('roomplan')
    expect(back.objects[0]).toMatchObject({ id: 'rp:chair', position: [-1.5, 0.45, 1], color: '#b96348' })
  })

  it('exports the demo room as generated geometry, which is what it is', () => {
    const file = captureFileFor(sampleGraph)
    expect(file.source).toBe('simulated')
    expect(file.format).toBe('intelidar.simulated')
    expect(parseCapture(JSON.stringify(file)).objects).toHaveLength(sampleGraph.objects.length)
  })

  it('drops absent optionals rather than writing nulls the importer would reject', () => {
    const sparse: SceneGraph = {
      room: sampleGraph.room,
      objects: [{ ...sampleGraph.objects[0], material: null, color: null, confidence: null, shape: null, assetId: null }],
    }
    const written = captureFileFor(sparse).objects[0]
    expect(written).not.toHaveProperty('material')
    expect(written).not.toHaveProperty('color')
    expect(written).not.toHaveProperty('assetId')
    expect(() => parseCapture(JSON.stringify(captureFileFor(sparse)))).not.toThrow()
  })
})

describe('exporting the object schedule', () => {
  const csv = objectScheduleCsv(floor)
  const rows = csv.trim().split('\n')

  it('writes one header and one row per object', () => {
    expect(rows).toHaveLength(floor.objects.length + 1)
    expect(rows[0]).toBe('id,type,label,category,material,color,confidence,x_m,y_m,z_m,width_m,height_m,depth_m,footprint_m2,rotation_deg,asset_id')
  })

  it('reports each object at its measured size and place', () => {
    const chair = floor.objects.find((object) => object.id === 'sim:desk-1-1-chair')!
    const row = rows.find((line) => line.startsWith('sim:desk-1-1-chair,'))!.split(',')
    expect(Number(row[7])).toBeCloseTo(chair.position[0])
    expect(Number(row[10])).toBeCloseTo(chair.size[0])
    expect(Number(row[13])).toBeCloseTo(chair.size[0] * chair.size[2], 3)
    expect(Number(row[14])).toBeCloseTo(180)
  })

  it('quotes anything containing a comma or a quote', () => {
    const awkward: SceneGraph = {
      room: sampleGraph.room,
      objects: [{ ...sampleGraph.objects[0], label: 'Desk, corner "L"' }],
    }
    expect(objectScheduleCsv(awkward)).toContain('"Desk, corner ""L"""')
  })

  it('is empty of rows, but still valid, for a room with nothing in it', () => {
    expect(objectScheduleCsv({ room: sampleGraph.room, objects: [] }).trim().split('\n')).toHaveLength(1)
  })
})

describe('exporting the floor plan', () => {
  const svg = floorPlanSvg(floor)

  it('is a standalone svg sized to the room', () => {
    expect(svg.startsWith('<?xml')).toBe(true)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).not.toContain('<script')
  })

  it('titles the drawing with the room and its measurements', () => {
    expect(svg).toContain('open-plan office floor')
    expect(svg).toContain('18 × 11.6 m')
    expect(svg).toContain('208.8 m²')
    expect(svg).toContain('106 objects')
  })

  it('says it is not a survey drawing', () => {
    expect(svg).toMatch(/not a survey/i)
  })

  it('turns a plan rectangle the same way the room does', () => {
    // A quarter turn about Y narrows the bookshelf's footprint in x; in a plan
    // drawn with +z downward that is a negative SVG rotation.
    expect(svg).toContain('rotate(-90')
  })

  it('escapes label text rather than letting it close a tag', () => {
    const hostile: SceneGraph = {
      room: { ...sampleGraph.room, name: 'Room <script>alert(1)</script>' },
      objects: [{ ...sampleGraph.objects[0], label: 'Table & <b>chairs</b>' }],
    }
    const drawing = floorPlanSvg(hostile)
    expect(drawing).not.toContain('<script')
    expect(drawing).not.toContain('<b>')
    expect(drawing).toContain('&lt;script&gt;')
    expect(drawing).toContain('Table &amp; ')
  })

  it('draws openings apart from furniture so a plan reads like a plan', () => {
    expect(svg).toContain('class="opening"')
    expect(svg).toContain('class="furniture"')
  })

  it('dashes what sits above the floor, and leaves what stands on it solid', () => {
    // A keyboard on a desk is over the plan; the desk is in it.
    expect(svg).toContain('class="equipment raised"')
    expect(svg).toMatch(/class="furniture" [^>]*width="88"/)
  })

  it('names the furniture a reader is looking for, and nothing it would print over', () => {
    const named = [...svg.matchAll(/class="tag"[^>]*>([^<]*)</g)].map((match) => match[1])
    expect(named).toContain('Conference table')
    expect(named).toContain('Three-seat sofa')
    expect(named).toContain('Desk')
    // A rug would take the label off everything standing on it.
    expect(named).not.toContain('Rug')
    // A turned bookshelf is too narrow on the page to hold its own name.
    expect(named).not.toContain('Bookshelf')
    // And no two names land on the same spot.
    expect(new Set(named.map((_, index) => index)).size).toBe(named.length)
  })
})

describe('naming the files', () => {
  it('derives a safe stem from the room name', () => {
    expect(slug('open-plan office floor')).toBe('open-plan-office-floor')
    expect(slug('  Meeting Room #2!  ')).toBe('meeting-room-2')
    expect(slug('///')).toBe('room')
  })

  it('names each export after its room and kind', () => {
    expect(exportName(floor, 'intelidar.json')).toBe('open-plan-office-floor.intelidar.json')
    expect(exportName(floor, 'csv')).toBe('open-plan-office-floor.csv')
  })
})
