# Hiperventi in Krumplisztan – Executable TODO

> Vertikális, végtelen "jump platform" játék (Doodle Jump / Climber stílus) Expo + React Native alapon.
> Minden lépés után: `npx tsc --noEmit` + `npm test` zöld legyen, mielőtt a következőre lépünk.
> Jelölés: `[ ]` nyitott, `[x]` kész.

---

## 0. Architektúra-döntések (javaslat)

| Terület       | Döntés                                                                          | Indok                                                                                                              |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Keretrendszer | Expo SDK 57, TypeScript strict, **expo-router**                                 | fájlalapú routing, a 4 screen triviálisan leképezhető                                                              |
| Renderelés    | **@shopify/react-native-skia** Canvas                                           | 60fps sok négyzetnél is; iOS + Android + Expo Go kompatibilis; később sprite-ok (`<Image>` / atlas) cserélhetők be |
| Game loop     | Saját fix timestepes loop (`requestAnimationFrame`, dt clamp), tiszta TS engine | a `react-native-game-engine` nem karbantartott; a saját engine unit-tesztelhető                                    |
| Input         | **react-native-gesture-handler** `Gesture.Pan()` a teljes képernyőn             | relatív drag → csak X elmozdulás                                                                                   |
| Állapot       | **Zustand** (+ `persist` middleware + AsyncStorage)                             | app-szintű állapothoz elég, kevesebb boilerplate mint az RTK. A játékvilág NEM storeban van (ref-ben, perf miatt)  |
| UI (menük)    | **gluestack-ui** + NativeWind (Tailwind)                                        | a kért tailwind UI                                                                                                 |
| Perzisztencia | `@react-native-async-storage/async-storage`                                     | leaderboard / korábbi statisztikák lokálisan                                                                       |
| Teszt         | `jest-expo` + `@testing-library/react-native`                                   | engine logika (ütközés, wrap, pontozás, pickupok) tesztelve                                                        |

---

## 1. Projekt scaffold

- [x] 1.1 A meglévő `package.json` mentése (author: Zsolt Takács, name) → `npx create-expo-app@latest` egy ideiglenes mappába (`--template default`), a fájlok átmozgatása ide, `author` visszaírása
- [x] 1.2 Template példakód eltávolítása (`npm run reset-project` vagy kézzel), üres `app/` marad
- [x] 1.3 `app.json`: name `Hiperventi in Krumplisztán`, slug `the-hiperventi-game`, `orientation: "portrait"`, `userInterfaceStyle`, splash háttérszín (égkék `#2E8BEA`)
- [x] 1.4 `tsconfig.json`: `strict: true`, path alias `@/*` → `src/*`
- [x] 1.5 `git init` + `.gitignore` + első commit
- **Ellenőrzés:** `npx expo start` → Expo Go-ban üres app betölt

## 2. Függőségek telepítése (mindig `npx expo install`)

- [x] 2.1 Játék: `npx expo install @shopify/react-native-skia react-native-reanimated react-native-gesture-handler react-native-worklets`
- [x] 2.2 Állapot + tárolás: `npx expo install zustand @react-native-async-storage/async-storage`
- [x] 2.3 UI: gluestack-ui init (`npx gluestack-ui init`) → NativeWind + tailwind config; szükséges komponensek: `button`, `text`, `heading`, `box`, `vstack`, `hstack`, `pressable` (`npx gluestack-ui add ...`)
- [x] 2.4 Splash: `npx expo install expo-splash-screen expo-haptics`
- [x] 2.5 Dev: `npx expo install -- --save-dev jest-expo jest @testing-library/react-native @types/jest`; `package.json` → `"test": "jest"`, `"typecheck": "tsc --noEmit"`, `"lint": "expo lint"`
- [x] 2.6 `npx expo-doctor` → 0 hiba
- **Ellenőrzés:** `npx expo start` indul, `npm test` fut (0 teszt is OK)

## 3. Skillek telepítése (skills.sh, projekt scope-ba)

- [x] 3.1 `npx skills add vercel-labs/agent-skills --skill vercel-react-native-skills`
- [ ] 3.2 `npx skills add expo/skills --skill expo-tailwind-setup` (NativeWind setup – lokálisan még nincs meg) — ⚠️ a skill törölve lett az expo/skills repóból (skills.sh index elavult), nem telepíthető; a NativeWind setupot a gluestack skill fedi
- [x] 3.3 `npx skills add gluestack/agent-skills --skill gluestack-ui-v5` (a 2.3-ban telepített gluestack verziója alapján v4 vagy v5)
- [x] 3.4 `npx skills add wshobson/agents --skill react-state-management` (Zustand/RTK minták)
- [x] 3.5 (opcionális) `npx skills add emilkowalski/skills --skill animate-expo` (menü animációk)
- [x] 3.6 `npx skills ls` → a lista ellenőrzése, `skills-lock.json` commitolása
- Megj.: a többi Expo skill (router, native-ui, animation, design-system) már elérhető a Claude Code Expo pluginból, azokat nem duplikáljuk

## 4. Mappastruktúra

```
app/
  _layout.tsx          # GestureHandlerRootView, GluestackUIProvider, Stack (header nélkül)
  index.tsx            # Splash / loading screen
  menu.tsx             # Start Game / Leaderboard
  game.tsx             # Game screen
  leaderboard.tsx      # Korábbi eredmények
src/
  game/
    engine/            # tiszta TS, NINCS RN import → unit-tesztelhető
      types.ts         # Vec2, Rect, Entity, Tile, GameState
      physics.ts       # gravitáció, auto-jump, one-way ütközés, wrap-around
      world.ts         # World: step(dt, input), entitások, kamera
      camera.ts        # csak felfelé követ, smoothing
      scoring.ts       # platformszámlálás, szorzók
      effects/
        EffectRegistry.ts   # absztrakt handler: register/apply/tick/expire
        builtins.ts         # addBonus(n), doubleScore(), doubleJumpHeight()
    level/
      tiles.ts         # tile legenda (char → TileDef)
      chunks.ts        # kézzel írt mátrix chunkok (string[])
      parser.ts        # string mátrix → entitások (tile koordináta → world px)
      generator.ts     # végtelen pálya: chunkok egymásra fűzése nehézség szerint
      levelConfig.ts   # tileSize, oszlopszám, player/physics/camera konfig
    render/
      GameCanvas.tsx   # Skia Canvas: háttér, tile-ok, player, pickupok
      TileView.tsx     # tile → színes négyzet (később sprite)
      PlayerView.tsx   # négyzet + image placeholder ikon
    input/
      useDragInput.ts  # Pan gesture → relatív dx
    hooks/
      useGameLoop.ts   # rAF loop, fix timestep, pause
  store/
    useAppStore.ts     # Zustand: history[], bestScore, settings; persist(AsyncStorage)
  components/          # HUD (score, height, pause), GameOverModal, PauseModal
  theme/colors.ts      # tile színek, égkék, HUD színek
```

## 5. Pályarendszer (mátrix konfig) – tesztekkel

- [x] 5.1 `tiles.ts` tile legenda:
  - `" "` üres, `"#"` fű platform (zöld), `"="` kék platform, `"B"` tégla platform (piros-barna)
  - `"P"` játékos kezdőpozíció, `"C"` érme (+1), `"X"` pontszorzó (x2), `"J"` jump booster
  - Minden `TileDef`: `{ kind: 'platform'|'pickup'|'spawn', color, spriteKey?: string, solid, oneWay, effect?: EffectId }` → a `spriteKey` a későbbi sprite cseréhez
- [x] 5.2 `levelConfig.ts` a mintakód szerinti szerkezet: `id, name, tileSize, columns, player{width,height,speed,jumpForce,gravity}, physics{solidTiles, collectibleTiles…}, camera{followPlayer, smoothing, bounds}`
  - `columns = 9` (konfigurálható), `tileSize = screenWidth / columns` (runtime számolt)
- [x] 5.3 `chunks.ts`: legalább 8 chunk, nehézségi szinttel (`difficulty: 0..3`), fentről lefelé olvasva, pl.:

  ```ts
  { id: 'easy-01', difficulty: 0, map: [
    "         ",
    "   ###   ",
    "         ",
    "         ",
    "      == ",
    "         ",
    "         ",
    " ###C    ",
  ]}
  ```

  - Szabály: két egymást követő platformsor közötti függőleges távolság ≤ max ugrásmagasság (validáló teszt!)

- [x] 5.4 `parser.ts`: egymás melletti azonos platform-tile-ok → egy platform entitás (merge), pickup a platform fölötti cellában
- [x] 5.5 `generator.ts`: a kamera fölött mindig ≥ 1,5 képernyőnyi pálya legyen; chunkok véletlenszerű sorrendben; nehézség = f(magasság) → egyre keskenyebb platformok (4 → 3 → 2 → 1 tile); a képernyő alatt elhagyott entitások törlése
- [x] 5.6 Tesztek: parser (merge, spawn, pickup pozíció), generator (elérhetőség, nehézség-növekedés, determinisztikus seeddel)

## 6. Fizika & játékmenet – tesztekkel

- [x] 6.1 Auto-jump: platformra érkezéskor `vy = -jumpForce`; a `jumpForce`/`gravity` úgy hangolva, hogy max magasság ≈ 4 tile (konfigurálható `maxJumpTiles`), platformsorok között 2–3 tile
- [x] 6.2 One-way platform: ütközés csak ha `vy > 0` ÉS az előző frame-ben a láb a platform teteje fölött volt → alulról átugorható
- [x] 6.3 Wrap-around: `x < -w/2` → jobb oldalra, `x > screenW - w/2` → bal oldalra; renderben a széleken átlógó karakter kétszer rajzolva (seamless)
- [x] 6.4 Drag input: `pan.changeX * sensitivity` (alapból `1.0` → annyit mozog, amennyit húz) → player.x (csak X), nincs szükség a karakter érintésére; ujj felengedésekor rövid kicsúszás (inertia, konfigurálható `releaseFriction`); a Y irányú húzás figyelmen kívül marad
- [x] 6.5 Kamera: csak felfelé mozog, a player a képernyő felső ~40%-ánál húzza a kamerát; smoothing a konfigból
- [x] 6.6 Game over: player.y > camera.bottom → `gameOver` (akár leesett, akár a kamera "elhagyta")
- [x] 6.7 Pontozás: minden **új, korábbinál magasabb** platformra érkezés = 1 pont × aktív szorzó (csak lábbal, felülről érkezve); ugyanarra a platformra visszaérkezés nem ad pontot
- [x] 6.9 Tesztek: one-way ütközés (felülről ráesik / alulról átmegy), wrap mindkét irányba, game over, pontozás (új platform +1, régi 0)

## 7. Pickup / effekt rendszer (absztrakt handler) – tesztekkel

- [x] 7.1 Interfész:
  ```ts
  interface GameEffectContext {
    addScore(n: number): void;
    setScoreMultiplier(m: number): void;
    setJumpMultiplier(m: number): void;
    now(): number;
  }
  interface EffectDef {
    id: EffectId;
    durationMs?: number;
    apply(ctx): void;
    expire?(ctx): void;
  }
  class EffectRegistry {
    register(def);
    trigger(id);
    tick(now);
    active(): ActiveEffect[];
  }
  ```
- [x] 7.2 Beépített effektek: `addBonus(n)`, `doubleScore()` (időzített, pl. 10 s), `doubleJumpHeight()` (időzített, pl. 5 s)
- [x] 7.3 Pickup ütközés (AABB) → `registry.trigger(tile.effect)` → pickup eltűnik
- [x] 7.4 HUD mutatja az aktív effekteket (ikon + hátralévő idő)
- [x] 7.5 Tesztek: trigger, lejárat, egymásra halmozás (újra felvett effekt frissíti az időt)

## 8. Renderelés (Skia, színes négyzetek)

- [x] 8.1 Háttér: égkék gradiens + néhány fehér "felhő" téglalap (parallax 0.3)
- [x] 8.2 Platform tile: színes négyzet, felső sáv árnyalattal (fű = zöld/barna, kék = kék/sötétkék, tégla = piros-barna)
- [x] 8.3 Player: négyzet + benne image placeholder (keret + átló / "🖼" ikon), kb. 0.8 tile
- [x] 8.4 Pickupok: kisebb színes négyzetek (érme sárga, x2 lila, jump cián)
- [x] 8.5 Csak a látható tile-ok renderelése (culling)
- [x] 8.6 Perf: frame-enként NEM React state-et frissítünk; a kamera/player pozíció Reanimated `SharedValue`-ban (Skia közvetlenül olvassa), a statikus tile-ok csak chunk-generáláskor renderelődnek újra; a HUD pontszám max ~10×/s frissül
- [ ] 8.7 Mérés: Android középkategóriás eszközön ≥ 55 fps (perf monitor); ha nem éri el → a loop átköltözik `useFrameCallback` workletbe — valós Android eszközön még mérendő

## 9. Screenek

- [x] 9.1 **Splash** (`app/index.tsx`): "Hiperventi in Krumplisztán" felirat, loading indikátor; store hidratálás + asset preload után (min. ~1,5 s) → `router.replace('/menu')`
- [x] 9.2 **Menu**: cím, `Start Game` → `/game`, `Leaderboard` → `/leaderboard`; gluestack Button-ok
- [x] 9.3 **Game**: teljes képernyős Canvas + Pan gesture, HUD (bal felül pause gomb, középen pontszám/magasság)
  - Pause modal: Resume / Restart / Menu
  - Game over modal: pont, magasság, best; Play again / Menu; eredmény mentése a store-ba
  - App háttérbe kerülésekor automatikus pause (`AppState`)
- [x] 9.4 **Leaderboard**: korábbi játékok listája (FlatList), rendezve pont szerint; mezők: pont, magasság, dátum, időtartam, felszedett pickupok; best kiemelve; "Clear history" gomb (megerősítéssel)

## 10. Store (Zustand)

- [x] 10.1 `useAppStore`: `history: GameResult[]`, `addResult()`, `clearHistory()`, `bestScore` (derived), max 50 elem megtartása
- [x] 10.2 `persist` + `createJSONStorage(() => AsyncStorage)`, `hasHydrated` flag a splash-nek
- [x] 10.3 Teszt: addResult rendezés/limit

## 11. Verifikáció

- [x] 11.1 `npm run typecheck`, `npm test`, `npm run lint`, `npx expo-doctor` → mind zöld
- [ ] 11.2 Kézi teszt iOS szimulátoron + Android emulátoron (Expo Go): splash → menü → játék → game over → leaderboard-ban megjelenik az eredmény; app újraindítás után is megmarad — ✅ iOS szimulátoron ellenőrizve (Expo Go, SDK 57); Android még hátravan
- [ ] 11.3 Kézi checklist: wrap mindkét oldalon, alulról átugrás, felülről megállás, egyre keskenyebb platformok, pickup aktiválódik, pause működik — drag/wrap/pickup kézi tesztje eszközön még hátravan (szimulátorban nem volt tap/drag automatizálás); logikailag unit tesztek fedik
- [x] 11.4 README: futtatás, pályaszerkesztés (chunk formátum), új effekt regisztrálása

---

## Döntések (2026-09-26)

1. Ugrásmagasság max 4 tile – konfigurálható
2. 9 oszlop – konfigurálható
3. Nincs magasság kijelzés, csak pontszám
4. Pont csak új platform lábbal érintéséért; szorzó-pickup duplázhatja
5. Drag elengedése után rövid kicsúszás
6. Chunkok véletlenszerű sorrendben
7. doubleScore 10 s, doubleJumpHeight 5 s
8. Zustand
9. Expo Go
10. Skill lista elfogadva

## Eltérések a tervtől (végrehajtás közben)

- SDK 57 sablon a `src/app/`-ot használja a routinghoz → screenek: `src/app/{index,menu,game,leaderboard}.tsx`
- UI: gluestack-ui **v5** + NativeWind v5 (Tailwind v4, `src/global.css` tokenek, új `sky` token)
- Drag kicsúszás: a felengedéskori gesztus-sebességből (`velocityX`) indul, nem frame-deltából
- Auto-scroll: az első pont után a képernyő lassan magától is emelkedik (`camera.autoScrollSpeed`, 0 = kikapcsolva) → „ha nem halad tovább és elhagyja a képernyő alját” eset
- Renderelés: a JS loop egy lapos draw-listát ír egy Reanimated SharedValue-ba, a Skia a UI szálon rajzolja SkPicture-be (nincs React render frame-enként)
- `@react-native/jest-preset` 0.86-ra rögzítve (az `expo install` 0.87-et hozott, ami nem kompatibilis RN 0.86-tal)

---

# Epic 2 – Sprite-ok (2026-09-26)

Döntések: 128×128 PNG pixel art (16×16 logikai pixel × 8 nagyítás, retinán 64pt élesen), generált placeholder képek (később cserélhetők), karakter-állapotok, platform szélek külön sprite-tal.

- [x] S1 Generátor script: `scripts/sprites/generate.mjs` (pngjs), `npm run sprites` → `assets/sprites/*.png`; minden sprite 16×16 karakter-mátrix + paletta → 128×128 nearest-neighbour nagyítás
- [x] S2 Sprite lista:
  - platform: `platform_{grass,blue,brick}_{left,mid,right,single}` (12 db)
  - pickup: `pickup_coin`, `pickup_double_score`, `pickup_double_jump`
  - player: `player_jump`, `player_fall`, `player_bonus` (jobbra néz; balra = tükrözés a rendererben)
  - háttér: `cloud` (256×128)
- [x] S3 Sprite regiszter `src/game/render/sprites.ts`: `spriteKey → require(png)`, típusos `SpriteKey`, index-sorrend a draw listához
- [x] S4 Betöltés: `loadSprites()` (Skia `Data.fromURI` + `MakeImageFromEncoded`), modul-szintű cache; splash megvárja; game screen fallback ha közvetlenül nyílik
- [x] S5 Engine: `player.facing` (utolsó vízszintes irány), `bonusUntil` (pickup után 600 ms bonus állapot); `playerSpriteKey(world)` tiszta függvény
- [x] S6 Snapshot: új opok `3 = sprite`, `4 = sprite tükrözve`; platform tile → `_left/_mid/_right/_single`; pickup → `spriteKey`; felhő → `cloud`
- [x] S7 GameCanvas: `drawImageRectOptions(..., FilterMode.Nearest, MipmapMode.None)`, hiányzó kép → magenta négyzet (jól látható hiba)
- [x] S8 Tesztek: edge-sprite választás, player állapot (jump/fall/bonus/facing), minden `spriteKey` a tiles.ts-ben létezik a regiszterben, generátor mátrixok 16×16-osak
- [x] S9 Ellenőrzés: tsc, jest, lint, iOS szimulátor screenshot
- [x] S10 README: sprite csere leírása (fájlnév = spriteKey, 128×128 PNG, átlátszó háttér)

Megjegyzések:
- A Skia-betöltés külön fájlban van (`render/loadSprites.ts`), így a regiszter és a snapshot Skia nélkül tesztelhető
- A karakter hitboxa 0.8 → 0.9 tile lett, hogy illeszkedjen a sprite-hoz
- S9: iOS szimulátoron ellenőrizve (jump/fall állapot, platform szélek, coin, felhők); a bonus pose és a tükrözés csak unit teszttel ellenőrizve (nincs drag a szimulátorban)

---

# Epic 3 – Animációk + csibe karakter (2026-09-26)

- [x] A1 Sprite sheet támogatás: vízszintes képkockák, kézzel írt leírás `assets/sprites/animations.json` (frames, fps, loop), a generátor és a játék is ezt olvassa
- [x] A2 Renderer: draw command bővült `frame`/`frames` mezővel (STRIDE 8), a forrás-téglalap a sheetből vág
- [x] A3 Csibe: `assets/sprite-sources/chick_jump.png` → pixelesítés (bbox kivágás, 128×128 területátlag, éles alfa, 16 színű k-means) → `player_jump`, `player_fall`, bónusz pózok
- [x] A4 Bónuszonkénti póz: `player_bonus_<pickup>` (coin / double_score / double_jump), 4 kockás színes csillogás; fallback `player_bonus`
- [x] A5 Animált pickupok: érme pörgés (6), ×2 pulzálás (4), dupla ugrás nyilak (4) + lebegés
- [x] A6 Procedurális squash & stretch (felugrás/emelkedés)
- [x] A7 Tesztek (80 db): frame választás, PNG szélesség = frames×128, bónusz póz + fallback, squash & stretch
- [x] A8a Bónusz póz saját rajzzal: `chick_bonus.png` (láng + érme), minden bónusz típus ezt használja; 139×139, ugrópóz léptékével, talpponthoz igazítva (renderer: 128 px = 1 tile)
- [x] A8b Esés póz: `chick_fall.png` → `player_fall` (135×135, ugrópóz léptékével); szimulátorban ellenőrizve (jump → fall → jump)
- [x] A8c Ugrás futóciklus: `chick_run.png` (4 kocka, automatikus szétvágás az átlátszó hézagoknál, közös lépték/talpvonal/paletta, test-súlypontra igazítva) → `player_jump` 4 kocka, 10 fps, loop; szimulátorban ellenőrizve
- [x] A8e Esés póz csak valódi zuhanásnál: a csúcsponttól (`player.apexY`) mért ≥ `fallPoseAfterTiles` (3 tile = 1 platform) esés után; normál ugrásnál a futóciklus marad; tesztekkel + szimulátorban ellenőrizve
- [x] A8f Dupla ugrás boost: felvételkor `chick_bonus_double_jump.png` póz (146 px), utána az effekt 5 mp-e alatt `chick_run_double_jump.png` → `player_jump_double_jump` (4 kocka, 177 px, a futóciklus léptékében); általános szabály: aktív effekt + létező `player_jump_<effekt>` sprite; pixelizer: kis levált szegmensek összevonása, igazítás a nem-kék pixelekre; tesztek + szimulátor (érintés nélkül középen)
- [x] A8g Esés póz küszöbe fél platformtávolság: `fallPoseAfterTiles` 3 → 1.5
- [x] A9 Nyugodtabb ugrás: 2 kocka sebesség szerint (`mode: velocity`, `sourceFrames: [0,1]`) a futó és a lángoló futó animációra; squash 22% → 12%, stretch 10% → 6%; ugrásonként max. 1 kockaváltás (teszt + szimulátor)
- [x] A10 Érme art: `gold_spin.png` (7×25px) → `pickup_coin` 7 kocka 12 fps loop; `gold_collect.png` (6×25px) → `pickup_coin_collect` 6 kocka 15 fps egyszeri, a felvétel helyén (`world.collected`, 1,5 s TTL); rács-import ×5 + 128-as kiegészítés; tesztek + szimulátor
- [x] A11 Ugrás fázisai: földet érés (összenyomódás alatt) = összezárt láb, emelkedés végig = terpesz, csúcs után lefelé = összezárt láb (`jumpProgress` + velocity mód: utolsó kocka = lefelé); lángoló ugrás `sourceFrames [0,2]`
- [x] A12 Pickup méret típusonként (`TileDef.size`, alap 0.6); érme 1.2 (rajz + ütközés + felvételi animáció)
- [x] A13 Elasztikus húzás: az ujj 1:1-ben a célpontot mozgatja, csillapított rugó húzza utána a csibét (`followFrequency` 16, `followDamping` 0.7: kis késés + enyhe túllendülés); elengedéskor a célpont a dobás irányába tolódik (kicsúszás); tesztek, eszközön még kipróbálandó
- [ ] A8d Valódi art: `chick_bonus_double_score.png` (a ×2 pont póz most az érmés); a pózok közti méretarány finomhangolása, ha eszközön zavaró
- [ ] A9 Eszközön: bónusz póz, tükrözés és squash kézi ellenőrzése

Megjegyzés: az `assets/sprites/Fruit+.png` (608×96 gyümölcs sheet) kézzel került be, a kód nem használja.

---

# Epic 4 – Veszélyek: narancs (2026-09-26)

- [x] H1 Sprite: `Fruit+.png` (áthelyezve `assets/sprite-sources/`-ba) 9. oszlop / 1. sor → `hazard_orange` (×6, 128-ra kiegészítve); `gridCell` import
- [x] H2 Tile `O` (`kind: 'hazard'`, size 1.2), parser + engine: lebegés (`bobTiles` 0.35, `bobHz` 0.5, egyedi fázis), AABB ütközés 75%-os hitbox-szal
- [x] H3 Találat: −1 pont (min. 0), `hit` esemény + erős haptika, 1 mp sérthetetlenség villogással, `stats.hits`
- [x] H4 Pályák: `easy-04`, `mid-04`, `hard-03` naranccsal; szabály + teszt: csak ≥ 3 széles platform fölé
- [x] H5 Tesztek (hazards.test.ts): lebegés, pontlevonás, 0 alsó korlát, sérthetetlenség, villogás, sprite
- [x] H6a Esés póz csere: esernyős csibe (`chick_fall.png`), léptékkorrekció 0.85 (szemméret alapján), igazítás a test alsó 70%-ára
- [x] H6 `player_hurt`: `chick_hurt.png` (villámsújtott csontváz) → 134×134, ugrópóz léptékében; találat után 0,5 mp folyamatos sérült póz, majd villogás a sérthetetlenség végéig; teszt + szimulátor
- [x] H8 Esernyős siklás: nyitott ernyővel (esés póz) az esési sebesség a nyitáskori harmadára lassul (~3,6 tile/s), ~0,1 mp alatt fékez, nem lendül túl; normál ugrást nem érinti (`isFalling` közös az engine-ben és a rajzolásban); tesztek
- [ ] H7 Eszközön kipróbálni: nehézség, hitbox érzet
