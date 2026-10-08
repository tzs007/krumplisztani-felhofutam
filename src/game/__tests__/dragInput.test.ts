import { DragInput } from '../input/DragInput';

describe('DragInput', () => {
  it('collects horizontal and vertical finger movement between steps, in tiles', () => {
    const input = new DragInput();
    input.begin();
    input.move(20, -40);
    input.move(20, 0);
    expect(input.consume(40)).toMatchObject({ dragging: true, dx: 1, dy: -1 });
    expect(input.consume(40)).toMatchObject({ dx: 0, dy: 0 });
  });
});
