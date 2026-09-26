import { useEffect, useLayoutEffect, useRef } from 'react';

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 1 / 20;

/**
 * requestAnimationFrame loop with a fixed physics timestep, so the jump
 * height does not depend on the device frame rate. `step` is called 0..n
 * times per frame, `render` once per frame.
 */
export function useGameLoop(running: boolean, step: (dt: number) => void, render: () => void) {
  const stepRef = useRef(step);
  const renderRef = useRef(render);
  useLayoutEffect(() => {
    stepRef.current = step;
    renderRef.current = render;
  });

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: number | null = null;
    let acc = 0;
    const tick = (now: number) => {
      if (last !== null) {
        acc += Math.min((now - last) / 1000, MAX_FRAME_DT);
        while (acc >= FIXED_DT) {
          stepRef.current(FIXED_DT);
          acc -= FIXED_DT;
        }
      }
      last = now;
      renderRef.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
}
