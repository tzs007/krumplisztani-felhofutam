import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent } from 'react-native';
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
import type { ActiveEffect } from '@/game/engine/effects/EffectRegistry';
import { World } from '@/game/engine/World';
import { useGameLoop } from '@/game/hooks/useGameLoop';
import { DragInput } from '@/game/input/DragInput';
import { GameCanvas } from '@/game/render/GameCanvas';
import { getLoadedSprites, loadSprites } from '@/game/render/loadSprites';
import { SPRITE_KEYS } from '@/game/render/sprites';
import { countdownLabel } from '@/game/render/countdown';
import { playSound } from '@/lib/audio';
import { buildSnapshot } from '@/game/render/snapshot';
import { connectAndSync } from '@/lib/resultsSync';
import { selectBestScore, useAppStore } from '@/store/useAppStore';

type Status = 'playing' | 'paused' | 'easterEgg' | 'over';
type HudState = { score: number; effects: ActiveEffect[] };

const config = defaultGameConfig;
const HUD_INTERVAL_MS = 200;

export default function GameRoute() {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<Status>('playing');
  const [hud, setHud] = useState<HudState>({ score: 0, effects: [] });
  const [countdown, setCountdown] = useState<string | null>(null);
  const [foundEgg, setFoundEgg] = useState<EasterEgg | null>(null);

  const worldRef = useRef<World | null>(null);
  const [input] = useState(() => new DragInput());
  // normally decoded on the splash screen; deep links straight into /game load them here.
  // The images are tied to the sprite order they were built for: if that order changed
  // (a sprite was added and Fast Refresh kept this state), they are stale and reloaded.
  const [loaded, setLoaded] = useState(() => ({ keys: SPRITE_KEYS, images: getLoadedSprites() }));
  const sprites = loaded.keys === SPRITE_KEYS ? loaded.images : null;
  const hudUpdatedAt = useRef(0);
  const commands = useSharedValue<number[]>([]);
  const addResult = useAppStore((s) => s.addResult);
  const bestScore = useAppStore(selectBestScore);

  const tileSize = size ? size.width / config.columns : 1;

  const startRun = (canvas: { width: number; height: number }) => {
    const ts = canvas.width / config.columns;
    // downloaded easter egg drop-rate settings (if any) apply from this run on
    const world = new World({ config: withEasterEggSettings(config), viewHeight: canvas.height / ts });
    worldRef.current = world;
    input.reset();
    commands.set(buildSnapshot(world, ts, canvas.height));
    setHud({ score: 0, effects: [] });
    setCountdown(countdownLabel(world));
    setStatus('playing');
  };

  const restart = () => {
    if (size) startRun(size);
  };

  // a tick on each number of the start countdown (3, 2, 1)
  useEffect(() => {
    if (countdown && countdown !== 'GO!' && status === 'playing') playSound('countdownTick');
  }, [countdown, status]);

  useEffect(() => {
    if (!sprites) loadSprites().then((images) => setLoaded({ keys: SPRITE_KEYS, images }));
  }, [sprites]);

  // pause when the app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setStatus((s) => (s === 'playing' ? 'paused' : s));
    });
    return () => sub.remove();
  }, []);

  const finishRun = (world: World) => {
    addResult({
      score: world.score,
      platforms: world.stats.platforms,
      pickups: world.stats.pickups,
      durationMs: world.time,
      playedAt: Date.now(),
    });
    // upload it (plus anything queued while offline), signing in first if that failed earlier; fire and forget
    connectAndSync();
    setStatus('over');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // the death sequence has played: on to the game over screen (best = before this run)
    router.replace({ pathname: '/game-over', params: { score: String(world.score), best: String(bestScore) } });
  };

  const step = (dt: number) => {
    const world = worldRef.current;
    if (!world || world.over) return;
    const events = world.step(dt, input.consume(tileSize));
    for (const e of events) {
      if (e.type === 'pickup') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // score card: its own sound; timed bonuses (×2, double jump): the "bonus" chime
        playSound(e.effect === 'bonus' ? 'card' : 'bonus');
      }
      if (e.type === 'hit') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (e.type === 'easterEgg') {
        const egg = getEasterEgg(e.eggId);
        if (egg) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFoundEgg(egg);
          setStatus('easterEgg'); // stops the loop until "Tovább"
        }
      }
      if (e.type === 'launch') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // every take-off: the hop out of the egg and each bounce off a platform
      if (e.type === 'launch' || e.type === 'land') playSound('jump');
      if (e.type === 'death') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (e.type === 'milestone') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playSound('milestone');
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
    const now = Date.now();
    if (now - hudUpdatedAt.current >= HUD_INTERVAL_MS) {
      hudUpdatedAt.current = now;
      const effects = world.effects.getActive(world.time);
      setHud((prev) =>
        prev.score === world.score && prev.effects.length === 0 && effects.length === 0
          ? prev
          : { score: world.score, effects },
      );
    }
  };

  useGameLoop(status === 'playing' && size !== null && sprites !== null, step, render);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin(() => input.begin())
        .onChange((e) => input.move(e.changeX))
        .onEnd((e) => input.release(e.velocityX))
        .onFinalize(() => input.end()),
    [input],
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
          {size && sprites && <GameCanvas width={size.width} height={size.height} commands={commands} sprites={sprites} />}
        </Box>
      </GestureDetector>

      {status !== 'over' && (
        <Hud score={hud.score} effects={hud.effects} topInset={insets.top} onPause={() => setStatus('paused')} />
      )}

      {status === 'playing' && <Countdown label={countdown} />}

      {status === 'paused' && (
        <GameOverlay
          title="Paused"
          actions={[
            { label: 'Resume', primary: true, onPress: () => setStatus('playing') },
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
