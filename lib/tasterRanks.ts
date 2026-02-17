export interface Rank {
  key: string;
  kanji: string;
  romaji: string;
  english: string;
  minSakes: number;
  color: string; // tailwind-compatible hex
}

export const RANKS: Rank[] = [
  { key: "murabito", kanji: "村人", romaji: "Murabito", english: "Villager", minSakes: 0, color: "#FFFFFF" },
  { key: "ashigaru", kanji: "足軽", romaji: "Ashigaru", english: "Foot Soldier", minSakes: 3, color: "#79C39A" },
  { key: "ronin", kanji: "浪人", romaji: "Ronin", english: "Ronin", minSakes: 6, color: "#79C39A" },
  { key: "samurai", kanji: "侍", romaji: "Samurai", english: "Samurai", minSakes: 10, color: "#C4A35A" },
  { key: "daimyo", kanji: "大名", romaji: "Daimyō", english: "Feudal Lord", minSakes: 15, color: "#C4A35A" },
  { key: "shogun", kanji: "将軍", romaji: "Shōgun", english: "Shogun", minSakes: 20, color: "#FF0080" },
  { key: "tenno", kanji: "天皇", romaji: "Tennō", english: "Emperor", minSakes: 30, color: "#FF0080" },
];

export function getRank(sakeCount: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (sakeCount >= RANKS[i].minSakes) return RANKS[i];
  }
  return RANKS[0];
}

export function getNextRank(sakeCount: number): { nextRank: Rank; progress: number; remaining: number } | null {
  const currentRank = getRank(sakeCount);
  const currentIndex = RANKS.indexOf(currentRank);
  if (currentIndex >= RANKS.length - 1) return null; // Already max rank

  const nextRank = RANKS[currentIndex + 1];
  const rangeStart = currentRank.minSakes;
  const rangeEnd = nextRank.minSakes;
  const progress = (sakeCount - rangeStart) / (rangeEnd - rangeStart);
  const remaining = rangeEnd - sakeCount;

  return { nextRank, progress, remaining };
}
