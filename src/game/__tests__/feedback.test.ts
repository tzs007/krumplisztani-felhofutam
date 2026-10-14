import { feedbackFor } from '../feedback';

describe('feedbackFor', () => {
  it('plays the card sound for a score card and the bonus chime for timed bonuses', () => {
    expect(feedbackFor({ type: 'pickup', effect: 'bonus' })).toEqual({ haptic: 'medium', sound: 'card' });
    expect(feedbackFor({ type: 'pickup', effect: 'doubleScore' })).toEqual({ haptic: 'medium', sound: 'bonus' });
  });

  it('jumps on every take-off, with a light tap only out of the egg', () => {
    expect(feedbackFor({ type: 'launch' })).toEqual({ haptic: 'light', sound: 'jump' });
    expect(feedbackFor({ type: 'bounce', platformId: 1 })).toEqual({ sound: 'jump' });
  });

  it('leaves the easter egg and game over to the screen', () => {
    expect(feedbackFor({ type: 'easterEgg', eggId: 'x' })).toEqual({});
    expect(feedbackFor({ type: 'gameOver' })).toEqual({});
    expect(feedbackFor({ type: 'land', platformId: 1, points: 1 })).toEqual({});
  });
});
