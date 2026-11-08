// Keyboard + mouse input with pointer lock. Edge-triggered "pressed" sets are cleared every frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown.clear(); });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseDown.add(e.button);
      this.mousePressed.add(e.button);
    });
    addEventListener('mouseup', (e) => this.mouseDown.delete(e.button));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Clamp crazy spikes that some browsers emit on lock
      this.dx += Math.max(-200, Math.min(200, e.movementX));
      this.dy += Math.max(-200, Math.min(200, e.movementY));
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    this.wheel = 0;
    addEventListener('wheel', (e) => { if (this.locked && e.deltaY) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouseDown.clear(); }
      this.onLockChange?.(this.locked);
    });
  }
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(code) { return this.locked && this.keys.has(code); }
  wasPressed(code) { return this.locked && this.pressed.has(code); }
  clicked(btn) { return this.mousePressed.has(btn); }
  endFrame() {
    this.pressed.clear(); this.mousePressed.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
