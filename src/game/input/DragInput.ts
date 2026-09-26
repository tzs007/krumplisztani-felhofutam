/**
 * Collects pan-gesture data between game steps. Values are in PIXELS;
 * `consume` converts them to tiles and resets the per-step delta.
 */
export class DragInput {
  private dragging = false;
  private dx = 0;
  private releaseVelocity: number | undefined;

  begin() {
    this.dragging = true;
  }

  move(dxPx: number) {
    this.dx += dxPx;
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
    this.releaseVelocity = undefined;
  }

  consume(tileSize: number) {
    const input = {
      dragging: this.dragging,
      dx: this.dx / tileSize,
      releaseVelocity: this.releaseVelocity === undefined ? undefined : this.releaseVelocity / tileSize,
    };
    this.dx = 0;
    this.releaseVelocity = undefined;
    return input;
  }
}
