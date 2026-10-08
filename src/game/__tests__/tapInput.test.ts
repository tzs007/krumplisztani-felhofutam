import { TapInput } from '../input/TapInput';

describe('TapInput', () => {
  it('reports a press and a release once, and whether the finger is down', () => {
    const tap = new TapInput();
    expect(tap.consume()).toEqual({ down: false, pressed: false, released: false });
    tap.press();
    expect(tap.consume()).toEqual({ down: true, pressed: true, released: false });
    expect(tap.consume()).toEqual({ down: true, pressed: false, released: false });
    tap.release();
    expect(tap.consume()).toEqual({ down: false, pressed: false, released: true });
    expect(tap.consume()).toEqual({ down: false, pressed: false, released: false });
  });

  it('keeps a quick tap between two steps (pressed and released in the same step)', () => {
    const tap = new TapInput();
    tap.press();
    tap.release();
    expect(tap.consume()).toEqual({ down: false, pressed: true, released: true });
  });

  it('reset forgets everything', () => {
    const tap = new TapInput();
    tap.press();
    tap.reset();
    expect(tap.consume()).toEqual({ down: false, pressed: false, released: false });
  });
});
