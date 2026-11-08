// Keyboard + mouse input with pointer lock. Edge-triggered "pressed" sets are cleared every frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // keys pressed this frame (always recorded)
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.typing = false;           // true while a text field has focus (chat, menus)
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (this.typing) return;
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
    addEventListener('mouseup', (e) => {
      if (this.mouseDown.delete(e.button)) this.mouseReleased.add(e.button);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Clamp crazy spikes that some browsers emit right after locking
      this.dx += Math.max(-200, Math.min(200, e.movementX));
      this.dy += Math.max(-200, Math.min(200, e.movementY));
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.locked && e.deltaY) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.lockPending = false;
      if (!this.locked) { this.keys.clear(); this.mouseDown.clear(); }
      this.onLockChange?.(this.locked, this._expectUnlock);
      this._expectUnlock = false;
    });
    document.addEventListener('pointerlockerror', () => { this.lockPending = false; this.onLockFail?.(); });
  }
  /** Ask for pointer lock. Browsers may refuse without a recent click/keypress; onLockFail then fires. */
  requestLock() {
    if (this.locked) return;
    this.lockPending = true;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockPending = false; this.onLockFail?.(); });
    } catch { this.lockPending = false; this.onLockFail?.(); }
    // some browsers neither resolve nor error: give up waiting after a moment
    clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => { if (this.lockPending && !this.locked) { this.lockPending = false; this.onLockFail?.(); } }, 600);
  }
  /** Release the pointer on purpose (menus, battle move picking) — not a pause. */
  exitLock() { if (document.pointerLockElement) { this._expectUnlock = true; document.exitPointerLock(); } }
  isDown(code) { return this.locked && this.keys.has(code); }
  /** Pressed this frame, only while playing (pointer locked). */
  wasPressed(code) { return this.locked && this.pressed.has(code); }
  /** Pressed this frame, regardless of pointer lock (for closing menus etc). */
  pressedAny(code) { return this.pressed.has(code); }
  clicked(btn) { return this.mousePressed.has(btn); }
  held(btn) { return this.mouseDown.has(btn); }
  endFrame() {
    this.pressed.clear(); this.mousePressed.clear(); this.mouseReleased.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
