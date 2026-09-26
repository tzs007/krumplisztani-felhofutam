# Hiperventi in Krumplisztan

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

| Karakter        | Jelentés                                              |
| --------------- | ----------------------------------------------------- |
| `.` vagy ` `    | üres                                                  |
| `#` / `=` / `B` | platform (fű / kék / tégla)                           |
| `P`             | kezdőpozíció (csak a start chunkban)                  |
| `C` / `X` / `J` | pickup: +1 pont / ×2 pont 10 s / ×2 ugrásmagasság 5 s (méret tile-onként: `size` a `tiles.ts`-ben, alap 0.6, érme 1.2) |

Szabályok (a tesztek ellenőrzik): minden sor pontosan `columns` széles, két platformsor között legfeljebb `maxJumpTiles - 1` sor lehet (chunk-határon át is), pickup csak platform fölött állhat. Új tile: `src/game/level/tiles.ts` (a `spriteKey` a későbbi sprite-hoz).

## Új pickup effekt

```ts
// src/game/engine/effects/builtins.ts
export const slowMotion = (ms: number): EffectDefinition => ({
  id: "slowMo",
  durationMs: ms,
  apply: (ctx) => {
    /* ... */
  },
  expire: (ctx) => {
    /* ... */
  },
});
```

Regisztráld a `World` konstruktorában (`this.effects.register(...)`), adj neki tile karaktert a `tiles.ts`-ben és színt a `render/snapshot.ts`-ben.

## Sprite-ok és animációk

Minden grafika az `assets/sprites/` mappában van, a **fájlnév = spriteKey** (lista: `src/game/render/sprites.ts`).

- Méret: **128×128 px képkockánként** (négyzetes kockák; a karakterpózok lehetnek nagyobbak, lásd lent), átlátszó háttér (a felhő 256×128). A renderer nearest-neighbour szűréssel skáláz, így a pixel art éles marad.
- **Animáció = sprite sheet** (időalapú: `fps`/`loop`, vagy ugrásnál sebességalapú: `"mode": "velocity"`): a képkockák egy PNG-ben, vízszintesen egymás mellett (pl. 6 kocka → 768×128). A kockaszám, fps és ismétlés az `assets/sprites/animations.json`-ban van, kézzel szerkeszthető. Ami nincs benne, az egyetlen kép.
- Platformok: `platform_<variant>_{left,mid,right,single}` — a sprite **felső éle** a járható felület.
- Karakter (csibe): `player_jump` (ugrás, futóciklus), `player_fall` (csak ha a csúcsponthoz képest legalább fél platformnyit — `config.player.fallPoseAfterTiles`, alapból 1.5 tile — zuhant), bónusz pózok. Mind **jobbra néz**, balra a renderer tükrözi; a talp a kép alján legyen.
- **Bónuszonként más póz**: pickup után 600 ms-ig (`config.player.bonusPoseMs`) a `player_bonus_<pickup neve>` látszik (pl. `pickup_coin` → `player_bonus_coin`); ha ilyen nincs, a `player_bonus`.
- Procedurális mozgás (képkocka nélkül): felugráskor enyhe összenyomódás (12%), emelkedés közben nyúlás (6%), a pickupok lebegnek.

**Csere:** írd felül a PNG-t azonos néven (ha animált, a kockaszámot is frissítsd az `animations.json`-ban), majd `npx expo start -c`. Új sprite: PNG + egy sor a `spriteSources`-ba. Hiányzó kép helyén magenta négyzet jelenik meg; a tesztek ellenőrzik, hogy a PNG szélessége = kockaszám × 128.

**Karakter forrásképek** (`assets/sprite-sources/`, tetszőleges méretű, átlátszó hátterű PNG):
- `chick_run.png` → `player_jump`: **2 kocka, az ugrás fázisa szerint** (`"mode": "velocity"`): felfelé az első (terpesz), földet éréskor és lefelé az utolsó (összezárt láb). A csíkból a `sourceFrames` kockái kerülnek be (most `[0, 1]`). Kockák balról jobbra, **átlátszó hézaggal elválasztva** (nem kell egyenletes rács); közös lépték, talpvonal és paletta.
- `chick_jump.png` → `player_jump`, ha nincs `chick_run.png`. Ez adja a léptéket a többi pózhoz: a tartalma = 128×128 = 1 tile.
- `chick_fall.png` → `player_fall` (ha nincs, az ugrópóz).
- `chick_run_<effekt>.png` → `player_jump_<effekt>`: ugrás animáció, amíg az időzített effekt aktív (most: `chick_run_double_jump.png` → kék lángoló futás a dupla ugrás 5 mp-e alatt). Ugyanolyan csík, mint a `chick_run.png`, és ugyanabban a léptékben készül; a lángok miatt nagyobb kocka (177 px) a talpponthoz igazítva.
- `chick_bonus.png` → minden bónusz póz; típusonként felülírható: `chick_bonus_coin.png`, `chick_bonus_double_score.png`, `chick_bonus_double_jump.png` (ez már megvan: kék lángoló csibe). A kék/cián effekt-pixeleket (láng, szikra) a script figyelmen kívül hagyja a középre igazításnál, így a csibe mindig középen van.
- A többi póz az ugrópóz léptékével készül, így a csibe mindig ugyanakkora; ha a képen extra elem van (láng, érme), a sprite nagyobb lesz (pl. 139×139), és a játék a talppontjához igazítva nagyobbra rajzolja (**128 px = 1 tile**).

**Generálás:** `npm run sprites` — pixelesít (kivágás, területátlag, éles alfa, 16–24 színű paletta) és legyártja a placeholder platformokat/pickupokat. ⚠️ Minden generált fájlt felülír, a kézzel cserélteket is.
