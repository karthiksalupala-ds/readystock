import type { SceneGraph } from '../scene/types'

export const sampleGraph: SceneGraph = {
  room: {
    id: 'room-1',
    name: 'meeting room',
    width: 7.4,
    depth: 5.2,
    height: 2.8,
    units: 'm',
  },
  objects: [
    {
      id: 'table-1',
      type: 'table',
      label: 'Conference table',
      category: 'furniture',
      position: [0, 0.38, 0],
      size: [2.4, 0.76, 1.2],
    },
    {
      id: 'door-1',
      type: 'door',
      label: 'Door',
      category: 'opening',
      position: [0.9, 1.05, 2.58],
      size: [1, 2.1, 0.08],
    },
  ],
}
