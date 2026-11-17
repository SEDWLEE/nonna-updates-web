/** Public, non-secret configuration. Tokens and the PIN are never stored here. */
export const DATA_OWNER = "SEDWLEE";
export const DATA_REPO = "nonna-updates-data";
export const DATA_BRANCH = "main";
export const API_BASE = "https://api.github.com";

export const FILES = {
  feed: "feed.json",
  items: "items.json",
  checkouts: "checkouts.json",
  fleet: "fleet.json",
  stock: "stock.json",
  staff: "staff.json",
  bikeDetails: "bike-details.json",
  repairs: "repairs.json",
  stockDetails: "stock-details.json",
  stockCounts: "stock-counts.json",
  handover: "handover.json",
  optimo: "optimo-stats.json",
  cvDecisions: "cv-decisions.json",
};

/** Files this site may write. fleet.json, stock.json, and optimo-stats.json are never written. */
export const WRITABLE = new Set([
  FILES.items,
  FILES.checkouts,
  FILES.stockCounts,
  FILES.cvDecisions,
  FILES.handover,
  FILES.bikeDetails,
  FILES.stockDetails,
  FILES.repairs,
  FILES.staff,
]);

/** feed.json may only be written through the rota-portion merge helper. */
export const FEED_ROTA_ONLY = FILES.feed;

export const WHATSAPP_NUMBER = "447424687181";
export const TOKEN_SESSION_KEY = "nonna.githubToken";
export const TOKEN_REMEMBER_KEY = "nonna.githubToken.remember";
export const ACTOR_STORAGE_KEY = "nonna.actorName";
export const DEFAULT_ACTOR = "Sam";
export const MAX_WRITE_ATTEMPTS = 3;
export const PIN_LENGTH = 6;
export const PBKDF2_ITERATIONS = 600_000;
export const VAULT_URL = new URL("../vault.json", import.meta.url);

export const REPAIR_TYPES = [
  { id: "brakes", label: "Brakes" },
  { id: "tyre", label: "Tyre" },
  { id: "chain", label: "Chain" },
  { id: "lights", label: "Lights" },
  { id: "electrics", label: "Electrics" },
  { id: "other", label: "Other" },
];

export const ITEM_KINDS = [
  { id: "bike", label: "Bike" },
  { id: "battery", label: "Battery" },
  { id: "phone", label: "Phone" },
  { id: "lock", label: "Lock" },
  { id: "other", label: "Other" },
];
