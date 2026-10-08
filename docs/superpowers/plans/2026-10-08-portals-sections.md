# Portálok és pályaszekciók – végrehajtási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cél:** A játék szekciókra bomlik. Egy ritka portál a függőleges pályáról egy oldalnézetes, automatikusan futós bónuszpályára visz, ahol koppintásra ugrik a csibe. A bónuszpálya végén egy portál visszavisz a függőleges pályára, oda, ahonnan a játékos elindult.

**Architektúra:**
- A `World` osztály marad a játék belépési pontja: ő a „menet” (Run). Övé a közös állapot: idő, pontszám, szorzók, effektek, statisztika, mérföldkő, rng, átmenet.
- A pályaszabályok szekciókba kerülnek: `VerticalSection` (a mostani játék) és `SideSection` (bónuszpálya).
- A `World` homlokzat-getterekkel (`player`, `platforms`, `cameraY` …) a függőleges szekciót mutatja, így a meglévő kód és tesztek változatlanul működnek.
- A rajzolás szekciónként válik szét (`snapshotVertical`, `snapshotSide`).

**Tech stack:** TypeScript, saját játékmotor (`src/game/engine`), Skia draw list (`src/game/render`), Expo Router képernyő (`src/app/game.tsx`), Jest.

**Spec:** [PLAN-portals-sections.md](../../../PLAN-portals-sections.md) (a 2026-10-06-i döntésekkel).

## Global Constraints

- Ugrás a bónuszpályán: **koppintásra**, automatikus futás, a hosszabb nyomás magasabb ugrást ad.
- A függőleges menet a bónusz alatt **megáll, és ugyanott folytatódik**. Visszatéréskor a csibe a portál platformján érkezik, rövid védettséggel.
- Bónuszpálya: **csak jutalom, nincs halál.** A narancs pontot von le, mint most.
- Portál: **ritka esemény**, menetenkénti esély és pályaszakasz-tartomány alapján. Legfeljebb egy menetenként, és nem ütközhet az easter eggel.
- Nyitott kérdések, a spec javaslata szerint eldöntve:
  - ernyő a bónuszpályán: **bekapcsolva**;
  - pont a megtett távolságért: **nincs**, csak kártya és teljesítési bónusz;
  - mérföldkő: **a tűzijáték mindkét szekcióban jön**, a platformtéma csak a függőleges pályán vált (visszatéréskor a csibe fölötti platformok átváltanak).
- Fekvő tájolás nincs. A bónuszpálya kizoomolt nézetben megy (`side.viewColumns`).
- A meglévő 244 teszt minden fázis után zöld.
- A 6. fázis (easter egg titkos pályán, adatbázis-config) **nincs benne** ebben a körben.

## Review Focus

1. **Visszatérés után azonnali halál:** ha a portál a képernyő alján volt, vagy közben lement a kamera, a csibe nem halhat meg rögtön. A visszatérés után 2 mp-ig nincs automatikus görgetés, és nincs narancs-sérülés. → 4. feladat, teszt: „visszatérés után nem hal meg és nem sérül”.
2. **Szünet vagy háttérbe kerülés a bónuszpályán / átmenet közben:** a játékképernyő a szünetkor nem léptet, ezért nem kell külön kezelni. Az átmenet viszont nem akadhat el. → 4. feladat, teszt: „az átmenet a megadott idő alatt lezajlik, és utána a cél szekció aktív”.
3. **Koppintás a visszaszámlálás vagy az átmenet alatt:** ne indítson ugrást a bónuszpálya elején. → 3. feladat, teszt: „a belépés előtti lenyomás nem ugrik”.
4. **Effekt lejár a bónuszpályán:** a ×2 pont és a dupla ugrás a közös idővel jár le, mindkét szekcióban hat. → 4. feladat, teszt: „a ×2 pont a bónuszpályán is duplán számol”.
5. **Hosszú nyomva tartás:** nem ugrik újra magától, ha a csibe nyomott ujjal ér földet. Új ugrás csak új koppintásra jön (ugrás-pufferrel). → 3. feladat, teszt.

---

## Fájlszerkezet

| Fájl | Felelősség |
|---|---|
| `src/game/engine/entities.ts` (új) | Közös entitástípusok (`Player`, `Platform`, `Pickup`, `Hazard`, `Burst`, `EasterEggItem`, `Portal`, `CollectedPickup`, `StepInput`, `TapState`, `GameEvent`) |
| `src/game/engine/collide.ts` (új) | `overlapsX` (henger), `overlapsLine`, `touches(player, box, columns?)`, `landingPlatform(...)`, `applyGravity(...)` |
| `src/game/engine/sections/Section.ts` (új) | `Section` interfész, `RunContext` |
| `src/game/engine/sections/VerticalSection.ts` (új) | A mostani függőleges logika és a portál elhelyezése |
| `src/game/engine/sections/SideSection.ts` (új) | Bónuszpálya: futás, ugrás, talaj, pályaépítés, végportál |
| `src/game/engine/World.ts` (átírva) | Run: közös állapot, mérföldkő, szekcióváltás, átmenet, homlokzat |
| `src/game/level/sideChunks.ts` (új) | Vízszintes pályadarabok (induló, közepes, záró `G` portállal) |
| `src/game/level/tiles.ts`, `parser.ts` | `portal` csempetípus (`G`), `ParsedChunk.portals` |
| `src/game/config.ts` | `side`, `portals` konfiguráció |
| `src/game/render/snapshot.ts` | `buildSnapshot` → `snapshotVertical` / `snapshotSide` + átmenet-réteg |
| `src/game/render/GameCanvas.tsx`, `src/theme/colors.ts` | Új rajzolási művelet: áttetsző kitöltés (az átmenethez) |
| `src/game/input/TapInput.ts` (új) | Lenyomás / felengedés gyűjtése lépésenként |
| `src/app/game.tsx`, `src/components/game/Hud.tsx` | Koppintás-bemenet, portálhang, a bónusz haladásjelzője |
| `scripts/sprites/generate.mjs`, `assets/sprites/animations.json`, `src/game/render/sprites.ts` | Helyőrző portál sprite (animált), regisztráció |
| `src/lib/audio.ts` | `portal` effekt (amíg nincs saját hang: a bónusz-csilingelés) |

---

### Task 1: Közös típusok és ütközés-segédek kiemelése (viselkedés nem változik)

**Fájlok:** Létrehozás: `entities.ts`, `collide.ts`. Módosítás: `World.ts` (importálja és újraexportálja őket). Teszt: `src/game/__tests__/collide.test.ts`.

**Interfészek – Produces:**
- `overlapsX(ax, aw, bx, bw, columns): boolean`, `wrap(x, columns): number` (a `World.ts` újraexportálja őket)
- `touchesBox(p: Player, x: number, y: number, size: number, columns: number | null): boolean`: a `columns` null értéke azt jelenti, hogy nincs körbeérés.
- `findLanding(p: Player, prevY: number, platforms: Platform[], columns: number | null): Platform | null`
- `fallStep(p: Player, dt: number, gravity: number, glideFallSpeed: number | null, cfg: GameConfig['player']): void`: gravitáció és siklás.

- [ ] Elbukó teszt: `touchesBox` körbeéréssel és anélkül; `findLanding` a legmagasabb platformot adja, alulról átenged; `fallStep` siklásnál nem gyorsul a sikló sebesség fölé.
- [ ] Megvalósítás és a `World` átállítása ezekre (a három külön érintésvizsgálat helyett).
- [ ] Minden teszt zöld.

### Task 2: Szekciók: `VerticalSection` és a `World` mint Run

**Fájlok:** Létrehozás: `sections/Section.ts`, `sections/VerticalSection.ts`. Módosítás: `World.ts`. Teszt: a meglévő tesztek, plus `src/game/__tests__/sections.test.ts`.

**Interfészek – Produces:**

```ts
export interface RunContext {
  readonly config: GameConfig;
  readonly rng: Rng;
  readonly time: number;
  readonly effects: EffectRegistry;
  readonly scoreMultiplier: number;
  readonly jumpMultiplier: number;
  readonly physics: { gravity: number; jumpVelocity: number; glideFallSpeed: number };
  readonly stats: RunStats; // { platforms, pickups, hits, easterEggs, portals }
  readonly milestonesReached: number;
  addScore(n: number): void; // negatívra 0-nál megáll
  nextId(): number;
}
export type SectionId = 'main' | 'bonus';
export interface Section {
  readonly id: SectionId;
  readonly kind: 'vertical' | 'side';
  player: Player;
  bursts: Burst[];
  collected: CollectedPickup[];
  step(dt: number, input: StepInput, run: RunContext): GameEvent[];
  /** Belépés (a szekció aktív lesz). */
  enter(run: RunContext): void;
  /** Mérföldkő: a szekció saját reakciója (függőleges: témaváltás a csibe fölött). */
  onMilestone(run: RunContext): void;
}
```

- `World` (Run): `time`, `score`, `scoreMultiplier`, `jumpMultiplier`, `effects`, `stats`, `config`, `viewHeight`, `over`, `active: Section`, `main: VerticalSection`, `bonus: SideSection | null`, `transition`, valamint `step()`, a mérföldkő és a homlokzat-getterek.
- Homlokzat (getter, és ahol a tesztek írják, setter is): `player`, `platforms`, `pickups`, `collected`, `hazards`, `easterEggs`, `bursts`, `cameraY` (setter), `egg`, `started`, `launchedAt`, `dying`, `diedAt`, `glideFallSpeed`, `isInvulnerable`, `countdownRemainingMs`, `difficulty`, `portals`.
- A `World.step` a visszaszámlálást, a halált és a `gameOver`-t a `main` szekcióra bízza. Mérföldkőnél tűzijátékot ad az aktív szekció `bursts` listájához, és meghívja az `active.onMilestone` függvényt.

- [ ] Elbukó teszt (`sections.test.ts`): a `World.active` a `main`; a pontszám a szekción keresztül nő (`addScore`); a mérföldkő tűzijátéka az aktív szekcióban jelenik meg.
- [ ] A `VerticalSection` megvalósítása a `World` mostani függőleges kódjából, áthelyezve, nem átírva.
- [ ] A `World` átírása Run-ná homlokzattal.
- [ ] Mind a 244 meglévő teszt változatlanul zöld, plus az új tesztek.

### Task 3: Bónuszpálya-szekció (`SideSection`) és vízszintes pályadarabok

**Fájlok:** Létrehozás: `sections/SideSection.ts`, `level/sideChunks.ts`, `input/TapInput.ts`. Módosítás: `tiles.ts` (`G` portál), `parser.ts` (`portals`), `config.ts` (`side`), `entities.ts` (`TapState`, `StepInput.tap?`). Teszt: `src/game/__tests__/side.test.ts`.

**Config:**

```ts
side: {
  viewColumns: 14, // látható oszlopok (kizoomolt nézet)
  rows: 12, // a pályadarabok magassága a talaj fölött
  runSpeed: 5.5, // csempe/mp
  followX: 0.3, // a csibe helye a képernyő szélességének arányában
  chunks: 6, // közepes darabok száma (véletlen sorrend)
  jumpCutFactor: 0.45, // elengedéskor felfelé haladva a sebesség szorzója
  coyoteMs: 90,
  jumpBufferMs: 120,
  finishBonus: 10,
  glide: true,
  groundTheme: 'grass',
}
```

**Interfészek – Produces:**
- `TapState = { down: boolean; pressed: boolean; released: boolean }`, ahol a `pressed` és a `released` az előző lépés óta történt.
- `StepInput.tap?: TapState`
- `SideSection(run: RunContext, opts: { chunks?: LevelChunk[]; start?: LevelChunk; end?: LevelChunk })`, mezők: `cameraX`, `length`, `platforms`, `pickups`, `hazards`, `exit: Portal`, `progress: number` (0–1), `viewColumns`.
- Esemény: `{ type: 'portalExit' }` a végportál érintésekor (egyszer).
- `Portal = { id; x; y; size; target: SectionId; spriteKey: 'portal' }`

**Pálya:**
- `sideStart` + `side.chunks` darab a `sideChunks` közül (seedelt rng, véletlen sorrend) + `sideEnd` (`G` a végén).
- A darabok balról jobbra egymás után kerülnek, a sorok számozása alulról felfelé megy, a talaj teteje y = 1.
- A talaj egy folytonos platform x = 0-tól a pálya hosszáig, `side.groundTheme` témával.

**Fizika:**
- A csibe `runSpeed`-del halad jobbra, a gravitáció és a siklás a `fallStep` szerint működik.
- **Érkezés:** a `findLanding` (körbeérés nélkül) dönti el. Érkezéskor `vy = 0`, és a csibe áll (nincs magától pattogás).
- **Ugrás:** a `tap.pressed` beállít egy puffert. Ha a puffer él, és a csibe a coyote-időn belül földön volt, ugrik: `vy = jumpVelocity * sqrt(jumpMultiplier)`, és `bounce` esemény megy.
- **Rövidebb ugrás:** a `tap.released` hatására, ha még felfelé halad, `vy *= jumpCutFactor`.
- **Pontozás:** pickup és narancs ugyanúgy, mint a függőleges pályán. A végportálnál `finishBonus` pont és `portalExit` esemény jár.

- [ ] Elbukó tesztek:
  - előre fut, a `cameraX` követi, és nem fut túl a pálya végén;
  - koppintásra ugrik, a rövid koppintás alacsonyabb ugrást ad, mint a hosszú nyomás;
  - talajon állva nem ugrik magától, a nyomva tartott ujj nem ad újabb ugrást;
  - a coyote time és az ugrás-puffer működik;
  - nem tud leesni, mert a talaj végig tart;
  - a pickup pontot ad, a narancs pontot von le;
  - a végén `portalExit` jön a teljesítési bónusszal, egyszer;
  - a belépés előtti lenyomás nem ugrik.
- [ ] A parser kezeli a `G`-t (`portals`), a `tiles.ts` regisztrálja a portál csempetípust.
- [ ] A `SideSection` és a `sideChunks` megvalósítása.
- [ ] Zöld.

### Task 4: Portál a függőleges pályán, átmenet, visszatérés

**Fájlok:** Módosítás: `VerticalSection.ts` (portál elhelyezése és érintése, `safeUntil`), `World.ts` (átmenet, szekcióváltás), `config.ts` (`portals`). Teszt: `src/game/__tests__/portals.test.ts`.

**Config:**

```ts
portals: {
  chancePerGame: 0.3,
  chunkRange: [4, 20],
  size: 1.3,
  transitionMs: 500, // fele sötétedés, fele világosodás; középen vált a szekció
  returnSafeMs: 2000, // visszatérés után: nincs autoscroll és narancs-sérülés
}
```

**Interfészek – Produces:**
- `VerticalSection.portals: Portal[]` (legfeljebb 1), és a `{ type: 'portalEnter', target: 'bonus' }` esemény.
- `World.transition: { to: SectionId; startedAt: number; switched: boolean } | null`, valamint a `World.transitionAlpha(): number` (0–1, a rajzoláshoz).
- `World.bonusProgress: number | null`
- `VerticalSection.resume(run)`: a portál platformján folytatódik, elrugaszkodással, a csibe fölötti platformok átváltanak az aktuális témára, és a `safeUntil = run.time + returnSafeMs`.

**Viselkedés:**
- **Elhelyezés:** a menet elején egyetlen dobás dönti el (`chancePerGame`), melyik pályadarabba kerüljön portál a `chunkRange`-en belül. Szabad platformcsempére kerül, ugyanazzal a módszerrel, mint az easter egg (`hideEasterEgg`). Az easter egg csempéjére nem kerülhet, és ha nincs hely, a következő darabba csúszik.
- **Érintés:** `portalEnter` esemény; a portál eltűnik, és a `World` elindítja az átmenetet a `bonus` felé.
- **Átmenet:** ezalatt egyik szekció sem lép, csak az idő megy. Félidőben létrejön a `SideSection` (a menet rng-jével), és meghívódik az `enter`.
- **`portalExit`:** átmenet vissza a `main` felé, félidőben `main.resume`.
- **Védettség a visszatérés után:** amíg a `safeUntil` él, az `isInvulnerable` igaz, és nincs autoscroll.

- [ ] Elbukó tesztek:
  - az esély 0 vagy 1 esetén van-e portál, és legfeljebb egy van;
  - nem ugyanoda kerül, ahol az easter egg van;
  - belépés: átmenet, utána a `bonus` aktív, a függőleges szekció befagy (a `cameraY` és a pozíció nem változik);
  - visszatérés: a csibe a portál platformján áll, és nem hal meg és nem sérül 2 mp-ig;
  - a pontszám és az effektek átmennek, a ×2 pont a bónuszpályán is duplán számol;
  - a mérföldkő a bónuszpályán is tűzijátékot ad, és visszatéréskor a csibe fölött átváltanak a platformok.
- [ ] Megvalósítás.
- [ ] Zöld.

### Task 5: Rajzolás és irányítás

**Fájlok:**
- Módosítás: `snapshot.ts` (`snapshotVertical`, mint a mostani törzs, `snapshotSide`, átmenet-réteg, portál sprite a függőleges pályán), `GameCanvas.tsx` (8-as művelet: áttetsző kitöltés, a `frame` mező az átlátszóság × 1000), `colors.ts` (`black`), `game.tsx` (`TapInput`, portálhang, `Hud` haladás), `Hud.tsx` (`bonusProgress`), `audio.ts` (`portal` effekt).
- Teszt: `src/game/__tests__/sideRender.test.ts`.

- [ ] Elbukó teszt:
  - a bónuszpálya draw list-jében benne vannak a talaj, a platformok és a csibe a `cameraX` szerint;
  - a csempeméret `screenWidth / viewColumns`;
  - átmenet közben az utolsó parancs egy áttetsző fekete kitöltés.
- [ ] `snapshotSide`:
  - égbolt-háttér, felhők vízszintes parallaxszal;
  - platformok (`Op.tile`), pickupok, narancsok, végportál, csibe;
  - futás közben a csibe két kockája váltakozik (a velocity sprite kockái időre);
  - tűzijáték.
- [ ] `game.tsx`:
  - a pan-gesztus `onBegin`-je lenyom, az `onFinalize`-ja felenged;
  - a `TapInput.consume()` a `StepInput.tap`-be kerül;
  - a `portalEnter` / `portalExit` portálhangot és rezgést ad;
  - a HUD megkapja a bónusz haladását.
- [ ] Zöld; típusellenőrzés, lint.

### Task 6: Portál sprite (helyőrző) és befejezés

**Fájlok:** Módosítás: `scripts/sprites/generate.mjs` (procedurális, 4 kockás örvény, `portal`), `animations.json` (`portal`: 4 kocka, 8 fps, ismétlődik), `sprites.ts` (regisztráció), `PLAN-portals-sections.md` (állapot frissítése).

- [ ] A sprite generálása: `npm run sprites -- portal`. A sprite-tesztek zöldek.
- [ ] A teljes tesztcsomag, a `tsc` és a lint zöld; szimulátoros képernyőkép, ha lehet.
- [ ] A spec TODO-jainak kipipálása (S, H, P, R pontok; A1 helyőrzővel).
