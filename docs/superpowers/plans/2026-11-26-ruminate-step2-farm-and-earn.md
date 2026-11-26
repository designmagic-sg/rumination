# RumiNation Step 2 "Farm and earn" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose native execution in step 1) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Players till the farm plot, plant seeds, water them, and watch the crops grow one stage each morning, including while nobody is online. They harvest the crops, sell them at the market stall for Rumis, and buy more seeds. Each player has their own bag and purse.

**Architecture:** As in step 1. The rules for items, the bag, the economy and the farm are pure functions in `shared/` with tests. `WorldSim` on the server applies them to the save and the synced state. The client draws soil and crops, and shows a toolbar, the bag, the purse and a shop panel. Each player's bag and purse go only to that player, by direct message. The farm is synced to everyone.

**Tech stack:** Unchanged from step 1.

**Spec:** `docs/superpowers/specs/2026-11-23-ruminate-design.md`, sections 6.5 (catch-up while empty) and 6.7 (Farming; Rumis and the shop). Catalogue: `docs/superpowers/specs/2026-11-23-ruminate-catalogue.md`, section 1.1.

## Global Constraints

- **The farm is shared, and the bag and purse are each player's own** (decisions log). Selling pays whoever sold.
- **Crops in this step:** turnip (3 days), carrot (4), potato (5), strawberry (6, then fruits again every 3), tulip (4), sunflower (7). The other 8 crops come with later steps.
- A crop grows one day each morning **if it was watered the day before**. Watered soil dries overnight.
- **While the world is empty**, crops that were watered when the last player left keep growing, one day per 24 real minutes, until ripe. The soil stays wet while the world is empty. A crop that fruits again ends up with at most one harvest ready.
- **Only `:` farm-plot tiles can be tilled.**
- **The shop is open 08:00–18:00**, and you must stand at the stall to use it. The server checks both.
- **Every action is checked on the server:** you must be within reach of the tile, own the item and be able to afford it.
- **Starting kit** for a new player, or one from a step-1 save: basic hoe, basic watering can, 10 turnip seeds and ◎ 50.
- **Art** follows the pixel style of the characters. Crops come from `art/source/crops.png`, and tools and seed bags from a new generated `art/source/items.png`. Tilled and watered soil are drawn in `make_tiles.py`, so they tile seamlessly.
- Docs use British spelling, and code uses American spelling.

## Review Focus

1. **Two players acting on the same tile at once** (for example, both harvesting a ripe turnip): only one gets it, and nothing is duplicated. Pinned in Task 4, in `farmAction harvests once`.
2. **A full bag when harvesting or buying:** nothing is lost and no Rumis are taken; the player gets a clear message. Pinned in Tasks 2 and 4.
3. **Hostile buy, sell and use messages** (negative or huge amounts, fractional counts, a slot out of range, far tiles, a closed shop): rejected with no change. Pinned in Task 4.
4. **Saves from step 1** (no bag, no farm): they load with the starting kit and an empty farm. Pinned in Task 4.
5. **A long time away** (a week): crops are ripe but not over-ripe, strawberries have one harvest ready, and nothing else changes. Pinned in Task 3.

---

### Task 1: Items, crops and prices (`shared/src/items.ts`)

- `type CropId = 'turnip' | 'carrot' | 'potato' | 'strawberry' | 'tulip' | 'sunflower'`
- `CROPS: Record<CropId, { name: string; days: number; regrowDays?: number; seedPrice: number; sellPrice: number }>`
  - Days and regrowth as listed in Global Constraints.
  - Seed prices: 10, 15, 20, 40, 15, 30. Sell prices: 18, 28, 38, 22, 30, 60.
- `type ItemId = 'hoe' | 'can' | \`seed-${CropId}\` | CropId`
- `ITEMS: Record<ItemId, { name: string; kind: 'tool' | 'seed' | 'crop'; stack: number; icon: string }>`
  - Tools stack to 1, everything else to 99.
  - `icon` is the public path: `items/hoe.png`, `items/seed-turnip.png`, `crops/turnip-item.png`.
- `isItemId(v): v is ItemId`
- **Tests:**
  - Every crop has a seed item and a crop item.
  - Every crop sells for more than its seed costs, except strawberry, whose single harvest is 22 but which regrows.
  - Every icon path is unique.

### Task 2: The bag (`shared/src/bag.ts`)

- `BAG_SIZE = 24` slots. A slot is `Stack | null`, where `Stack` is `{ item: ItemId; count: number }`. The toolbar shows slots 0–8.
- `newBag(): Slot[]` holds the starting kit: hoe in slot 0, can in slot 1, 10 turnip seeds in slot 2. `STARTING_RUMIS = 50`.
- `canAdd(bag, item, count): boolean`
- `addItem(bag, item, count): Slot[] | null` fills existing stacks first, then empty slots. It returns `null`, with nothing changed, if it can't all fit.
- `removeItem(bag, slot, count): Slot[] | null`
- `countOf(bag, item): number`
- `swapSlots(bag, a, b): Slot[] | null`
- All of these are pure, and return a new array.
- **Tests:**
  - Stacking up to 99, then spilling into an empty slot.
  - A full bag returns `null` and is unchanged.
  - Removing more than a slot holds returns `null`.
  - Swapping out-of-range or non-integer slots returns `null`.
  - Tools never stack.

### Task 3: Farm rules (`shared/src/farm.ts`)

- `interface Plot { watered: boolean; crop: { id: CropId; days: number; harvested: number } | null }` and `type Farm = Record<string, Plot>`, keyed `"x,y"` in tiles. A key exists only for tilled tiles.
- `cropStage(crop): 0 | 1 | 2 | 3`
  - 3 means ripe, when `days >= growth`. Growth is `CROPS[id].days` for the first harvest, and `regrowDays` after that.
  - Otherwise the stage is `min(2, floor(days / growth * 3))`.
- `till(farm, zone, x, y)` works only on a `:` tile in the farm zone that isn't already tilled.
- `water(farm, x, y)` works on tilled soil, with or without a crop.
- `plant(farm, x, y, crop)` works on tilled soil with no crop.
- `harvest(farm, x, y)` works only on a ripe crop. It returns `{ farm, item: CropId }`. A regrowing crop resets to `days = 0` with `harvested + 1`; any other crop is removed, leaving the soil tilled.
- `nextDay(farm)`: every watered crop gains a day (ripe crops stay ripe), then all soil dries.
- `catchUp(farm, elapsedMs)`:
  - Computes `days = floor(elapsedMs / (24 * 60 * 1000))`.
  - Crops on watered soil gain `days` days, capped at ripe.
  - The soil stays watered.
  - Under one day, nothing changes.
- Each action returns the new farm, or `null` if it isn't allowed.
- **Tests:** each rule above; `catchUp` after 7 days ripens a turnip without over-ripening it, and a strawberry has only one harvest ready.

### Task 4: Server (`shared/src/world.ts`, `server/src/schema.ts`, `server/src/sim.ts`, `server/src/room.ts`)

- **Save format:**
  - `PlayerSave` gains `bag?: Slot[]` and `rumis?: number`. Missing values mean the starting kit and ◎ 50.
  - `WorldSave` gains `farm?: Farm`.
- **Synced state:** `SoilState { watered: boolean; crop: string; stage: number }`, in a map `WorldState.soil` keyed `"x,y"`. `crop` is `''` when there's no crop.
- **`WorldSim` additions:**
  - `farmAction(sid, msg: unknown): ActionResult`, where `msg` is `{ x, y, slot }` and the result is `{ ok: true; toast?: string } | { ok: false; toast: string }`.
    - The target tile must be within 1.5 tiles of the player's feet tile, and the player must be in the farm zone.
    - A ripe crop is harvested whatever the player is holding; the bag must have room, or the toast is "Your bag is full".
    - Otherwise it depends on the selected slot: hoe tills, can waters, and a seed plants (using one up).
  - `buy(sid, msg)` with `{ item: seed id, count: 1 | 10 }`, and `sell(sid, msg)` with `{ slot, count }`. Both require the market zone, within 3 tiles of the stall's counter, and a time from 08:00 to 18:00. Counts must be positive integers up to 99.
  - `swap(sid, a, b)`
  - `inventoryOf(sid): { bag: Slot[]; rumis: number }`
  - `newDay()` also runs `nextDay(farm)`.
- **On load:** if `emptySince` is set, apply `catchUp(farm, now - emptySince)` before syncing.
- **Room:** new messages `use`, `buy`, `sell` and `swap`. After any change, `client.send('inventory', inventoryOf(sid))`, and also on join.
- **Tests:**
  - Sim tests for each action, and each rejection in Review Focus 3.
  - `farmAction harvests once`.
  - A step-1 save gets the starting kit.
  - Integration: buy, plant, water, sleep, and the crop grows; another client sees the soil change.

### Task 5: Art

- `art/make_tiles.py`: add `soil` and `soil-wet` frames to the end of `tiles.png`, and to `TILE_FRAMES` on both sides.
- `art/source/items.png` (generated) goes into `make_sheets.py` as the `items` sheet. Its rows are `[tools, seeds1]` and `[seeds2]`, mapped to the file names `hoe`, `can`, `seed-turnip`, `seed-carrot`, `seed-potato`, `seed-strawberry`, `seed-tulip`, `seed-sunflower` in `client/public/items/`.
- Check the contact sheets by eye.

### Task 6: Client

- **Soil layer:** an image per `soil` entry at its tile, depth −5 (above the ground, below everything else). Crops are drawn bottom-centred on the tile, with depth set by their y.
- **Target cursor:** a 1 px plum-outlined square on the tile in front of the player, shown only on the farm plot.
- **Use:** E, Space or a click uses the selected slot on the target tile, and sends `use`.
- **Toolbar:** 9 DOM slots at the bottom centre, with icons and counts. Keys 1–9 and the mouse wheel select a slot. The selected slot is gold.
- **Bag:** Tab opens all 24 slots. Click one slot, then another, to swap them (`swap`).
- **Purse:** the pixel coin and the amount in VT323, under the world card.
- **Shop:** near the stall, "E · Open the shop" opens a panel:
  - **Buy** lists the six seeds with price and buttons for 1 and 10, disabled if you can't afford them.
  - **Sell** lists your crops with price, and buttons for 1 and all.
  - Closed hours show "The stall opens at 08:00".
- **Verify:** two browsers. A buys carrot seeds, then tills, plants and waters. Both go to bed, and B sees the crop at stage 1.

### Task 7: Finish

- Run the e2e check, update the README, run the full suite, and get one fresh review of the whole branch, then fix what it finds. Update the design doc's decisions log.
