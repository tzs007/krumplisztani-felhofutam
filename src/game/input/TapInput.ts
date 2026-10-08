import type { TapState } from '../engine/entities';

/**
 * The touch read as a button (bonus level: tap to jump, hold to jump higher).
 * Collects presses and releases between game steps; `consume` hands them to
 * the step and clears the edges, so a quick tap between two steps is kept.
 */
export class TapInput {
  private down = false;
  private pressed = false;
  private released = false;

  press() {
    this.down = true;
    this.pressed = true;
  }

  release() {
    if (!this.down) return;
    this.down = false;
    this.released = true;
  }

  reset() {
    this.down = false;
    this.pressed = false;
    this.released = false;
  }

  consume(): TapState {
    const state = { down: this.down, pressed: this.pressed, released: this.released };
    this.pressed = false;
    this.released = false;
    return state;
  }
}
