export type CropId = 'turnip' | 'carrot' | 'potato' | 'strawberry' | 'tulip' | 'sunflower';

export interface CropInfo {
  name: string;
  /** Watered days from planting to the first harvest. */
  days: number;
  /** For crops that fruit again: watered days between harvests. */
  regrowDays?: number;
  seedPrice: number;
  sellPrice: number;
}

/** The step-2 crops. The other eight in the catalogue arrive with later steps. */
export const CROPS: Record<CropId, CropInfo> = {
  turnip: { name: 'Turnip', days: 3, seedPrice: 10, sellPrice: 18 },
  carrot: { name: 'Carrot', days: 4, seedPrice: 15, sellPrice: 28 },
  potato: { name: 'Potato', days: 5, seedPrice: 20, sellPrice: 38 },
  strawberry: { name: 'Strawberry', days: 6, regrowDays: 3, seedPrice: 40, sellPrice: 22 },
  tulip: { name: 'Tulip', days: 4, seedPrice: 15, sellPrice: 30 },
  sunflower: { name: 'Sunflower', days: 7, seedPrice: 30, sellPrice: 60 },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];

export type SeedId = `seed-${CropId}`;
export type ItemId = 'hoe' | 'can' | SeedId | CropId;

export interface ItemInfo {
  name: string;
  kind: 'tool' | 'seed' | 'crop';
  stack: number;
  /** Path under the client's public folder. */
  icon: string;
}

export const ITEMS = {
  hoe: { name: 'Hoe', kind: 'tool', stack: 1, icon: 'items/hoe.png' },
  can: { name: 'Watering can', kind: 'tool', stack: 1, icon: 'items/can.png' },
  ...Object.fromEntries(
    CROP_IDS.flatMap(c => [
      [`seed-${c}`, { name: `${CROPS[c].name} seeds`, kind: 'seed', stack: 99, icon: `items/seed-${c}.png` }],
      [c, { name: CROPS[c].name, kind: 'crop', stack: 99, icon: `crops/${c}-item.png` }],
    ]),
  ),
} as Record<ItemId, ItemInfo>;

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && Object.hasOwn(ITEMS, v);
}

export function isCropId(v: unknown): v is CropId {
  return typeof v === 'string' && Object.hasOwn(CROPS, v);
}

/** The crop a seed grows, or null if the item isn't a seed. */
export function cropOfSeed(item: ItemId): CropId | null {
  return item.startsWith('seed-') ? (item.slice(5) as CropId) : null;
}

/** The market stall's hours, in minutes after midnight: 08:00 to 18:00. */
export const SHOP_OPEN = 8 * 60;
export const SHOP_CLOSE = 18 * 60;
export function shopIsOpen(minute: number): boolean {
  const m = Math.floor(minute) % 1440;
  return m >= SHOP_OPEN && m < SHOP_CLOSE;
}
