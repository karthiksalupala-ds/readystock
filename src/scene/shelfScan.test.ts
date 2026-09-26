import { describe, expect, it } from 'vitest'
import { applyShelfDetections } from './shelfScan'
import { sampleGraph } from '../test/sampleGraph'

describe('applyShelfDetections', () => {
  it('updates matching products without changing unrelated objects', () => {
    const graph = {
      ...sampleGraph,
      objects: [
        { ...sampleGraph.objects[0], id: 'rice-1', label: 'Rice bag' },
        sampleGraph.objects[1],
      ],
    }
    const result = applyShelfDetections(graph, [{ label: 'rice bag', count: 7, color: '#f5c542' }])
    expect(result.objects[0]).toMatchObject({ count: 7, color: '#f5c542' })
    expect(result.objects[1]).toEqual(sampleGraph.objects[1])
  })
})
