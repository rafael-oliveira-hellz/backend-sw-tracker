import { DISCOVERED_MONSTER_NAMES } from "./monster-catalog.data";

export const getMonsterName = (monsterId: number): string | undefined =>
  DISCOVERED_MONSTER_NAMES[monsterId];

export const formatMonsterName = (monsterId: number): string =>
  getMonsterName(monsterId) ?? `Monstro #${monsterId}`;

export const formatMonsterNames = (monsterIds: number[]): string[] =>
  monsterIds.map((monsterId) => formatMonsterName(monsterId));

export const formatTeamLabelFromMonsterIds = (monsterIds: number[]): string =>
  formatMonsterNames(monsterIds).join(" / ");
