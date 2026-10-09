# TCG kártyák (Season 1) – design

**Dátum:** 2026-10-10
**Forrás:** a „User Stories: TCG Card Integration” (US-1 … US-6) és a 2026-10-10-i egyeztetés döntései.

## Cél

A játékos a jó pontszámért kártyákat nyithat meg a Game Over képernyőn. A kártyák egy 30 lapos, limitált „Season 1” gyűjteményből jönnek. A gyűjteményt egy saját oldalon (`/cards`) nézheti meg, és onnan átmehet a kártya webshopos landing oldalára. A kártyák a szerveren vannak nyilvántartva, és a sorsolás is ott történik, hogy ne lehessen csalni.

## Döntések (az egyeztetésből)

| Kérdés | Döntés |
| --- | --- |
| Hány kártya / játék | `min(3, floor(score / 100))`: 100+ → 1, 200+ → 2, 300+ → 3. 1000 pont is 3. |
| A „145 gyűjtött” szöveg | Az adott játék pontszáma: „N kártyát nyithatsz meg (312 pont)”. 100 pont alatt a szekció nem jelenik meg. |
| Gyűjtemény | 30 kártya a Supabase-ben. Minden nyitás egy véletlen lap a 30-ból. |
| Duplikátumok | Megengedettek. A rácsban a már nyitott lap nem változik. |
| „Season 1/432” | Csak kiírt szöveg (nyomott példányszám), az appban nincs hatása. Adatbázisból jön (`serial_label`). |
| Offline Game Over | A nyitási jogot a készülék megőrzi. Kapcsolat után a menüből vagy a `/cards` oldalon nyitható meg. A sorsolás mindig a szerveren történik. |
| Ritkaság | Mind a 30 lap egyforma eséllyel jön (1/30). A ritkaság csak egy jelvény a kártyán. |
| Landing link | A `cards.landing_url` oszlopban teljes URL-ként van tárolva (pl. `https://krumplisztan.hu/kartyak/<md5>`). Az app nem számol hash-t. |
| Gyűjtő ranglista | Harmadik fül a ranglistán („Gyűjtők”): a különböző felfedett kártyák száma szerint. Holtversenynél az nyer, aki előbb érte el. |
| Season 2 teaser | Nem része ennek a körnek (csak roadmap). |

## Megközelítés

**A sorsolás a Game Overkor egyben történik, a flip csak felfedés.** A Game Over képernyő feltölti az eredményt, és egyszer meghívja az `open_cards` RPC-t. A szerver ekkor sorsolja ki az összes (1–3) kártyát, és el is menti őket. A flip animáció helyben fut, hálózatra nem vár. A kártya a flip után kap `revealed_at` időpontot, és a galériában is ettől kezdve látszik. A nem felfordított kártyák a `/cards` oldalon „Bontatlan kártyák”-ként várnak.

Elvetett alternatíva: minden flip külön RPC hívás. Ilyenkor a flipnek várnia kell a hálózatra, és ettől sem lenne biztonságosabb.

## 1. Adatbázis és szerver (új Supabase migráció)

### `cards` (az app csak olvassa, a dashboardon szerkeszthető)

| Oszlop | Típus | Megjegyzés |
| --- | --- | --- |
| `id` | text PK | pl. `demagogia`, `^[a-z0-9][a-z0-9-]{1,63}$` |
| `number` | int, unique | 1–30, a rács sorrendje |
| `name` | text | 1–60 karakter |
| `description` | text | 1–500 karakter |
| `rarity` | text | `common` / `rare` / `legendary` |
| `image_url` | text, null | `https://…`, a nyilvános `cards` storage bucketből |
| `landing_url` | text, null | `https://…`, a „Megnézem a webshopban” gomb célja |
| `season` | int | 1 |
| `serial_label` | text | pl. `Season 1/432` |
| `enabled` | bool | csak az engedélyezett lapok sorsolhatók és láthatók |

Mindenki olvashatja (anon is). Írni csak a dashboardról / service role-lal lehet. Ugyanaz a minta, mint az `easter_eggs` táblánál, és ugyanaz a `touch_updated_at` trigger is. A migráció 30 helyőrző lapot tölt fel.

### `user_cards`

| Oszlop | Típus | Megjegyzés |
| --- | --- | --- |
| `id` | bigint identity PK | |
| `user_id` | uuid | → `profiles.id`, cascade |
| `card_id` | text | → `cards.id` |
| `game_result_id` | bigint | → `game_results.id` (ez a US-6 `game_session_id`-ja) |
| `slot` | smallint | 1–3 |
| `drawn_at` | timestamptz | default `now()` |
| `revealed_at` | timestamptz, null | a flipkor állítódik be |

- `unique (game_result_id, slot)` és `check (slot between 1 and 3)`: egy játékhoz legfeljebb 3 kártya tartozhat.
- RLS: a játékos csak a saját sorait olvashatja. Az appnak nincs insert/update/delete joga, minden írás security definer függvényen keresztül megy.

### Függvények (mind `security definer`, `search_path = ''`, csak `authenticated` hívhatja)

- **`open_cards(p_client_id text)`** → a játékhoz tartozó `user_cards` + `cards` sorok.
  - Megkeresi a hívó `game_results` sorát (`user_id = auth.uid()`, `client_id = p_client_id`). Ha nincs ilyen sor, hibát dob (az eredmény még nincs feltöltve).
  - `limit = least(3, score / 100)`. A még hiányzó slotokat egyenletes véletlen sorsolással tölti fel az engedélyezett lapokból.
  - **Idempotens:** ha a slotok már ki vannak sorsolva, csak visszaadja őket. Ha a válasz elveszik és a kliens újrahívja, nem sorsol újra. A párhuzamos hívásokat a unique constraint és az `on conflict do nothing` védi.
- **`reveal_card(p_user_card_id bigint)`**: beállítja a `revealed_at`-et, ha üres és a sor a hívóé. Idempotens.
- **`top_collectors(limit_count int default 10)`** → `user_id, display_name, distinct_cards, reached_at`. A különböző felfedett lapok száma szerint csökkenő, holtversenyben az előbb elért első. `anon` is hívhatja.
- **`my_collector_rank()`** → a hívó sora a fenti rangsorban (`rank`-kal).

### Csalás elleni védelem: meddig terjed

- A pontszámot továbbra is a kliens jelenti (mint eddig). A kártyák száma viszont a feltöltött eredményhez kötött, és az eredmény append-only.
- A sorsolás a szerveren történik. A kliens nem tud kártyát beszúrni, és nem választhat lapot.
- Ha a szerver és a készülék adata eltér, a szerver nyer: a frissítés a helyi gyűjteményt teljesen lecseréli.

A `database.types.ts`-t a migráció után újra kell generálni (vagy kézzel bővíteni, ahogy eddig).

## 2. Kliens: adat és szinkron

### `src/lib/cards.ts`

- `cardsForScore(score): 0 | 1 | 2 | 3`: tiszta függvény.
- `claimCards(clientId)`: előbb `syncResults()`, hogy az eredmény fent legyen, aztán `open_cards`. Siker esetén frissíti a store-t, és törli a claimet a `pendingClaims`-ből. Hibánál a claim marad. Soha nem dob, státuszt ad vissza (`'ok' | 'offline' | 'error'`).
- `revealCard(userCardId)`: optimista helyi felfedés, aztán RPC. Ha az RPC nem sikerül, a következő szinkron újrapróbálja (`pendingReveals`).
- `fetchCollection()`: a saját `user_cards` és az engedélyezett `cards` sorok. A store-ban teljesen lecseréli a gyűjteményt (a szerver nyer).
- `syncCards()`: a függő claimek és reveal-ök, aztán `fetchCollection`. A meglévő `connectAndSync` hívja meg, így az előtérbe jövéskor is lefut.

### `src/store/useCardsStore.ts` (Zustand + persist AsyncStorage, mint a `useAppStore`)

- `catalog: Card[]`: az utolsó letöltött 30 lap, cache-elve.
- `owned: UserCard[]`: a saját kihúzott lapok (`id, cardId, gameResultClientId, slot, revealedAt`).
- `pendingClaims: string[]`: a client_id-k, amelyekhez még nem futott le az `open_cards`.
- `pendingReveals: number[]`.
- Selectorok:
  - `selectRevealedCardIds`: a gridhez, a duplikátumokat összevonja;
  - `selectUnrevealed`: a „Bontatlan kártyák” listához;
  - `selectCollectedCount`: pl. „12/30”.

### Bekötés a Game Over folyamatba

A játék végén (ahol most az `addResult` fut) a `cardsForScore(score) > 0` esetén a result id bekerül a `pendingClaims`-be, mielőtt a Game Over képernyő megnyílik. Így ha az app bezárul, a jog akkor sem vész el.

## 3. Kliens: képernyők és komponensek

### `<FlipCard>` (`src/components/cards/FlipCard.tsx`)

- Reanimated `rotateY`, 0 → 180°, 350 ms, `backfaceVisibility: 'hidden'` a két oldalon. Könnyű haptic (`expo-haptics`) és a meglévő `sfx_card` hang.
- **Hátlap:** TCG logó és „Mystery Card”.
- **Előlap:** nagy artwork (`expo-image`), név, ritkaság-jelvény (common/rare/legendary színnel), `serial_label`.
- Props: `card`, `revealed`, `onReveal`. Csak a tap fordít, felfedés után nincs extra animáció.

### `<CardSwiper>` (`src/components/cards/CardSwiper.tsx`)

- Vízszintes `FlatList` `pagingEnabled`-del és lapozó pöttyökkel. Hátlappal is lapozható.
- Ezt használja a Game Over képernyő és a `/cards` „Bontatlan kártyák” nézete is.

### Game Over (`src/app/game-over.tsx`)

- Fentről lefelé:
  - a pontszám és a best (a mostani);
  - elválasztó, aztán „N kártyát nyithatsz meg (312 pont)”;
  - „Kártyák megnyitása” gomb → `CardSwiper`.
- A `claimCards` már a képernyő megnyitásakor elindul a háttérben.
- Állapotok:
  - **< 100 pont:** nincs kártya-szekció.
  - **Sorsolás folyamatban:** a gomb spinnert mutat.
  - **Offline vagy hiba:** „Csatlakozz a kártyák megnyitásához — megőrizzük őket.”
  - **Felfordított kártya:** „A valódi kártyát is megismerheted!” és egy másodlagos „Kártya megtekintése →” gomb, ami a `/cards/[number]` modált nyitja.
- Az **„Újra játszom” marad a fő (sárga) CTA**. Alatta szöveges linkek: „Ranglista · Gyűjtemény”.

### `/cards` (`src/app/cards/index.tsx`)

- Fejléc: Vissza, „Gyűjtemény”, „Season 1 Limited (30 cards)” jelvény és „12/30 gyűjtve”.
- Ha van függő claim vagy fel nem fordított lap, a lista tetején egy „Bontatlan kártyák (2)” sáv van, ami a `CardSwiper`-t nyitja.
- Rács: `FlatList`, `numColumns` = 3 telefonon, 5 szélesebb képernyőn (`useWindowDimensions`), mindig a 30 lap `number` szerint.
  - **Felfedett lap:** előlap-miniatúra.
  - **Nem felfedett lap:** hátlap „?”-lel.
- Pull-to-refresh: `syncCards()`.
- Offline: a cache-elt gyűjtemény és egy „offline” sáv, mint a ranglistán.
- Tap egy felfedett lapra → `/cards/[number]`.

### `/cards/[number]` (`src/app/cards/[number].tsx`, modal presentation)

- Nagy artwork, név, leírás, ritkaság, `serial_label`, és a „Megnézem a webshopban →” gomb, ami az `expo-web-browser`-rel nyitja meg a `landing_url`-t (ha van).
- Nem felfedett lapnál „Még nem fedezted fel” és a hátlap.

### Ranglista (`src/app/leaderboard.tsx`)

- Harmadik fül: „Gyűjtők”. Top 10 a `top_collectors` alapján, plusz a saját sor a `my_collector_rank` alapján. A megjelenítés a meglévő `buildBoard` logikával megy (a `score` helyett a lapszám, pl. „23/30”).

### Navigáció

- `_layout.tsx`: `cards/index` (`slide_from_right`) és `cards/[number]` (`presentation: 'modal'`).
- Menü: új „Gyűjtemény” gomb.
- Zene: a `/cards` oldalakon a menü zenéje szól (a mostani `musicFor` alapértelmezése, nincs teendő).

## Hibakezelés

- A játék és a Game Over soha nem vár a hálózatra. Minden RPC a meglévő `withTimeout` mintával fut.
- `open_cards` hiba vagy offline állapot: a claim a `pendingClaims`-ben marad, és a következő szinkron (előtérbe jövés, pull-to-refresh, `/cards` megnyitása) újrapróbálja.
- Ha nincs backend (`getSupabase()` null), a kártya-szekció az offline szöveget mutatja.

## Tesztek

- **Tiszta függvények (Jest):**
  - `cardsForScore` (99/100/199/200/300/1000);
  - a gyűjtemény-csere (a szerver nyer);
  - a rács összeállítása (30 lap + felfedett id-k, duplikátumok);
  - `pendingClaims` / `pendingReveals` kezelése;
  - a gyűjtő-board építése.
- **SQL:** `supabase/tests/cards.sql` (pgTAP, ha a lokális stack elérhető):
  - limit score szerint;
  - idempotens újrahívás;
  - max 3 slot;
  - idegen eredményre hibát dob;
  - a `reveal_card` csak a saját sort fedi fel.
- **Komponens (Testing Library):**
  - `FlipCard` tapre felfed;
  - a Game Over kártya-szekció állapotai (< 100 pont, offline, 1–3 lap).

## Nem része ennek a körnek

- Season 2 teaser.
- Súlyozott ritkaság-sorsolás.
- Szerveroldali pontszám-validáció (a pontszám kliensoldali marad).
- Valódi artwork (helyőrző lapokkal indul, a képek és a landing URL-ek a dashboardról tölthetők fel).
