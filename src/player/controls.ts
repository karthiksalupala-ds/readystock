export type PlayerInput = { x: number; z: number; run: boolean }
export type PlayerAnimation = 'idle' | 'walk' | 'run' | 'sit_down' | 'seated_idle' | 'stand_up'
export function movementVelocity(input: PlayerInput, yaw: number): [number, number] {
  const length = Math.max(1, Math.hypot(input.x, input.z))
  const speed = (input.run ? 3.2 : 1.6) / length
  return [(input.x * Math.cos(yaw) + input.z * Math.sin(yaw)) * speed,
    (-input.x * Math.sin(yaw) + input.z * Math.cos(yaw)) * speed]
}

export function movementAnimation(distance: number, dt: number, running: boolean): PlayerAnimation {
  return distance / Math.max(dt, 0.001) < 0.08 ? 'idle' : running ? 'run' : 'walk'
}

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])

/** Installed only for the active play session; UI text fields retain their own keyboard input. */
export function bindDesktopInput(canvas: HTMLCanvasElement, enabled: () => boolean,
  look: (dx: number, dy: number) => void, interact?: () => void) {
  const keys = new Set<string>()
  let pointer: number | null = null
  let lastX = 0
  let lastY = 0
  const clear = () => {
    keys.clear()
    if (pointer !== null && canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer)
    pointer = null
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!enabled() || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.code === 'KeyE' && interact) {
      event.preventDefault()
      if (!event.repeat && !keys.has(event.code)) {
        keys.add(event.code)
        interact()
      }
      return
    }
    if (!MOVEMENT_KEYS.has(event.code)) return
    event.preventDefault()
    keys.add(event.code)
  }
  const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.code) }
  const onPointerDown = (event: PointerEvent) => {
    if (!enabled() || event.button !== 0 || event.pointerType === 'touch') return
    pointer = event.pointerId
    lastX = event.clientX
    lastY = event.clientY
    canvas.setPointerCapture?.(pointer)
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!enabled() || event.pointerId !== pointer) return
    look(event.clientX - lastX, event.clientY - lastY)
    lastX = event.clientX
    lastY = event.clientY
  }
  const onPointerUp = () => {
    if (pointer !== null && canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer)
    pointer = null
  }
  const onVisibility = () => { if (document.hidden) clear() }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', clear)
  canvas.addEventListener('lostpointercapture', onPointerUp)
  return {
    read: (): PlayerInput => {
      if (!enabled()) clear()
      return {
        x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
        z: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      }
    },
    clear,
    dispose: () => {
      clear()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', clear)
      canvas.removeEventListener('lostpointercapture', onPointerUp)
    },
  }
}
