# Krumplisztáni Felhőfutam: Hiperventi Kalandjai

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

| Karakter        | Jelentés                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` vagy ` `    | üres                                                                                                                                                                                                    |
| `#` / `=` / `B` | platform (fű / kék / tégla)                                                                                                                                                                             |
| `P`             | kezdőpozíció (csak a start chunkban)                                                                                                                                                                    |
| `K` | pontkártya (+1 pont), 4 kockás csillogás, erősen lebeg (`bob` a `tiles.ts`-ben) — a pályákon ez szerepel |
| `C` / `X` / `J` | pickup: +1 pont / ×2 pont 10 s / ×2 ugrásmagasság 5 s (méret tile-onként: `size` a `tiles.ts`-ben, alap 0.6; érme 1.2, ×2 ikonok 0.96 — a látható méretük így az érméével egyezik, ezt teszt ellenőrzi) |

Szabályok (a tesztek ellenőrzik): minden sor pontosan `columns` széles, két platformsor között legfeljebb `maxJumpTiles - 1` sor lehet (chunk-határon át is), pickup csak platform fölött állhat. Új tile: `src/game/level/tiles.ts` (a `spriteKey` a későbbi sprite-hoz).

## Veszélyek (hazard)

A `hazard` tile a platform fölött lebeg (`config.hazards.bobTiles` / `bobHz`), az ütközés az engine-ben számolt, lebegő pozícióval történik (a hitbox kicsit kisebb a rajznál: `hitboxScale`). Érintéskor `damage` pontot von le (0 alá nem megy), `hit` eseményt küld (erős rezgés), és `invulnerableMs` ideig nem sebezhető a játékos: először `hurtPoseMs` ideig a `player_hurt` póz látszik (forrás: `chick_hurt.png`), utána a sérthetetlenség végéig villog. Sprite: a `Fruit+.png` gyümölcs-atlasz (16×16-os cellák) egy cellája, ×6 → 128.

## Start: tojás + visszaszámlálás

A játék a kezdőpont fölött középre igazított tojáshéjjal indul (`start_egg`, forrás: `assets/sprite-sources/egg_shell.png`), a csibe mögötte ül. `config.start.countdownMs` (3000) ideig 3 → 2 → 1 visszaszámlálás látszik a képernyő közepén, közben a csibe nem mozdul és az irányítás nem hat; utána `launch` esemény, a csibe kiugrik a tojásból, és rövid ideig „GO!” látszik. A héj a pályán marad. Méret: `eggSizeTiles` (1.5), `eggSinkTiles` (0.1, hogy a csibe lába ne lógjon ki). `countdownMs: 0` = azonnali indulás tojás-ugrás nélkül (a fizikatesztek így futnak).

## Easter eggek (rejtett mémek)

A mémek listája: `src/game/easterEggs.ts` — ide kell felvenni az újakat (az `id` maradjon stabil). Minden mém két részből áll:

- **a pályán látható tárgy** (`item`): `spriteKey` (bármelyik regisztrált sprite), `size` (tile), `placement` (`"ground"`: a platformon áll, `"hover"`: felette lebeg, mint az érme). Ami hiányzik, az a `config.easterEggs.defaultItem`-ből jön (most: töklámpás, 1.125, ground). Pl. `item: { spriteKey: "pickup_coin", placement: "hover" }`.
- **a „megtaláltad” kártya**: `title`, `description`, opcionálisan `heading`, `image`, `imageAspectRatio`, `continueLabel` — ezek egy az egyben az `EasterEggModal` propjai.

Új tárgy-sprite: PNG az `assets/sprites/`-ba (vagy forrásképből a generátorral) + egy sor a `spriteSources`-ba; a tesztek ellenőrzik, hogy minden mém tárgya létező sprite. Drop rate: játékonként egyetlen dobás — `config.easterEggs.chancePerGame` (10%) eséllyel az adott játékban lesz **egy** (soha nem több) mém a pályán, egy véletlen pályaszakasz szabad platformmezőjén a `chunkRange` (2.–12. szakasz, ~6–36 pont) tartományban, hogy normál játékban elérhető legyen. Átlagosan minden 10. játékban van, de véletlenszerűen (nem garantáltan minden 10.-ben). Felvételkor `easterEgg` esemény: a játék megáll, és megjelenik az `EasterEggModal` (`src/components/game/EasterEggModal.tsx`), a „Tovább” gomb folytatja.

Az `EasterEggModal` nem tud a játékról, minden tartalma propból jön: `title` és `onContinue` (kötelező), `heading`, `description`, `image` (+ `imageAspectRatio`), `continueLabel`, valamint `children` bármilyen egyedi tartalomhoz. A mémek adattípusa (`EasterEgg`) ugyanezeket az opcionális mezőket tartalmazza, így mémenként felülírható a fejléc, a gombfelirat, vagy kép adható hozzá, pl. `image: require('@/assets/memes/doge.png')`.

## Halál

Amikor a csibe talpa eléri a képernyő alját, `death` esemény (erős rezgés) és haláljelenet indul: csontváz (`player_hurt`) póz, `hurtPoseMs` után villogás, egy utolsó, magas felugrás (`config.death.jumpFactor`, ~1,45× egy normál ugrás) véletlen oldalirányú ívben (`driftSpeed`, véletlen irány; arra is néz), majd zuhanás ernyő nélkül. Közben nincs irányítás, ütközés, pontozás, a kamera áll. Ha a csibe `exitMarginTiles`-nyira a képernyő alá esett, jön a `gameOver`.

## Mérföldkő: csillagrobbanás

Amikor a pontszám először eléri a `config.milestones.every` (100) többszörösét, a csibéből 7–10 ötágú csillag (`effect_star`, fele kicsi, fele nagy) robban szét, `milestone` esemény + „siker” rezgés. Ha a pont egy narancs miatt visszaesik és újra eléri a határt, nem ismétlődik. A csillagok pozícióját az idő határozza meg (kirepülés, visszahúzó gravitáció, a végén zsugorodás). Tűzijátékként a pályán ott marad, ahol a csibe épp volt a robbanáskor; a csibe továbbrepül. Beállítások: darabszám, méretek, sebesség, gravitáció, élettartam.

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

## Háttér

A játék hátterében a `bg_sky` égbolt látszik (forrás: `assets/sprite-sources/sky.png`, a generátor változatlanul másolja). A képernyő 1,5-szerese magasan rajzolódik, oldalt levágva, és nagyon lassú parallaxszal csúszik lefelé, ahogy a csibe mászik (`config.background`: `heightScreens`, `parallax`). Az elején az alja (a felhőpad) látszik; amikor a teteje eléri a képernyő tetejét, megáll, fölötte a vászon a kép felső színével folytatódik. Előtte maradnak a kis felhők (gyorsabb parallax).

## Sprite-ok és animációk

Minden grafika az `assets/sprites/` mappában van, a **fájlnév = spriteKey** (lista: `src/game/render/sprites.ts`).

- Méret: **128×128 px képkockánként** (négyzetes kockák; a karakterpózok lehetnek nagyobbak, lásd lent), átlátszó háttér (a felhő 256×128). A renderer nearest-neighbour szűréssel skáláz, így a pixel art éles marad.
- **Animáció = sprite sheet** (időalapú: `fps`/`loop`, vagy ugrásnál sebességalapú: `"mode": "velocity"`): a képkockák egy PNG-ben, vízszintesen egymás mellett (pl. 6 kocka → 768×128). A kockaszám, fps és ismétlés az `assets/sprites/animations.json`-ban van, kézzel szerkeszthető. Ami nincs benne, az egyetlen kép.
- Platformok: `platform_<variant>_{left,mid,right,single}` — a sprite **felső éle** a járható felület.
- Karakter (csibe): `player_jump` (ugrás), `player_fall` (esernyő: csak ha a csúcsponthoz képest legalább fél platformnyit — `config.player.fallPoseAfterTiles`, alapból 1.5 tile — zuhant; ekkor az esés az ernyőn siklásra lassul: `glideSpeedFactor` 1/3, `glideDrag`), bónusz pózok. Mind **jobbra néz**, balra a renderer tükrözi; a talp a kép alján legyen.
- **Bónuszonként más póz**: pickup után 600 ms-ig (`config.player.bonusPoseMs`) a `player_bonus_<pickup neve>` látszik (pl. `pickup_coin` → `player_bonus_coin`); ha ilyen nincs, a `player_bonus`.
- Procedurális mozgás (képkocka nélkül): felugráskor enyhe összenyomódás (12%), emelkedés közben nyúlás (6%), a pickupok lebegnek.

**Csere:** írd felül a PNG-t azonos néven (ha animált, a kockaszámot is frissítsd az `animations.json`-ban), majd `npx expo start -c`. Új sprite: PNG + egy sor a `spriteSources`-ba. Hiányzó kép helyén magenta négyzet jelenik meg; a tesztek ellenőrzik, hogy a PNG szélessége = kockaszám × 128.

**Karakter forrásképek** (`assets/sprite-sources/`, tetszőleges méretű, átlátszó hátterű PNG):

- `chick_run.png` → `player_jump`: **2 kocka, az ugrás fázisa szerint** (`"mode": "velocity"`): felfelé az első (terpesz), földet éréskor és lefelé az utolsó (összezárt láb). A csíkból a `sourceFrames` kockái kerülnek be (most `[0, 1]`). Kockák balról jobbra, **átlátszó hézaggal elválasztva** (nem kell egyenletes rács); közös lépték, talpvonal és paletta.
- `chick_jump.png` → `player_jump`, ha nincs `chick_run.png`. Ez adja a léptéket a többi pózhoz: a tartalma = 128×128 = 1 tile.
- `chick_fall.png` → `player_fall` (most: esernyős csibe; ha nincs, az ugrópóz). Mivel a forrásképeken nem ugyanakkora a csibe, a generátorban pózonkénti léptékszorzó korrigál (`FALL_SOURCE_SCALE`), a középre igazítás pedig csak a test sávját nézi (`centerBand`), hogy a fej fölötti esernyő ne húzza el.
- `chick_run_<effekt>.png` → `player_jump_<effekt>`: ugrás animáció, amíg az időzített effekt aktív (most: `chick_run_double_jump.png` → kék lángoló futás a dupla ugrás 5 mp-e alatt). Ugyanolyan csík, mint a `chick_run.png`, és ugyanabban a léptékben készül; a lángok miatt nagyobb kocka (177 px) a talpponthoz igazítva.
- `chick_bonus.png` → minden bónusz póz; típusonként felülírható: `chick_bonus_coin.png`, `chick_bonus_double_score.png`, `chick_bonus_double_jump.png` (ez már megvan: kék lángoló csibe). A kék/cián effekt-pixeleket (láng, szikra) a script figyelmen kívül hagyja a középre igazításnál, így a csibe mindig középen van.
- A többi póz az ugrópóz léptékével készül, így a csibe mindig ugyanakkora; ha a képen extra elem van (láng, érme), a sprite nagyobb lesz (pl. 139×139), és a játék a talppontjához igazítva nagyobbra rajzolja (**128 px = 1 tile**).

**Generálás:** `npm run sprites` — pixelesít (kivágás, területátlag, éles alfa, 16–24 színű paletta) és legyártja a placeholder platformokat/pickupokat. ⚠️ Minden generált fájlt felülír, a kézzel cserélteket is.
