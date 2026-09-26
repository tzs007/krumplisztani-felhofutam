# The Hiperventi Game

Vertikális, végtelen „jump platform” játék (Expo SDK 57 · React Native · TypeScript · Skia · Zustand · gluestack-ui v5 / NativeWind v5).

## Futtatás

```bash
npm install
npx expo start          # Expo Go-ban (i = iOS szimulátor, a = Android emulátor)
npm test                # engine + store unit tesztek
npm run typecheck
npm run lint
```

## Struktúra

```
src/app/            screenek (expo-router): index (splash), menu, game, leaderboard
src/game/config.ts  minden hangolható érték (oszlopszám, ugrásmagasság, drag, kamera, effekt idők)
src/game/engine/    tiszta TS motor (World, fizika, effekt regiszter) – nincs RN import
src/game/level/     tile legenda, chunk mátrixok, parser, végtelen generátor
src/game/render/    snapshot (draw lista) + Skia GameCanvas
src/store/          Zustand + AsyncStorage (korábbi eredmények)
```

## Pálya szerkesztése

A pálya `src/game/level/chunks.ts`-ben lévő mátrixokból áll (fentről lefelé olvasva), a generátor véletlenszerűen rakja őket egymásra, a nehézség (`difficulty`) a megmászott magassággal nő.

| Karakter | Jelentés |
|---|---|
| `.` vagy ` ` | üres |
| `#` / `=` / `B` | platform (fű / kék / tégla) |
| `P` | kezdőpozíció (csak a start chunkban) |
| `C` / `X` / `J` | pickup: +1 pont / ×2 pont 10 s / ×2 ugrásmagasság 5 s |

Szabályok (a tesztek ellenőrzik): minden sor pontosan `columns` széles, két platformsor között legfeljebb `maxJumpTiles - 1` sor lehet (chunk-határon át is), pickup csak platform fölött állhat. Új tile: `src/game/level/tiles.ts` (a `spriteKey` a későbbi sprite-hoz).

## Új pickup effekt

```ts
// src/game/engine/effects/builtins.ts
export const slowMotion = (ms: number): EffectDefinition => ({
  id: 'slowMo', durationMs: ms,
  apply: (ctx) => { /* ... */ },
  expire: (ctx) => { /* ... */ },
});
```

Regisztráld a `World` konstruktorában (`this.effects.register(...)`), adj neki tile karaktert a `tiles.ts`-ben és színt a `render/snapshot.ts`-ben.
