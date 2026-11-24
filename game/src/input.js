// input.js — one job: keyboard and mouse state for Solmar Bay.
// Tracks held keys, mouse deltas for the orbit camera, and click events
// (shoot). Pointer lock is requested on canvas click while playing; dragging
// with the mouse held works as a fallback.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false; // set true on mousedown, consumed by combat
    this.locked = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      if (this.enabled && !this.locked) {
        try { canvas.requestPointerLock(); } catch (err) { /* drag fallback */ }
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (e.buttons & 1) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.clicked = true;
    });
  }

  down(code) { return this.keys.has(code); }

  // WASD / arrows as a -1..1 pair.
  moveAxes() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
      - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
      - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    return { x, y };
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  pressed(code) {
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }
}
