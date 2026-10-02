import { fireEvent, render, screen } from '@testing-library/react-native';

import GameOverRoute from '@/app/game-over';

const mockParams: { score?: string; best?: string } = {};
const mockRouter = { replace: jest.fn(), dismissTo: jest.fn() };
// the factory runs before the consts above are initialised: look them up at call time
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    dismissTo: (...args: unknown[]) => mockRouter.dismissTo(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('game over screen', () => {
  it('shows the score and the previous best', async () => {
    Object.assign(mockParams, { score: '42', best: '77' });
    await render(<GameOverRoute />);
    expect(screen.getByText('Game Over')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Best: 77')).toBeTruthy();
  });

  it('celebrates a new best', async () => {
    Object.assign(mockParams, { score: '120', best: '77' });
    await render(<GameOverRoute />);
    expect(screen.getByText('New best score!')).toBeTruthy();
  });

  it('starts a new run, opens the leaderboard or goes back to the menu', async () => {
    Object.assign(mockParams, { score: '5', best: '0' });
    await render(<GameOverRoute />);
    await fireEvent.press(screen.getByText('Play again'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/game');
    await fireEvent.press(screen.getByText('Leaderboard'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/leaderboard');
    await fireEvent.press(screen.getByText('Menu'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/menu');
  });
});
