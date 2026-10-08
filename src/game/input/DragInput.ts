/**
 * Collects pan-gesture data between game steps. Values are in PIXELS;
 * `consume` converts them to tiles and resets the per-step delta.
 */
export class DragInput {
  private dragging = false;
  private dx = 0;
  private dy = 0;
  private releaseVelocity: number | undefined;

  begin() {
    this.dragging = true;
  }

  /** dyPx: screen direction (down = positive); only the flying chick uses it. */
  move(dxPx: number, dyPx = 0) {
    this.dx += dxPx;
    this.dy += dyPx;
  }

  release(velocityPx: number) {
    this.releaseVelocity = velocityPx;
  }

  end() {
    this.dragging = false;
  }

  reset() {
    this.dragging = false;
    this.dx = 0;
    this.dy = 0;
    this.releaseVelocity = undefined;
  }

  consume(tileSize: number) {
    const input = {
      dragging: this.dragging,
      dx: this.dx / tileSize,
      dy: this.dy / tileSize,
      releaseVelocity: this.releaseVelocity === undefined ? undefined : this.releaseVelocity / tileSize,
    };
    this.dx = 0;
    this.dy = 0;
    this.releaseVelocity = undefined;
    return input;
  }
}
