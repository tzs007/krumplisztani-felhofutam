import { fireEvent, render, screen } from '@testing-library/react-native';

import { DEFAULT_CONTINUE_LABEL, DEFAULT_EASTER_EGG_HEADING, EasterEggModal } from '../EasterEggModal';

describe('EasterEggModal', () => {
  it('shows the defaults and the content from props', async () => {
    await render(<EasterEggModal title="Doge" description="Much wow" onContinue={() => {}} />);
    expect(screen.getByText(DEFAULT_EASTER_EGG_HEADING)).toBeTruthy();
    expect(screen.getByText('Doge')).toBeTruthy();
    expect(screen.getByText('Much wow')).toBeTruthy();
    expect(screen.getByText(DEFAULT_CONTINUE_LABEL)).toBeTruthy();
  });

  it('lets props override heading and button label, and renders extra children', async () => {
    const { Text } = jest.requireActual('react-native');
    await render(
      <EasterEggModal title="Rickroll" heading="Megvagy!" continueLabel="Oké" onContinue={() => {}}>
        <Text>Never gonna give you up</Text>
      </EasterEggModal>,
    );
    expect(screen.getByText('Megvagy!')).toBeTruthy();
    expect(screen.getByText('Oké')).toBeTruthy();
    expect(screen.getByText('Never gonna give you up')).toBeTruthy();
    expect(screen.queryByText(DEFAULT_EASTER_EGG_HEADING)).toBeNull();
  });

  it('calls onContinue from the button', async () => {
    const onContinue = jest.fn();
    await render(<EasterEggModal title="Doge" onContinue={onContinue} />);
    await fireEvent.press(screen.getByText(DEFAULT_CONTINUE_LABEL));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
