/** Matches the versioned file produced by the iOS RoomPlan exporter. */
export const roomPlanCapture = {
  format: 'intelidar.roomplan',
  version: 1,
  source: 'roomplan',
  room: { id: 'rp:room', name: 'Captured room', width: 5, depth: 4, height: 2.6, units: 'm' },
  objects: [{
    id: 'rp:chair', type: 'chair', label: 'Chair', category: 'furniture',
    position: [1, 0.45, -0.5], size: [0.5, 0.9, 0.5], rotation: [0, 1.2, 0],
    material: 'fabric', color: '#467568',
  }],
}
