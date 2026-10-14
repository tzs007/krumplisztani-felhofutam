import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Countdown } from '@/components/game/Countdown';
import { EasterEggModal } from '@/components/game/EasterEggModal';
import { GameOverlay } from '@/components/game/GameOverlay';
import { Hud } from '@/components/game/Hud';
import { Box } from '@/components/ui/box';
import { defaultGameConfig } from '@/game/config';
import { getEasterEgg, withEasterEggSettings, type EasterEgg } from '@/game/easterEggs';
import { World } from '@/game/engine/World';
import { feedbackFor, type HapticKind } from '@/game/feedback';
import { useGameLoop } from '@/game/hooks/useGameLoop';
import { useHud } from '@/game/hooks/useHud';
import { useSprites } from '@/game/hooks/useSprites';
import { DragInput } from '@/game/input/DragInput';
import { TapInput } from '@/game/input/TapInput';
import { countdownLabel } from '@/game/render/countdown';
import { GameCanvas } from '@/game/render/GameCanvas';
import { buildSnapshot } from '@/game/render/snapshot';
import { useOnBackground } from '@/hooks/useOnBackground';
import { playSound, setMusic } from '@/lib/audio';
import { cardsForScore } from '@/lib/cardRules';
import { connectAndSync } from '@/lib/resultsSync';
import { selectBestScore, useAppStore } from '@/store/useAppStore';
import { useCardsStore } from '@/store/useCardsStore';

type Status = 'playing' | 'paused' | 'easterEgg' | 'over';

const config = defaultGameConfig;

function playHaptic(kind: HapticKind) {
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else
    Haptics.impactAsync(
      {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      }[kind],
    );
}

export default function GameRoute() {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<Status>('playing');
  const { hud, update: updateHud, reset: resetHud } = useHud();
  const [countdown, setCountdown] = useState<string | null>(null);
  // psy mode (magic mushroom): its own music while it lasts
  const [psy, setPsy] = useState(false);
  const [foundEgg, setFoundEgg] = useState<EasterEgg | null>(null);

  const worldRef = useRef<World | null>(null);
  const [input] = useState(() => new DragInput());
  // the same touch as a button: the bonus level jumps on a tap
  const [tap] = useState(() => new TapInput());
  const sprites = useSprites();
  // psy mode as last rendered, per world: its end (not a new run) plays the backspin
  const lastPsy = useRef<{ world: World | null; on: boolean }>({
    world: null,
    on: false,
  });
  const commands = useSharedValue<number[]>([]);
  const addResult = useAppStore((s) => s.addResult);
  const bestScore = useAppStore(selectBestScore);

  const tileSize = size ? size.width / config.columns : 1;

  const startRun = (canvas: { width: number; height: number }) => {
    const ts = canvas.width / config.columns;
    // downloaded easter egg drop-rate settings (if any) apply from this run on
    const world = new World({
      config: withEasterEggSettings(config),
      viewHeight: canvas.height / ts,
    });
    worldRef.current = world;
    input.reset();
    tap.reset();
    commands.set(buildSnapshot(world, ts, canvas.height));
    resetHud();
    setCountdown(countdownLabel(world));
    setStatus('playing');
  };

  const restart = () => {
    if (size) startRun(size);
  };

  useEffect(() => {
    setMusic(psy ? 'psy' : 'game');
  }, [psy]);

  // a tick on each number of the start countdown (3, 2, 1)
  useEffect(() => {
    if (countdown && countdown !== 'GO!' && status === 'playing') playSound('countdownTick');
  }, [countdown, status]);

  // pause when the app goes to background
  useOnBackground(() => setStatus((s) => (s === 'playing' ? 'paused' : s)));

  const finishRun = (world: World) => {
    const saved = addResult({
      score: world.score,
      platforms: world.stats.platforms,
      pickups: world.stats.pickups,
      durationMs: world.time,
      playedAt: Date.now(),
    });
    // the cards it earned are kept even if the app closes before they're drawn
    if (cardsForScore(saved.score) > 0) useCardsStore.getState().addClaim(saved.id);
    // upload it (plus anything queued while offline), signing in first if that failed earlier; fire and forget
    connectAndSync();
    setStatus('over');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // the death sequence has played: on to the game over screen (best = before this run)
    router.replace({
      pathname: '/game-over',
      params: {
        score: String(world.score),
        best: String(bestScore),
        resultId: saved.id,
      },
    });
  };

  const step = (dt: number) => {
    const world = worldRef.current;
    if (!world || world.over) return;
    const events = world.step(dt, {
      ...input.consume(tileSize),
      tap: tap.consume(),
    });
    for (const e of events) {
      const { haptic, sound } = feedbackFor(e);
      if (haptic) playHaptic(haptic);
      if (sound) playSound(sound);
      if (e.type === 'easterEgg') {
        const egg = getEasterEgg(e.eggId);
        if (egg) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFoundEgg(egg);
          setStatus('easterEgg'); // stops the loop until "Tovább"
        }
      }
      if (e.type === 'gameOver') finishRun(world);
    }
  };

  const render = () => {
    const world = worldRef.current;
    if (!world || !size) return;
    commands.set(buildSnapshot(world, tileSize, size.height));
    // countdown text changes exactly on time (setState bails out when unchanged)
    setCountdown(countdownLabel(world));
    setPsy(world.psyActive);
    if (lastPsy.current.world === world && lastPsy.current.on && !world.psyActive) playSound('backspin');
    lastPsy.current = { world, on: world.psyActive };
    updateHud(world);
  };

  useGameLoop(status === 'playing' && size !== null && sprites !== null, step, render);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin(() => {
          input.begin();
          tap.press();
        })
        .onChange((e) => input.move(e.changeX, e.changeY))
        .onEnd((e) => input.release(e.velocityX))
        .onFinalize(() => {
          input.end();
          tap.release();
        }),
    [input, tap],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size) return; // portrait-locked: the first measurement is the canvas size
    const canvas = { width, height };
    setSize(canvas);
    startRun(canvas);
  };

  return (
    <Box className="flex-1 bg-sky">
      <GestureDetector gesture={pan}>
        <Box className="flex-1" onLayout={onLayout}>
          {size && sprites && (
            <GameCanvas width={size.width} height={size.height} commands={commands} sprites={sprites} />
          )}
        </Box>
      </GestureDetector>

      {status !== 'over' && (
        <Hud
          score={hud.score}
          effects={hud.effects}
          bonusProgress={hud.bonusProgress}
          topInset={insets.top}
          onPause={() => setStatus('paused')}
        />
      )}

      {status === 'playing' && <Countdown label={countdown} />}

      {status === 'paused' && (
        <GameOverlay
          title="Paused"
          actions={[
            {
              label: 'Resume',
              primary: true,
              onPress: () => setStatus('playing'),
            },
            { label: 'Restart', onPress: () => restart() },
            { label: 'Menu', onPress: () => router.back() },
          ]}
        />
      )}

      {status === 'easterEgg' && foundEgg && (
        <EasterEggModal
          title={foundEgg.title}
          description={foundEgg.description}
          heading={foundEgg.heading}
          image={foundEgg.image}
          imageAspectRatio={foundEgg.imageAspectRatio}
          continueLabel={foundEgg.continueLabel}
          onContinue={() => setStatus('playing')}
        />
      )}
    </Box>
  );
}
