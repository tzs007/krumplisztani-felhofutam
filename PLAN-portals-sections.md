# Terv: portálok és pályaszekciók (bónuszpálya, később titkos pályák)

Állapot: **terv, nincs elkezdve** (2026-10-06). A megvalósítás előtt érdemes még egyszer átnézni a „Nyitott kérdések” részt.

## Cél

Bizonyos pályaelemek (portálok) átvigyék a játékost egy másik **pályaszekcióba**. Az első ilyen egy klasszikus, oldalnézetes bónuszpálya (Super Mario-szerű):

- a csibe magától fut jobbra, a pálya jobbról balra görög;
- a játékos koppintásra ugrik;
- zárt, fix hosszúságú pálya: nem lehet leesni, nem lehet meghalni;
- a végén egy portál visszaviszi a függőleges pályára, ugyanoda, ahonnan elment.

A szekciókra bontás azért kell, mert később más helyek is jönnek, például titkos pályák, és az easter egget csak ezeken lehet majd megszerezni.

## Döntések (2026-10-06)

| Kérdés | Döntés |
|---|---|
| Ugrás a vízszintes pályán | **Koppintásra ugrik.** Automatikusan fut. A hosszabb nyomás magasabb ugrást ad. |
| A függőleges menet a bónusz alatt | **Megáll, ugyanott folytatódik.** A magasság, a kamera és a pontszám befagy. Visszatéréskor a csibe a portál platformján érkezik, rövid védettséggel. |
| Bónuszpálya tétje | **Csak jutalom, nincs halál.** Kártyákat és bónuszokat lehet gyűjteni, ezek a közös pontszámba mennek. A narancs pontot von le, mint most. |
| Portálok elhelyezése | **Ritka esemény, mint a mém.** Esély menetenként és pályaszakasz-tartomány. Szabad platformra kerül, később az adatbázisból is állítható. |

## Becsült ráfordítás

Kb. **5–7 munkanap**, közepes–nagy feladat. A legnagyobb tétel a mostani játékmotor kettébontása. Ez kockázatos, mert minden mostani funkció (pontszám, effektek, mérföldkő, halál, témaváltás) érintett, de a meglévő 240+ teszt jó védőháló.

| Fázis | Becslés |
|---|---|
| 1. Szekciókra bontás (refaktor, viselkedés nem változik) | 1,5 nap |
| 2. Oldalnézetes szekció (fizika, kamera, pálya, ugrás) | 1,5–2 nap |
| 3. Portál: megjelenés, átmenet, visszatérés | 1 nap |
| 4. Megjelenítés és irányítás (rajzolás, koppintás, HUD) | 1 nap |
| 5. Grafika, hang, finomhangolás | 0,5–1 nap + a te rajzaid |
| 6. Easter egg átköltöztetése titkos pályára (opcionális, később) | 0,5–1 nap |

## Megfontolt megoldások

1. **Ezt javaslom: szekciók egy közös „menet” (Run) alatt.** A mostani `World` szétválik:
   - **közös rész** (`Run`): idő, pontszám, effektek, statisztika, mérföldkövek, a csibe állapota;
   - **szekciók** (`VerticalSection`, `SideSection`): saját pályaelemek, kamera, fizikai szabályok, és mindegyik maga rajzolja ki magát.

   A portál egy esemény, amire a Run átvált egy másik szekcióra. Új helyet (titkos pálya, más nézet) új szekcióként lehet felvenni, a többihez nem kell nyúlni.
2. **Két külön `World` példány, a játékképernyő váltogat köztük.** Ez gyorsabban elindul, de a pontszámot, az effekteket és a mérföldköveket kézzel kellene átadogatni, és minden új hely újabb különleges esettel jár.
3. **Egy `World`, tengely-kapcsolókkal** (függőleges vagy vízszintes mód). A legkevesebb új fájl, de a mostani 580 soros osztály tele lenne `if (mode)` ágakkal. Ez a hosszú távú cél (több szekciótípus) ellen dolgozik.

## Felépítés (1. megoldás)

### Közös: `Run`

- **Mit tartalmaz:**
  - `time`, `score`, `scoreMultiplier`, `jumpMultiplier`, `effects` (EffectRegistry), `stats`;
  - a mérföldkövek (`nextMilestone`, tűzijáték), az `rng`, a `config`;
  - `sections`: azonosító szerint (`'main'`, `'bonus-1'`, …) és `active`.
- **`step(dt, input)`:** az aktív szekció `step`-jét hívja, a közös dolgokat (effektek tickje, mérföldkő) maga intézi. A `portalEnter` / `portalExit` eseményre szekciót vált.
- **Átmenet:** egy rövid, pl. 400 ms-os állapot (`transition`), ami alatt semmi nem mozog, és a képernyő elsötétül. Ezt a renderelő rajzolja ki.
- **Kompatibilitás:** az 1. fázisban a `World` neve megmarad a `Run` homlokzataként (`world.player`, `world.score`, `world.platforms` stb.), így a meglévő tesztek és a `game.tsx` változatlanul működnek.

### Szekció interfész

```ts
interface Section {
  readonly kind: 'vertical' | 'side';
  player: Player;                        // a szekció saját koordinátáiban
  step(dt: number, input: SectionInput, run: RunContext): GameEvent[];
  snapshot(tileSize: number, screen: { width: number; height: number }): number[]; // draw list
  /** Belépéskor: hova kerüljön a csibe, honnan induljon a kamera. */
  enter(from: PortalInfo | null): void;
  /** Kilépéskor (pl. befagyasztás); a függőleges szekció visszatéréskor folytatódik. */
  leave(): void;
}
```

`RunContext`: pontszám hozzáadása vagy levonása, effekt indítása, statisztika és idő. Ugyanaz, mint a mostani `EffectContext` kibővítve. Így a szekciók nem nyúlnak egymáshoz.

### Közös segédek (kiemelés a `World`-ből)

- `physics.ts`: gravitáció és ugrássebesség (`derivePhysics` már megvan), az ernyős siklás, az egyirányú platformra érkezés vizsgálata.
- `collide.ts`: felvétel, narancs és easter egg érintésének vizsgálata. Most háromszor ismétlődik, és a körbeérés (wrap) csak a függőleges szekcióban kell.

### `VerticalSection` (a mostani játék)

Minden, ami most a `World`-ben van, és függőleges-specifikus: vízszintes körbeérés, csak felfelé mozgó kamera, automatikus görgetés, a képernyő aljánál bekövetkező halál, a pályadarabok generálása, a platformtémák, a portál elhelyezése.

### `SideSection` (bónuszpálya)

- **Koordináták:** x jobbra, y felfelé. A pálya `length` csempe hosszú, nincs körbeérés.
- **Mozgás:**
  - **Futás:** állandó `runSpeed` (csempe/mp, configból), a csibe x-e csak nő.
  - **Ugrás:**
    - koppintásra `jumpVelocity`, csak talajon vagy platformon állva;
    - változó magasság: elengedéskor, ha még felfelé megy, a sebesség `jumpCutFactor`-ral csökken;
    - „coyote time”, kb. 80 ms: a platform széle után még lehet ugrani;
    - ugrás-puffer, kb. 100 ms: a kicsit korán érkező koppintás is érvényes.
  - **Ernyő:** a csibe esés közben itt is kinyithatja, ugyanazzal a sprite-tal. A configban kikapcsolható.
- **Talaj és platformok:**
  - **Talaj:** folytonos, tömör talajsor a pálya alján, ezért nem lehet leesni.
  - **Lebegő platformok:** egyirányúak, mint most, alulról át lehet ugrani őket.
  - **Falak:** nincsenek (nincs oldalirányú ütközés), ezért a fizika egyszerű marad.
  - **Plafon:** a képernyő teteje. Ha a csibe nekiugrik, a felfelé tartó sebessége megáll.
- **Kamera:** csak vízszintesen mozog. A csibe a képernyő bal harmadában marad (`followX: 0.3`), így előre látni.
- **Látómező:** állóképernyőn a 9 csempés szélesség kevés egy futáshoz. A bónuszpálya saját csempemérettel dolgozik, pl. 14 látható oszloppal (`side.viewColumns`), ezért kicsit „kizoomolt”.
- **Pálya:** fix hosszúságú, mátrixdarabokból épül, ugyanazzal a jelmagyarázattal (`#`, `K`, `X`, `J`, `O` …).
  - A darabok balról jobbra olvasandók, a magasság fix, pl. 12 sor.
  - Felépítés: induló darab + `side.chunks` darab (pl. 6, véletlen sorrendben) + záró darab a visszavivő portállal (`G`).
  - A talajsort nem kell rajzolni a mátrixba, a szekció adja hozzá.
- **Pont:** a kártyák és bónuszok ugyanúgy, mint fent. A platformra érkezés itt nem ér pontot, mert az folyamatos futás közben értelmetlen. Teljesítésért `side.finishBonus` pont jár, pl. +10.
- **Halál:** nincs. A narancs pontot von le, és rövid védettséget ad, mint most.

### Portál

- **Új csempetípus:** `{ kind: 'portal', target: SectionId, spriteKey }`. Platformon áll, mint a földre tett easter egg tárgy.
- **Elhelyezés a függőleges pályán** (`config.portals`, mintának a `config.easterEggs`):
  - `chancePerGame` (pl. 0,3), `chunkRange` (pl. [4, 20]), `targets` (melyik szekció, súlyozva);
  - legfeljebb egy portál menetenként;
  - az easter eggel nem kerülhet ugyanarra a platformra.
- **Belépés:** amikor a csibe hozzáér, `portalEnter` esemény indul.
  - A függőleges szekció befagy: elmenti a kamerát, a csibe pozícióját, a még élő effekteket, az autoscroll állapotát.
  - Elindul a sötétedés, és létrejön a `SideSection` egy menethez kötött seeddel.
- **Kilépés:** a pálya végén lévő portálnál `portalExit` esemény indul.
  - A függőleges szekció folytatódik: a csibe a portál platformján áll, és kap egy elrugaszkodást.
  - A kamera úgy áll be, hogy a csibe a szokásos helyén legyen.
  - 2 mp védettség jár (`portals.returnInvulnerableMs`), és ezalatt az autoscroll is szünetel, hogy ne lehessen azonnal meghalni.
  - A portál eltűnik, egy menetben csak egyszer lehet használni.
- **Később, adatbázisból:** egy `app_config` kulcs, `portals`, ugyanúgy, mint az `easter_eggs`. Így az esély és a tartomány kiadás nélkül állítható.

### Megjelenítés

- **Draw list:** a `buildSnapshot` az aktív szekcióra delegál, mindegyiknek saját függvénye van: `snapshotVertical` (a mostani) és `snapshotSide`. A rajzolási műveletek, a sprite-ok és a `GameCanvas` ugyanazok maradnak.
- **Bónuszpálya háttere:** az égbolt, és a felhők vízszintesen, lassan görögnek (parallax). Később saját, széles háttérkép is lehet (`bg_side`).
- **Átmenet:** egy fekete, elhalványuló réteg, ehhez egy új egyszerű művelet kell (teljes képernyős kitöltés átlátszósággal), vagy egy React réteg a vászon fölött.
- **HUD:** pontszám, plusz a bónuszpályán egy haladásjelző csík („Bónusz pálya · 40%”).

### Irányítás (`game.tsx`)

- A gesztus marad egy `Pan` 0-s minimális távolsággal, de a szekció dönti el, mit jelent.
  - **Függőleges szekció:** húzás, a mostani `DragInput`.
  - **Bónuszpálya:** lenyomás = ugrás kezdete, felengedés = ugrás vége, a változó magasság miatt.
- `InputRouter`: a `SectionInput` uniót állítja elő (`{ kind: 'drag', dx, … } | { kind: 'tap', pressed, justPressed, justReleased }`).

### Hang

- Új effektek: `sfx_portal` (be- és kilépés), esetleg `sfx_side_finish`.
- Zene: a bónuszpályán saját zene (`music_bonus`), vagy a játékzene gyorsabban. A forrás a te dolgod.

### Easter egg titkos pályán (6. fázis)

- `config.easterEggs.sections`: hol jelenhet meg, pl. `['side']`. Az első verzióban maradhat a mostani függőleges megjelenés is, kapcsolóval.
- Később új szekciótípusok jöhetnek, pl. `SecretSection`: kis, zárt szoba. A portál `target` mezője dönti el, hova visz.

## Tesztelés

- **1. fázis:** minden meglévő teszt változatlanul zöld (ez a refaktor mércéje).
- **`SideSection`:**
  - fut és ugrik, a változó magasság működik, a coyote time és az ugrás-puffer is;
  - nem lehet leesni, a platformok egyirányúak, a plafon megállítja;
  - pickup és narancs működik, a végén a portál `portalExit`-et küld.
- **Portál:**
  - a megjelenési esély és tartomány, legfeljebb egy portál, nem ütközik az easter eggel;
  - belépéskor befagy a függőleges szekció, kilépéskor ugyanott folytatódik, védettséggel és szüneteltetett autoscrollal;
  - a pontszám és az effektek átmennek a szekciók között.
- **Renderelés:** a bónuszpálya draw list-je (talaj, platformok, csibe a kamera szerint).

## TODO

### 1. Szekciókra bontás (viselkedés nem változik)
- [ ] S1 `collide.ts` és `physics.ts` kiemelése a `World`-ből (érintésvizsgálat, egyirányú platformra érkezés, siklás)
- [ ] S2 `Section` interfész, `RunContext`, `SectionInput`, `GameEvent` bővítése (`portalEnter`, `portalExit`)
- [ ] S3 `VerticalSection` = a mostani függőleges logika (pályaelemek, kamera, autoscroll, halál, témák)
- [ ] S4 `Run`: idő, pontszám, effektek, statisztika, mérföldkő, szekcióváltás; a `World` marad homlokzatként
- [ ] S5 `buildSnapshot` → szekciónként delegál (`snapshotVertical`)
- [ ] S6 Minden meglévő teszt zöld, `game.tsx` változatlan viselkedéssel

### 2. Oldalnézetes szekció
- [ ] H1 Config: `side` (`runSpeed`, `viewColumns`, `rows`, `chunks`, `followX`, `jumpCutFactor`, `coyoteMs`, `jumpBufferMs`, `finishBonus`, `glide`)
- [ ] H2 Vízszintes pályadarabok (`sideChunks.ts`): induló, közepes és záró darab portállal; a feldolgozó balról jobbra olvas; ellenőrzés (az ugrásmagasságon belül érhető-e el minden)
- [ ] H3 `SideSection`: futás, koppintásos ugrás változó magassággal, coyote time, ugrás-puffer, talaj, egyirányú platformok, plafon
- [ ] H4 Pickupok, narancs, kamera vízszintesen, haladás (0–1)
- [ ] H5 Tesztek

### 3. Portál
- [ ] P1 Csempetípus és sprite-kulcs (`portal`), `config.portals` (`chancePerGame`, `chunkRange`, `targets`, `returnInvulnerableMs`)
- [ ] P2 Elhelyezés a függőleges pályán (mintának az `hideEasterEgg`), legfeljebb egy portál, nem ütközik az easter eggel
- [ ] P3 Belépés: befagyasztás, átmenet-állapot, a `SideSection` létrehozása a menet seedjével
- [ ] P4 Kilépés: folytatás a portál platformján, kamera beállítása, védettség, autoscroll-szünet, a portál eltűnik
- [ ] P5 Tesztek

### 4. Megjelenítés és irányítás
- [ ] R1 `snapshotSide`: talaj, platformok (a témák sprite-jaival), pickupok, csibe futó és ugró pózzal, felhők parallaxszal
- [ ] R2 Átmenet (elsötétülés), portál-animáció
- [ ] R3 `InputRouter`: húzás vagy koppintás a szekció szerint (`game.tsx`)
- [ ] R4 HUD: a bónuszpálya haladásjelzője
- [ ] R5 Bónuszpálya csempemérete (`viewColumns`) a `game.tsx`-ben és a snapshotban

### 5. Grafika, hang, finomhangolás
- [ ] A1 Portál sprite (animált, pl. 4–6 kocka) – **te rajzolod / generálod**
- [ ] A2 Opcionális: bónuszpálya-háttér (`bg_side`, széles kép), talaj-csempék (használható egy meglévő platformtéma is)
- [ ] A3 Hangok: `sfx_portal`, opcionálisan `music_bonus`
- [ ] A4 Finomhangolás: futássebesség, ugrásmagasság, pályahossz (kb. 30–45 mp játékidő)

### 6. Titkos pályák és easter egg (később)
- [ ] E1 `config.easterEggs.sections`: az easter egg csak a megadott szekciókban jelenhet meg
- [ ] E2 Opcionális `SecretSection` típus (kis, zárt szoba), több portál-cél súlyozva
- [ ] E3 `app_config.portals` az adatbázisban, letöltés és cache, mint az easter eggeknél

## Kockázatok és nyitott kérdések

- **A refaktor mérete:** a `World` sok helyről elérhető (`game.tsx`, snapshot, tesztek). A homlokzat ezt tompítja, de az 1. fázist érdemes külön commitolni, és csak utána építeni rá.
- **Ernyő a bónuszpályán:** a lassú esés könnyebbé teszi a pályát. Ki- vagy bekapcsoljuk? A javaslat: bekapcsolva, mert ugyanaz a figura.
- **Pontozás a bónuszpályán:** elég-e a kártya és a teljesítési bónusz, vagy legyen pont a megtett távolságért is?
- **Mérföldkő a bónuszpályán:** a tűzijáték jöhet ott is. A platformtéma viszont csak a függőleges pályán vált (visszatéréskor a portál fölötti platformok átváltanak, ha közben átlépte a 100-as határt).
- **Ranglista és statisztika:** a `GameResult` kaphat egy `portals` számlálót, de az adatbázishoz ez nem kell az első verzióban.
- **Fekvő tájolás:** nem tervezzük. Az app állóképernyős marad, a bónuszpálya kizoomolt látómezővel megy.
