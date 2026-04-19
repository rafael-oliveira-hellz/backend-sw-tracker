import {
  formatMonsterName,
  formatMonsterNames,
  formatTeamLabelFromMonsterIds,
} from "./monster-catalog";
import { getMonsterElement, getMonsterNaturalStars } from "./monster-metadata";
import { calculateWeightedWinRate } from "../application/weekly-punishment-service";

type JsonObject = Record<string, any>;

export type GuildSnapshotEntry = {
  fileName: string;
  data: JsonObject | JsonObject[];
};

export type TeamComposition = {
  signature: string;
  monsters: number[];
  monsterNames: string[];
  label: string;
};

export type GuildMemberRole = "member" | "senior" | "vice-leader" | "leader";

export type TeamUsageSummary = {
  team: TeamComposition;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  contexts: string[];
};

export type AttackBattleRecord = {
  context: "guildWar" | "siege";
  battleId: string;
  matchId?: number;
  dateId?: number;
  occurredAt?: number;
  targetLabel: string;
  targetWizardId?: number;
  targetGuildId?: number;
  targetGuildName?: string;
  baseId?: number;
  baseNumber?: number;
  outcome: "win" | "loss" | "draw" | "unknown";
  scoreDelta?: number;
  team: TeamComposition;
};

export type DefenseUnitEquipment = {
  unitId?: number;
  unitMasterId?: number;
  position?: number;
  unitLevel?: number;
  monsterName: string;
  equippedRunesCount?: number;
  expectedRunesCount?: number;
  reportedRuneSlotsCoveredCount?: number;
  equippedArtifactsCount?: number;
  expectedArtifactsCount?: number;
  missingRunesCount?: number;
  missingArtifactsCount?: number;
  missingRuneSlots?: number[];
  missingArtifactSlots?: number[];
};

export type DefenseEquipmentAudit = {
  status: "ok" | "incomplete" | "unknown";
  canIdentifySlots: boolean;
  summary: string;
  issuesCount: number;
  units: DefenseUnitEquipment[];
};

export type DefenseComplianceIssue = {
  code:
    | "sameElementTeam"
    | "allBelowFiveStarsTeam"
    | "allNaturalFourTeam"
    | "belowLevelForty"
    | "missingRunes"
    | "missingArtifacts";
  summary: string;
  monsterNames: string[];
  monsterIds?: number[];
  element?: "water" | "fire" | "wind" | "light" | "dark";
  naturalStars?: number;
  affectedMonsterName?: string;
  missingRuneSlots?: number[];
  missingArtifactSlots?: number[];
};

export type DefenseComplianceAudit = {
  status: "ok" | "warning";
  summary: string;
  issuesCount: number;
  warningDeadlineAt?: string;
  issues: DefenseComplianceIssue[];
};

export type DefenseDeckSummary = {
  context: "guildWar" | "siege";
  deckId?: number;
  assignedBase?: number;
  round?: number;
  ratingId?: number;
  unitIds?: number[];
  team: TeamComposition;
  wins?: number;
  losses?: number;
  draws?: number;
  totalBattles?: number;
  winRate?: number;
  source: string;
  equipmentAudit?: DefenseEquipmentAudit;
  complianceAudit?: DefenseComplianceAudit;
};

export type SiegeGuildStanding = {
  guildId?: number;
  guildName?: string;
  posId?: number;
  ratingId?: number;
  matchScore?: number;
  matchScoreIncrement?: number;
  matchRank?: number;
  attackCount?: number;
  attackUnitCount?: number;
  playMemberCount?: number;
  lastUpdatedAt?: number;
  disqualified?: boolean;
  result: "win" | "loss" | "unknown";
};

export type SiegeMatchSummary = {
  siegeId?: number;
  matchId?: number;
  seasonType?: number;
  currentGuildId?: number;
  currentGuildName?: string;
  result: "win" | "loss" | "unknown";
  currentGuildStanding?: SiegeGuildStanding;
  opponents: SiegeGuildStanding[];
  source: string;
  updatedAt?: number;
};

export type MemberCoverage = {
  attendance: boolean;
  subjugation: boolean;
  labyrinth: boolean;
  guildWarAttacks: boolean;
  guildWarDefenses: boolean;
  siegeAttacks: boolean;
  siegeDefenses: boolean;
};

export type MemberProvenance = {
  attendance: string[];
  subjugation: string[];
  labyrinth: string[];
  guildWarAttacks: string[];
  guildWarDefenses: string[];
  siegeAttacks: string[];
  siegeDefenses: string[];
};

export type MemberLeadershipPayload = {
  member: {
    wizardId: number;
    wizardName: string;
    channelUid?: number;
    level?: number;
    ratingId?: number;
    joinedAt?: string;
    guildId?: number;
    guildName?: string;
    guildRole?: GuildMemberRole;
    guildGrade?: number;
    isCurrentUser?: boolean;
  };
  attendance: {
    attendedToday?: boolean;
    rewardClaimed?: boolean;
    date?: string;
  };
  subjugation: {
    clearScore?: number;
    contributeRatio?: number;
    rank?: number;
    lastUpdated?: string;
  };
  labyrinth: {
    score?: number;
    contributionRate?: number;
    rank?: number;
    isMvp?: boolean;
  };
  guildWar: {
    currentAttackCount?: number;
    currentEnergy?: number;
    attacks: AttackBattleRecord[];
    teams: TeamUsageSummary[];
    defenses: DefenseDeckSummary[];
  };
  siege: {
    attacks: AttackBattleRecord[];
    teams: TeamUsageSummary[];
    defenses: DefenseDeckSummary[];
  };
  coverage: MemberCoverage;
  provenance: MemberProvenance;
};

export type GuildLeadershipPayload = {
  generatedAt: string;
  mergePolicy: {
    fileOrdering: "fileNameAsc";
    duplicateResolution: "latestFileWins";
    notes: string;
  };
  activeRosterWizardIds: number[];
  members: MemberLeadershipPayload[];
  siegeMatches: SiegeMatchSummary[];
};

type MemberAccumulator = {
  member: MemberLeadershipPayload["member"];
  attendance: MemberLeadershipPayload["attendance"];
  subjugation: MemberLeadershipPayload["subjugation"];
  labyrinth: MemberLeadershipPayload["labyrinth"];
  guildWarAttacks: AttackBattleRecord[];
  guildWarDefenses: DefenseDeckSummary[];
  guildWarTeamStats: Map<string, TeamUsageAccumulator>;
  siegeAttacks: AttackBattleRecord[];
  siegeDefenses: DefenseDeckSummary[];
  siegeTeamStats: Map<string, TeamUsageAccumulator>;
  guildWarCurrentAttackCount?: number;
  guildWarCurrentEnergy?: number;
  coverage: MemberCoverage;
  provenance: {
    attendance: Set<string>;
    subjugation: Set<string>;
    labyrinth: Set<string>;
    guildWarAttacks: Set<string>;
    guildWarDefenses: Set<string>;
    siegeAttacks: Set<string>;
    siegeDefenses: Set<string>;
  };
};

type TeamUsageAccumulator = {
  team: TeamComposition;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  contexts: Set<string>;
};

const CURRENT_USER_WIZARD_ID = 32343714;

const mapGuildGradeToRole = (grade?: number): GuildMemberRole | undefined => {
  if (grade === 1) {
    return "leader";
  }

  if (grade === 3) {
    return "vice-leader";
  }

  if (grade === 4) {
    return "senior";
  }

  if (grade === 2) {
    return "member";
  }

  return undefined;
};

const outcomeMap: Record<number, AttackBattleRecord["outcome"]> = {
  1: "win",
  2: "loss",
  3: "draw",
};

const asArray = <T,>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
};

const toNumberArray = (value: unknown): number[] =>
  asArray(value as number[]).filter((item): item is number => typeof item === "number");

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const decodeCommand = (entry: GuildSnapshotEntry): string => {
  if (Array.isArray(entry.data)) {
    const first = entry.data[0] as JsonObject | undefined;

    if (first?.command) {
      return String(first.command);
    }
  }

  if (!Array.isArray(entry.data) && entry.data?.command) {
    return String(entry.data.command);
  }

  if (entry.fileName.includes("3MDCMonsterMap")) {
    return "3MDCMonsterMap";
  }

  return entry.fileName;
};

const createTeam = (monsters: number[]): TeamComposition => {
  const cleaned = monsters.filter((monster): monster is number => Number.isFinite(monster));
  const signature = [...cleaned].sort((a, b) => a - b).join("-");
  const monsterNames = formatMonsterNames(cleaned);

  return {
    signature,
    monsters: cleaned,
    monsterNames,
    label: formatTeamLabelFromMonsterIds(cleaned),
  };
};

const buildEquipmentSummary = (units: DefenseUnitEquipment[], status: DefenseEquipmentAudit["status"]) => {
  if (status === "unknown") {
    return "Export atual nao traz dados suficientes para auditar runas e artefatos dessa defesa.";
  }

  const incompleteUnits = units.filter(
    (unit) => (unit.missingRunesCount ?? 0) > 0 || (unit.missingArtifactsCount ?? 0) > 0,
  );

  if (incompleteUnits.length === 0) {
    return "Todas as unidades da defesa estao com 6 runas e 2 artefatos no resumo do export.";
  }

  return incompleteUnits
    .map((unit) => {
      const parts: string[] = [];
      if ((unit.missingRunesCount ?? 0) > 0) {
        parts.push(`${unit.equippedRunesCount ?? 0}/${unit.expectedRunesCount ?? 6} runas`);
      }
      if ((unit.missingArtifactsCount ?? 0) > 0) {
        parts.push(
          `${unit.equippedArtifactsCount ?? 0}/${unit.expectedArtifactsCount ?? 2} artefatos`,
        );
      }
      return `${unit.monsterName}: ${parts.join(", ")}`;
    })
    .join(" | ");
};

const createUnknownEquipmentAudit = (): DefenseEquipmentAudit => ({
  status: "unknown",
  canIdentifySlots: false,
  summary: buildEquipmentSummary([], "unknown"),
  issuesCount: 0,
  units: [],
});

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

const getDefenseWarningDeadlineAt = (reference = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(reference);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const dayOffsets: Record<string, number> = {
    Sun: 1,
    Mon: 0,
    Tue: -1,
    Wed: -2,
    Thu: -3,
    Fri: -4,
    Sat: -5,
  };
  const nextMonday = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  nextMonday.setUTCDate(nextMonday.getUTCDate() + (dayOffsets[weekday] ?? 0));
  return nextMonday.toISOString();
};

const describeElement = (element: NonNullable<ReturnType<typeof getMonsterElement>>) => {
  switch (element) {
    case "water":
      return "Água";
    case "fire":
      return "Fogo";
    case "wind":
      return "Vento";
    case "light":
      return "Luz";
    case "dark":
      return "Trevas";
  }
};

const buildDefenseComplianceSummary = (issues: DefenseComplianceIssue[]) =>
  issues.length > 0
    ? issues.map((issue) => issue.summary).join(" | ")
    : "Nenhum alerta de composição ou equipamento foi detectado nessa defesa.";

const createDefenseComplianceAudit = (
  context: "guildWar" | "siege",
  team: TeamComposition,
  equipmentAudit: DefenseEquipmentAudit | undefined,
  warningDeadlineAt = getDefenseWarningDeadlineAt(),
): DefenseComplianceAudit => {
  const issues: DefenseComplianceIssue[] = [];
  const elements = team.monsters
    .map((monsterId) => getMonsterElement(monsterId))
    .filter((element): element is NonNullable<ReturnType<typeof getMonsterElement>> => Boolean(element));

  if (
    elements.length === team.monsters.length &&
    elements.length > 0 &&
    elements.every((element) => element === elements[0]) &&
    !["light", "dark"].includes(elements[0])
  ) {
    issues.push({
      code: "sameElementTeam",
      summary: `Os 3 monstros da defesa são do mesmo elemento (${describeElement(elements[0])}).`,
      monsterNames: team.monsterNames,
      monsterIds: team.monsters,
      element: elements[0],
    });
  }

  const naturalStars = team.monsters
    .map((monsterId) => getMonsterNaturalStars(monsterId))
    .filter((value): value is number => Number.isFinite(value));

  if (naturalStars.length === team.monsters.length && naturalStars.length > 0) {
    if (context === "guildWar" && naturalStars.every((value) => value < 5)) {
      issues.push({
        code: "allBelowFiveStarsTeam",
        summary: "Na GW, os 3 monstros da defesa estão abaixo de 5 estrelas naturais.",
        monsterNames: team.monsterNames,
        monsterIds: team.monsters,
      });
    }
  }

  for (const unit of equipmentAudit?.units ?? []) {
    if ((unit.unitLevel ?? 40) < 40) {
      issues.push({
        code: "belowLevelForty",
        summary: `${unit.monsterName} est\u00e1 abaixo do n\u00edvel 40 (${unit.unitLevel ?? 0}/40).`,
        monsterNames: [unit.monsterName],
        affectedMonsterName: unit.monsterName,
      });
    }

    if ((unit.missingRunesCount ?? 0) > 0) {
      issues.push({
        code: "missingRunes",
        summary: `${unit.monsterName} est\u00e1 com ${unit.equippedRunesCount ?? 0}/${unit.expectedRunesCount ?? 6} runas.`,
        monsterNames: [unit.monsterName],
        affectedMonsterName: unit.monsterName,
        missingRuneSlots: unit.missingRuneSlots,
      });
    }

    if ((unit.missingArtifactsCount ?? 0) > 0) {
      issues.push({
        code: "missingArtifacts",
        summary: `${unit.monsterName} est\u00e1 com ${unit.equippedArtifactsCount ?? 0}/${unit.expectedArtifactsCount ?? 2} artefatos.`,
        monsterNames: [unit.monsterName],
        affectedMonsterName: unit.monsterName,
        missingArtifactSlots: unit.missingArtifactSlots,
      });
    }
  }

  return {
    status: issues.length > 0 ? "warning" : "ok",
    summary: buildDefenseComplianceSummary(issues),
    issuesCount: issues.length,
    warningDeadlineAt,
    issues,
  };
};

const createSiegeEquipmentAudit = (
  units: Array<{
    unitId?: number;
    unitMasterId?: number;
    position?: number;
    unitLevel?: number;
  }>,
  equipSummaryByUnitId: Map<number, number[]>,
): DefenseEquipmentAudit => {
  const detailedUnits: DefenseUnitEquipment[] = units.map((unit) => {
    const summary = unit.unitId ? equipSummaryByUnitId.get(unit.unitId) : undefined;
    const reportedEquippedRunesCount = toOptionalNumber(summary?.[1]);
    const reportedRuneSlotsCoveredCount = toOptionalNumber(summary?.[2]);
    const equippedRunesCount =
      reportedEquippedRunesCount !== undefined && reportedRuneSlotsCoveredCount !== undefined
        ? Math.min(reportedEquippedRunesCount, reportedRuneSlotsCoveredCount)
        : reportedEquippedRunesCount ?? reportedRuneSlotsCoveredCount;
    const equippedArtifactsCount = toOptionalNumber(summary?.[3]);
    const expectedRunesCount = 6;
    const expectedArtifactsCount = 2;

    return {
      unitId: unit.unitId,
      unitMasterId: unit.unitMasterId,
      position: unit.position,
      unitLevel: unit.unitLevel,
      monsterName: formatMonsterName(unit.unitMasterId ?? 0),
      equippedRunesCount,
      expectedRunesCount,
      reportedRuneSlotsCoveredCount,
      equippedArtifactsCount,
      expectedArtifactsCount,
      missingRunesCount:
        equippedRunesCount !== undefined ? Math.max(0, expectedRunesCount - equippedRunesCount) : undefined,
      missingArtifactsCount:
        equippedArtifactsCount !== undefined
          ? Math.max(0, expectedArtifactsCount - equippedArtifactsCount)
          : undefined,
    };
  });

  return createEquipmentAuditFromUnits(detailedUnits);
};

const roundWinRate = (wins: number, losses: number, draws: number) =>
  calculateWeightedWinRate(wins, losses, draws);

const MAX_GUILD_WAR_DEFENSES = 10;
const MAX_SIEGE_DEFENSES = 10;

const createMemberAccumulator = (wizardId: number): MemberAccumulator => ({
  member: {
    wizardId,
    wizardName: `Wizard ${wizardId}`,
    isCurrentUser: wizardId === CURRENT_USER_WIZARD_ID,
  },
  attendance: {},
  subjugation: {},
  labyrinth: {},
  guildWarAttacks: [],
  guildWarDefenses: [],
  guildWarTeamStats: new Map<string, TeamUsageAccumulator>(),
  siegeAttacks: [],
  siegeDefenses: [],
  siegeTeamStats: new Map<string, TeamUsageAccumulator>(),
  coverage: {
    attendance: false,
    subjugation: false,
    labyrinth: false,
    guildWarAttacks: false,
    guildWarDefenses: false,
    siegeAttacks: false,
    siegeDefenses: false,
  },
  provenance: {
    attendance: new Set<string>(),
    subjugation: new Set<string>(),
    labyrinth: new Set<string>(),
    guildWarAttacks: new Set<string>(),
    guildWarDefenses: new Set<string>(),
    siegeAttacks: new Set<string>(),
    siegeDefenses: new Set<string>(),
  },
});

const getMember = (members: Map<number, MemberAccumulator>, wizardId?: number | null) => {
  if (!wizardId) {
    return null;
  }

  const existing = members.get(wizardId);

  if (existing) {
    return existing;
  }

  const created = createMemberAccumulator(wizardId);
  members.set(wizardId, created);
  return created;
};

const mergeMemberInfo = (
  member: MemberAccumulator | null,
  source: Partial<MemberLeadershipPayload["member"]> & { wizardId?: number },
) => {
  if (!member) {
    return;
  }

  member.member = {
    ...member.member,
    ...Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== undefined && value !== null),
    ),
  };
};

const registerProvenance = (
  member: MemberAccumulator | null,
  bucket: keyof MemberProvenance,
  source: string,
) => {
  if (!member) {
    return;
  }

  member.provenance[bucket].add(source);
  member.coverage[bucket] = true;
};

const registerTeamUsage = (
  teamMap: Map<string, TeamUsageAccumulator>,
  context: string,
  team: TeamComposition,
  outcome: AttackBattleRecord["outcome"],
) => {
  const bucket =
    teamMap.get(team.signature) ??
    {
      team,
      totalBattles: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      contexts: new Set<string>(),
    };

  bucket.totalBattles += 1;
  bucket.contexts.add(context);

  if (outcome === "win") {
    bucket.wins += 1;
  } else if (outcome === "loss") {
    bucket.losses += 1;
  } else if (outcome === "draw") {
    bucket.draws += 1;
  }

  teamMap.set(team.signature, bucket);
};

const resolveDefenseWinRate = (
  rawWinRate: unknown,
  wins?: number,
  losses?: number,
  draws?: number,
) => {
  const parsedWinRate = toOptionalNumber(rawWinRate);

  if (parsedWinRate !== undefined) {
    return parsedWinRate;
  }

  const total = (wins ?? 0) + (losses ?? 0) + (draws ?? 0);
  return total > 0 ? roundWinRate(wins ?? 0, losses ?? 0, draws ?? 0) : undefined;
};

const mergeDefenseDeckSummary = (
  existing: DefenseDeckSummary,
  incoming: DefenseDeckSummary,
): DefenseDeckSummary => ({
  context: incoming.context,
  deckId: incoming.deckId ?? existing.deckId,
  assignedBase: incoming.assignedBase ?? existing.assignedBase,
  round: incoming.round ?? existing.round,
  ratingId: incoming.ratingId ?? existing.ratingId,
  unitIds: incoming.unitIds?.length ? incoming.unitIds : existing.unitIds,
  team: incoming.team.monsters.length > 0 ? incoming.team : existing.team,
  wins: incoming.wins ?? existing.wins,
  losses: incoming.losses ?? existing.losses,
  draws: incoming.draws ?? existing.draws,
  totalBattles: incoming.totalBattles ?? existing.totalBattles,
  winRate: incoming.winRate ?? existing.winRate,
  source: incoming.source || existing.source,
  equipmentAudit: incoming.equipmentAudit ?? existing.equipmentAudit,
  complianceAudit: incoming.complianceAudit ?? existing.complianceAudit,
});

const buildDefenseDeckKey = (defense: DefenseDeckSummary) => {
  if (defense.deckId !== undefined) {
    return `deck:${defense.deckId}`;
  }

  if (defense.context === "guildWar") {
    return `gw:${defense.round ?? "?"}:${defense.team.signature}`;
  }

  return `siege:${defense.assignedBase ?? "?"}:${defense.team.signature}`;
};

const upsertDefenseDeck = (
  member: MemberAccumulator | null,
  bucket: "guildWarDefenses" | "siegeDefenses",
  incoming: DefenseDeckSummary,
) => {
  if (!member) {
    return;
  }

  const existingIndex = member[bucket].findIndex(
    (defense) => buildDefenseDeckKey(defense) === buildDefenseDeckKey(incoming),
  );

  if (existingIndex >= 0) {
    member[bucket][existingIndex] = mergeDefenseDeckSummary(member[bucket][existingIndex], incoming);
    return;
  }

  member[bucket].push(incoming);
};

const sortAndLimitDefenses = (
  defenses: DefenseDeckSummary[],
  maxDecks: number,
): DefenseDeckSummary[] =>
  [...defenses]
    .sort((left, right) => {
      if (left.context !== right.context) {
        return left.context.localeCompare(right.context);
      }

      if (left.context === "guildWar") {
        return (
          (left.round ?? Number.MAX_SAFE_INTEGER) -
            (right.round ?? Number.MAX_SAFE_INTEGER) ||
          (left.deckId ?? Number.MAX_SAFE_INTEGER) -
            (right.deckId ?? Number.MAX_SAFE_INTEGER)
        );
      }

      return (
        (left.assignedBase ?? Number.MAX_SAFE_INTEGER) -
          (right.assignedBase ?? Number.MAX_SAFE_INTEGER) ||
        (left.deckId ?? Number.MAX_SAFE_INTEGER) -
          (right.deckId ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, maxDecks);

const propagateSharedEquipmentAudits = (members: Map<number, MemberAccumulator>) => {
  for (const member of members.values()) {
    const siegeIssueByUnitId = new Map<number, DefenseUnitEquipment>();

    for (const defense of member.siegeDefenses) {
      for (const unit of defense.equipmentAudit?.units ?? []) {
        if (
          unit.unitId !== undefined &&
          ((unit.missingRunesCount ?? 0) > 0 ||
            (unit.missingArtifactsCount ?? 0) > 0 ||
            (unit.unitLevel ?? 40) < 40)
        ) {
          siegeIssueByUnitId.set(unit.unitId, unit);
        }
      }
    }

    if (siegeIssueByUnitId.size === 0) {
      continue;
    }

    member.guildWarDefenses = member.guildWarDefenses.map((defense) => {
      const sharedUnits = (defense.unitIds ?? [])
        .map((unitId) => siegeIssueByUnitId.get(unitId))
        .filter((unit): unit is DefenseUnitEquipment => Boolean(unit));

      if (sharedUnits.length === 0) {
        return defense;
      }

      const equipmentAudit = createEquipmentAuditFromUnits(sharedUnits);

      return {
        ...defense,
        equipmentAudit,
        complianceAudit: createDefenseComplianceAudit("guildWar", defense.team, equipmentAudit),
      };
    });
  }
};

const summarizeTeams = (teamMap: Map<string, TeamUsageAccumulator>): TeamUsageSummary[] =>
  [...teamMap.values()]
    .map((bucket) => ({
      team: bucket.team,
      totalBattles: bucket.totalBattles,
      wins: bucket.wins,
      losses: bucket.losses,
      draws: bucket.draws,
      winRate: roundWinRate(bucket.wins, bucket.losses, bucket.draws),
      contexts: [...bucket.contexts].sort(),
    }))
    .sort((left, right) => {
      if (right.winRate !== left.winRate) {
        return right.winRate - left.winRate;
      }

      return right.totalBattles - left.totalBattles;
    });

const extractMonsterIdMap = (entries: GuildSnapshotEntry[]) => {
  const monsterMap = new Map<number, number>();

  for (const entry of entries) {
    if (!entry.fileName.includes("3MDCMonsterMap") || !Array.isArray(entry.data)) {
      continue;
    }

    for (const item of entry.data) {
      const nestedMap = item?.monsterIDMap ?? {};

      for (const [uniqueId, monsterId] of Object.entries(nestedMap)) {
        const unique = Number(uniqueId);
        const monster = Number(monsterId);

        if (Number.isFinite(unique) && Number.isFinite(monster)) {
          monsterMap.set(unique, monster);
        }
      }
    }
  }

  return monsterMap;
};

const parseGuildWarDefenseDecks = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
  monsterMap: Map<number, number>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  for (const deck of asArray(entry.data.deck_list)) {
    const wizardId = Number(deck?.wizard_id);
    const deckId = Number(deck?.deck_id);
    const unitIds = toNumberArray(deck?.unit_id_list);
    const mappedUnits = unitIds
      .map((unitId) => monsterMap.get(unitId))
      .filter((value): value is number => Number.isFinite(value));

    if (!wizardId || !deckId || mappedUnits.length === 0) {
      continue;
    }

    const member = getMember(members, wizardId);
    const team = createTeam(mappedUnits);
    const equipmentAudit = createUnknownEquipmentAudit();
    mergeMemberInfo(member, { wizardId });
    registerProvenance(member, "guildWarDefenses", entry.fileName);
    upsertDefenseDeck(member, "guildWarDefenses", {
      context: "guildWar",
      deckId,
      round: toOptionalNumber(deck?.round),
      ratingId: member?.member.ratingId,
      unitIds,
      team,
      source: entry.fileName,
      equipmentAudit,
      complianceAudit: createDefenseComplianceAudit("guildWar", team, equipmentAudit),
    });
  }
};

const parseGuildWarDefenseSummariesFromGuildDataAll = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
  monsterMap: Map<number, number>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  const participationInfo = entry.data.GetServerGuildWarParticipationInfo ?? entry.data;

  for (const guildMemberDefense of asArray(participationInfo.guild_member_defense_list)) {
    const wizardId = toOptionalNumber(guildMemberDefense?.wizard_id);
    const member = getMember(members, wizardId);

    if (!member || wizardId === undefined) {
      continue;
    }

    mergeMemberInfo(member, {
      wizardId,
      guildId: toOptionalNumber(participationInfo.match_info?.guild_id),
      guildName: participationInfo.match_info?.guild_name,
    });
    registerProvenance(member, "guildWarDefenses", entry.fileName);

    for (const deck of asArray(guildMemberDefense?.deck_list)) {
      const deckId = toOptionalNumber(deck?.deck_id);

      if (deckId === undefined) {
        continue;
      }

      const wins = toOptionalNumber(deck?.total_win_count ?? deck?.win_count) ?? 0;
      const draws = toOptionalNumber(deck?.total_draw_count ?? deck?.draw_count) ?? 0;
      const losses = toOptionalNumber(deck?.total_lose_count ?? deck?.lose_count) ?? 0;
      const totalBattles =
        toOptionalNumber(deck?.total_count) ?? wins + draws + losses;
      const monsters = toNumberArray(deck?.unit_id_list)
        .map((unitId) => monsterMap.get(unitId))
        .filter((monsterId): monsterId is number => Number.isFinite(monsterId));
      const team = createTeam(monsters);
      const equipmentAudit = createUnknownEquipmentAudit();

      upsertDefenseDeck(member, "guildWarDefenses", {
        context: "guildWar",
        deckId,
        round: toOptionalNumber(deck?.round),
        ratingId: member.member.ratingId,
        unitIds: toNumberArray(deck?.unit_id_list).filter((unitId) => Number.isFinite(unitId)),
        team,
        wins,
        losses,
        draws,
        totalBattles,
        winRate: resolveDefenseWinRate(deck?.winning_rate, wins, losses, draws),
        source: entry.fileName,
        equipmentAudit,
        complianceAudit: createDefenseComplianceAudit("guildWar", team, equipmentAudit),
      });
    }
  }
};

const parseGuildWarMatchInfo = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  const payload = entry.data.GetServerGuildWarMatchInfo ?? entry.data;

  for (const attackEntry of asArray(payload.my_attack_list)) {
    const member = getMember(members, Number(attackEntry?.wizard_id));
    mergeMemberInfo(member, {
      wizardId: Number(attackEntry?.wizard_id),
      guildId: toOptionalNumber(attackEntry?.guild_id),
    });

    if (!member) {
      continue;
    }

    registerProvenance(member, "guildWarAttacks", entry.fileName);
    member.guildWarCurrentAttackCount = Number(attackEntry?.attack_count ?? 0);
    member.guildWarCurrentEnergy = Number(attackEntry?.energy ?? 0);
  }

  for (const base of asArray(payload.base_info_list)) {
    const member = getMember(members, Number(base?.wizard_id));
    mergeMemberInfo(member, {
      wizardId: Number(base?.wizard_id),
      wizardName: base?.wizard_name,
      channelUid: Number(base?.channel_uid),
      level: Number(base?.wizard_level),
      ratingId: Number(base?.arena_rating_id),
      guildId: toOptionalNumber(base?.guild_id),
      guildName: payload.server_guildwar_match_info?.guild_name,
    });
  }
};

const parseGuildWarBattleLogs = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  const battleLogGroups = [
    ...asArray(entry.data.match_log_list).map((matchLog) => matchLog?.battle_log_list),
    ...asArray(entry.data.battle_log_list),
  ];

  for (const battleLogGroup of battleLogGroups) {
    for (const battleLog of asArray(battleLogGroup)) {
      const attacker = battleLog?.user_list?.[0];
      const defender = battleLog?.user_list?.[1];
      const member = getMember(members, Number(attacker?.wizard_id));

      mergeMemberInfo(member, {
        wizardId: Number(attacker?.wizard_id),
        wizardName: attacker?.wizard_name,
        channelUid: Number(attacker?.channel_uid),
        level: Number(attacker?.wizard_level),
        guildId: toOptionalNumber(attacker?.guild_id),
        guildName: attacker?.guild_name,
      });

      const myTeams = asArray(battleLog?.view_battle_deck_info?.[0]);
      const outcomes = toNumberArray(battleLog?.win_lose_list);

      myTeams.forEach((teamUnits, index) => {
        const team = createTeam(toNumberArray(teamUnits));
        const outcome = outcomeMap[outcomes[index]] ?? "unknown";

        if (!member) {
          return;
        }

        const record: AttackBattleRecord = {
          context: "guildWar",
          battleId: `${battleLog?.battle_key ?? battleLog?.log_id}-${index + 1}`,
          matchId: Number(battleLog?.match_id),
          dateId: Number(battleLog?.date_id),
          occurredAt: Number(battleLog?.log_ts),
          targetLabel: `${defender?.wizard_name ?? "Unknown"} @ base ${battleLog?.base_id ?? "?"}`,
          targetWizardId: Number(defender?.wizard_id),
          targetGuildId: toOptionalNumber(defender?.guild_id),
          targetGuildName: defender?.guild_name,
          baseId: Number(battleLog?.base_id),
          outcome,
          scoreDelta: Number(battleLog?.guild_point_var_list?.[index] ?? 0),
          team,
        };

        registerProvenance(member, "guildWarAttacks", entry.fileName);
        member.guildWarAttacks.push(record);
        if (team.monsters.length > 0) {
          registerTeamUsage(member.guildWarTeamStats, `base:${battleLog?.base_id}`, team, outcome);
        }
      });
    }
  }
};

const parseGuildMazeContribute = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  for (const wizard of asArray(entry.data.wizard_info_list)) {
    const member = getMember(members, Number(wizard?.wizard_id));
    mergeMemberInfo(member, {
      wizardId: Number(wizard?.wizard_id),
      wizardName: wizard?.wizard_name,
      channelUid: Number(wizard?.channel_uid),
      level: Number(wizard?.wizard_level),
      ratingId: Number(wizard?.rating_id),
    });
  }

  for (const contribution of asArray(entry.data.guildmaze_contribute_info_list)) {
    const member = getMember(members, Number(contribution?.wizard_id));

    if (!member) {
      continue;
    }

    registerProvenance(member, "labyrinth", entry.fileName);
    member.labyrinth = {
      score: Number(contribution?.score ?? 0),
      contributionRate: Number(contribution?.contribute ?? 0),
      rank: Number(contribution?.rank ?? 0),
      isMvp: Boolean(contribution?.mvp),
    };
  }

  const mvp = entry.data.guildmaze_mvp_info;
  const mvpMember = getMember(members, Number(mvp?.wizard_id));

  if (mvpMember) {
    mvpMember.labyrinth.isMvp = true;
  }
};

const parseGuildBossContribute = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  for (const score of asArray(entry.data.clear_score_info)) {
    const member = getMember(members, Number(score?.wizard_id));
    mergeMemberInfo(member, {
      wizardId: Number(score?.wizard_id),
      wizardName: score?.wizard_name,
      channelUid: Number(score?.channel_uid),
      level: Number(score?.wizard_level),
      ratingId: Number(score?.rating_id),
      guildId: toOptionalNumber(score?.guild_id),
    });

    if (!member) {
      continue;
    }

    registerProvenance(member, "subjugation", entry.fileName);
    member.subjugation = {
      clearScore: Number(score?.clear_score ?? 0),
      contributeRatio: Number(score?.contribute_ratio ?? 0),
      rank: Number(score?.rank ?? 0),
      lastUpdated: score?.clear_score_modify,
    };
  }
};

const parseAttendance = (entry: GuildSnapshotEntry, members: Map<number, MemberAccumulator>) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  for (const attendance of asArray(entry.data.attend_member_list)) {
    const member = getMember(members, Number(attendance?.wizard_id));

    if (!member) {
      continue;
    }

    registerProvenance(member, "attendance", entry.fileName);
    member.attendance = {
      attendedToday: true,
      rewardClaimed: Number(attendance?.reward_state) === 1,
      date: attendance?.date_attend,
    };
  }
};

const parseActiveRosterSnapshot = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(entry.data)) {
    return [];
  }

  const guildInfo = entry.data.guild_info ?? entry.data.guild ?? {};
  const guildName = guildInfo?.name;
  const guildId = toOptionalNumber(guildInfo?.guild_id);
  const guildMembers =
    entry.data.guild_members ??
    entry.data.guild?.guild_members ??
    entry.data.guild_info?.guild_members ??
    entry.data.guild?.guild_info?.guild_members ??
    {};
  const activeRosterWizardIds: number[] = [];

  for (const guildMember of Object.values(guildMembers)) {
    const memberData = guildMember as JsonObject;
    const wizardId = Number(memberData?.wizard_id);
    if (!Number.isFinite(wizardId) || wizardId <= 0) {
      continue;
    }

    activeRosterWizardIds.push(wizardId);
    const grade = Number(memberData?.grade);
    const member = getMember(members, wizardId);

    mergeMemberInfo(member, {
      wizardId,
      wizardName: memberData?.wizard_name,
      channelUid: Number(memberData?.channel_uid),
      level: Number(memberData?.wizard_level),
      ratingId: Number(memberData?.rating_id),
      guildId,
      guildName,
      guildGrade: grade,
      guildRole: mapGuildGradeToRole(grade),
      joinedAt:
        Number.isFinite(Number(memberData?.join_timestamp)) && Number(memberData?.join_timestamp) > 0
          ? new Date(Number(memberData.join_timestamp) * 1000).toISOString()
          : undefined,
    });
  }

  return [...new Set(activeRosterWizardIds)].sort((left, right) => left - right);
};

const createEquipmentAuditFromUnits = (
  units: DefenseUnitEquipment[],
): DefenseEquipmentAudit => {
  const issuesCount = units.filter(
    (unit) => (unit.missingRunesCount ?? 0) > 0 || (unit.missingArtifactsCount ?? 0) > 0,
  ).length;
  const status: DefenseEquipmentAudit["status"] = issuesCount > 0 ? "incomplete" : "ok";

  return {
    status,
    canIdentifySlots: false,
    summary: buildEquipmentSummary(units, status),
    issuesCount,
    units,
  };
};

const parseSiegeDefenseDecks = (
  defenseEntry: GuildSnapshotEntry,
  deckUnitsEntry: GuildSnapshotEntry | undefined,
  members: Map<number, MemberAccumulator>,
) => {
  if (Array.isArray(defenseEntry.data)) {
    return;
  }

  const deckUnitMap = new Map<
    number,
    Array<{
      position?: number;
      unitId?: number;
      unitMasterId?: number;
    }>
  >();

  if (deckUnitsEntry && !Array.isArray(deckUnitsEntry.data)) {
    for (const deck of asArray(deckUnitsEntry.data.deck_units)) {
      const deckId = Number(deck?.deck_id);
      const team = [deck?.mon1, deck?.mon2, deck?.mon3].map((monster, index) => ({
        position: index + 1,
        unitMasterId: Number(monster),
      }));

      if (deckId && team.some((unit) => Number.isFinite(unit.unitMasterId))) {
        deckUnitMap.set(deckId, team);
      }
    }
  }

  for (const defenseUnit of asArray(defenseEntry.data.defense_unit_list)) {
    const deckId = Number(defenseUnit?.deck_id);
    if (!deckId) {
      continue;
    }

    const units = deckUnitMap.get(deckId) ?? [];
    const nextUnit = {
      position: toOptionalNumber(defenseUnit?.pos_id),
      unitId: toOptionalNumber(defenseUnit?.unit_info?.unit_id),
      unitMasterId: toOptionalNumber(defenseUnit?.unit_info?.unit_master_id),
      unitLevel: toOptionalNumber(defenseUnit?.unit_info?.unit_level),
    };
    const existingIndex = units.findIndex((unit) => unit.position === nextUnit.position);

    if (existingIndex >= 0) {
      units[existingIndex] = nextUnit;
    } else {
      units.push(nextUnit);
    }

    deckUnitMap.set(deckId, units);
  }

  for (const wizard of asArray(defenseEntry.data.wizard_info_list)) {
    const member = getMember(members, Number(wizard?.wizard_id));
    mergeMemberInfo(member, {
      wizardId: Number(wizard?.wizard_id),
      wizardName: wizard?.wizard_name,
      channelUid: Number(wizard?.channel_uid),
      level: Number(wizard?.wizard_level),
      guildId: toOptionalNumber(wizard?.guild_id),
      ratingId: toOptionalNumber(wizard?.rating_id),
    });
  }

  const assignmentMap = new Map<number, number>();
  for (const assignment of asArray(defenseEntry.data.defense_assign_list)) {
    assignmentMap.set(Number(assignment?.deck_id), Number(assignment?.base_number));
  }

  const equipSummaryByUnitId = new Map<number, number[]>();
  for (const equipSummary of asArray(defenseEntry.data.defense_unit_equip_info_summary)) {
    const values = toNumberArray(equipSummary);
    const unitId = values[0];

    if (!Number.isFinite(unitId)) {
      continue;
    }

    equipSummaryByUnitId.set(unitId, values);
  }

  for (const deck of asArray(defenseEntry.data.defense_deck_list)) {
    const wizardId = Number(deck?.wizard_id);
    const deckId = Number(deck?.deck_id);
    const member = getMember(members, wizardId);
    const units = (deckUnitMap.get(deckId) ?? []).filter((unit) =>
      Number.isFinite(unit.unitMasterId),
    );
    const monsters = units
      .map((unit) => unit.unitMasterId)
      .filter((monster): monster is number => Number.isFinite(monster));

    if (!member || monsters.length === 0) {
      continue;
    }

    registerProvenance(member, "siegeDefenses", defenseEntry.fileName);
    const wins = Number(deck?.total_win_count ?? deck?.win_count ?? 0);
    const losses = Number(deck?.total_lose_count ?? deck?.lose_count ?? 0);
    const draws = Number(deck?.total_draw_count ?? deck?.draw_count ?? 0);
    const team = createTeam(monsters);
    const equipmentAudit = createSiegeEquipmentAudit(units, equipSummaryByUnitId);
    upsertDefenseDeck(member, "siegeDefenses", {
      context: "siege",
      deckId,
      assignedBase: assignmentMap.get(deckId),
      ratingId: member.member.ratingId,
      unitIds: units
        .map((unit) => unit.unitId)
        .filter((unitId): unitId is number => Number.isFinite(unitId)),
      team,
      wins,
      losses,
      draws,
      totalBattles: Number(deck?.total_count ?? wins + losses + draws),
      winRate: resolveDefenseWinRate(deck?.winning_rate, wins, losses, draws),
      source: defenseEntry.fileName,
      equipmentAudit,
      complianceAudit: createDefenseComplianceAudit("siege", team, equipmentAudit),
    });
  }
};

const buildSiegeStanding = (guildInfo: JsonObject): SiegeGuildStanding => {
  const rank = toOptionalNumber(guildInfo?.match_rank);
  const result =
    rank === 1 ? "win" : rank !== undefined ? "loss" : "unknown";

  return {
    guildId: toOptionalNumber(guildInfo?.guild_id),
    guildName: guildInfo?.guild_name,
    posId: toOptionalNumber(guildInfo?.pos_id),
    ratingId: toOptionalNumber(guildInfo?.rating_id),
    matchScore: toOptionalNumber(guildInfo?.match_score),
    matchScoreIncrement: toOptionalNumber(guildInfo?.match_score_increment),
    matchRank: rank,
    attackCount: toOptionalNumber(guildInfo?.attack_count),
    attackUnitCount: toOptionalNumber(guildInfo?.attack_unit_count),
    playMemberCount: toOptionalNumber(guildInfo?.play_member_count),
    lastUpdatedAt: toOptionalNumber(guildInfo?.match_score_last_update_time),
    disqualified: Number(guildInfo?.disqualified ?? 0) === 1,
    result,
  };
};

const registerSiegeMatchSummary = (
  entry: GuildSnapshotEntry,
  logList: JsonObject,
  siegeMatches: Map<string, SiegeMatchSummary>,
) => {
  const siegeId = toOptionalNumber(logList?.guild_info_list?.[0]?.siege_id ?? logList?.siege_id);
  const matchId = toOptionalNumber(logList?.guild_info_list?.[0]?.match_id ?? logList?.match_id);
  const battleLogs = asArray(logList?.battle_log_list);
  const currentGuildId = toOptionalNumber(battleLogs[0]?.guild_id);
  const currentGuildName =
    typeof battleLogs[0]?.guild_name === "string" && battleLogs[0].guild_name.trim() !== ""
      ? battleLogs[0].guild_name
      : undefined;
  const standings = asArray(logList?.guild_info_list).map((guildInfo) =>
    buildSiegeStanding(guildInfo),
  );
  const currentGuildStanding =
    standings.find((standing) => standing.guildId === currentGuildId) ??
    standings.find((standing) => standing.guildName === currentGuildName);

  const summary: SiegeMatchSummary = {
    siegeId,
    matchId,
    seasonType: toOptionalNumber(logList?.season_type),
    currentGuildId,
    currentGuildName,
    result: currentGuildStanding?.result ?? "unknown",
    currentGuildStanding,
    opponents: standings.filter((standing) => standing.guildId !== currentGuildId),
    source: entry.fileName,
    updatedAt:
      currentGuildStanding?.lastUpdatedAt ??
      battleLogs.reduce<number | undefined>((latest, battle) => {
        const next = toOptionalNumber(battle?.log_timestamp);
        if (next === undefined) {
          return latest;
        }

        return latest === undefined ? next : Math.max(latest, next);
      }, undefined),
  };

  const key = `${summary.siegeId ?? "unknown"}:${summary.matchId ?? "unknown"}`;
  siegeMatches.set(key, summary);
};

const parseSiegeBattleLogs = (
  entry: GuildSnapshotEntry,
  members: Map<number, MemberAccumulator>,
  siegeMatches: Map<string, SiegeMatchSummary>,
) => {
  if (Array.isArray(entry.data)) {
    return;
  }

  for (const logList of asArray(entry.data.log_list)) {
    registerSiegeMatchSummary(entry, logList, siegeMatches);

    for (const battle of asArray(logList?.battle_log_list)) {
      const member = getMember(members, Number(battle?.wizard_id));
      mergeMemberInfo(member, {
        wizardId: Number(battle?.wizard_id),
        wizardName: battle?.wizard_name,
        channelUid: Number(battle?.channel_uid),
        level: Number(battle?.wizard_level),
        guildId: toOptionalNumber(battle?.guild_id),
        guildName: battle?.guild_name,
      });

      const teamValues = Object.values(battle?.view_battle_deck_info ?? {});
      const firstTeam = createTeam(toNumberArray(teamValues[0]));
      const outcome = outcomeMap[Number(battle?.win_lose)] ?? "unknown";

      if (!member) {
        continue;
      }

      const record: AttackBattleRecord = {
        context: "siege",
        battleId: String(battle?.log_id ?? `${battle?.match_id}-${battle?.base_number}`),
        matchId: Number(battle?.match_id),
        dateId: Number(battle?.siege_id),
        occurredAt: Number(battle?.log_timestamp),
        targetLabel: `${battle?.opp_wizard_name ?? "Unknown"} @ base ${battle?.base_number ?? "?"}`,
        targetWizardId: Number(battle?.opp_wizard_id),
        targetGuildId: toOptionalNumber(battle?.opp_guild_id),
        targetGuildName: battle?.opp_guild_name,
        baseNumber: Number(battle?.base_number),
        outcome,
        scoreDelta: Number(battle?.match_score_var ?? 0),
        team: firstTeam,
      };

      registerProvenance(member, "siegeAttacks", entry.fileName);
      member.siegeAttacks.push(record);
      if (firstTeam.monsters.length > 0) {
        registerTeamUsage(member.siegeTeamStats, `base:${battle?.base_number}`, firstTeam, outcome);
      }
    }
  }
};

export const buildGuildLeadershipPayload = (
  snapshots: GuildSnapshotEntry[],
): GuildLeadershipPayload => {
  const members = new Map<number, MemberAccumulator>();
  const siegeMatches = new Map<string, SiegeMatchSummary>();
  let activeRosterWizardIds: number[] = [];
  const monsterMap = extractMonsterIdMap(snapshots);
  const siegeDeckUnitsEntry = snapshots.find(
    (entry) => decodeCommand(entry) === "SWGTSiegeDeckUnits",
  );

  for (const entry of snapshots) {
    const command = decodeCommand(entry);

    switch (command) {
      case "GetServerGuildWarBattleLogByGuild":
        parseGuildWarBattleLogs(entry, members);
        break;
      case "GetServerGuildWarDefenseDeckList":
        parseGuildWarDefenseDecks(entry, members, monsterMap);
        break;
      case "GetServerGuildWarMatchInfo":
        parseGuildWarMatchInfo(entry, members);
        break;
      case "GetGuildDataAll":
        parseGuildWarMatchInfo(entry, members);
        parseGuildWarDefenseSummariesFromGuildDataAll(entry, members, monsterMap);
        break;
      case "GetGuildMazeContributeList":
        parseGuildMazeContribute(entry, members);
        break;
      case "getGuildBossContributeList":
        parseGuildBossContribute(entry, members);
        break;
      case "getGuildAttendInfo":
        parseAttendance(entry, members);
        break;
      case "GetGuildInfo": {
        const rosterWizardIds = parseActiveRosterSnapshot(entry, members);
        if (rosterWizardIds.length > 0) {
          activeRosterWizardIds = rosterWizardIds;
        }
        break;
      }
      case "HubUserLogin":
      case "SWGT-HubUserLogin": {
        const rosterWizardIds = parseActiveRosterSnapshot(entry, members);
        if (rosterWizardIds.length > 0) {
          activeRosterWizardIds = rosterWizardIds;
        }
        break;
      }
      case "GetGuildSiegeBattleLog":
      case "GetGuildSiegeBattleLogByWizardId":
        parseSiegeBattleLogs(entry, members, siegeMatches);
        break;
      case "GetGuildSiegeDefenseDeckByWizardId":
        parseSiegeDefenseDecks(entry, siegeDeckUnitsEntry, members);
        break;
      default:
        break;
    }
  }

  propagateSharedEquipmentAudits(members);

  return {
    generatedAt: new Date().toISOString(),
    mergePolicy: {
      fileOrdering: "fileNameAsc",
      duplicateResolution: "latestFileWins",
      notes: "Arquivos sao ordenados por nome; quando ha duplicidade, o mais novo processado por ultimo prevalece para campos escalares.",
    },
    activeRosterWizardIds,
    members: [...members.values()]
      .map((member) => ({
        member: member.member,
        attendance: member.attendance,
        subjugation: member.subjugation,
        labyrinth: member.labyrinth,
        guildWar: {
          currentAttackCount: member.guildWarCurrentAttackCount,
          currentEnergy: member.guildWarCurrentEnergy,
          attacks: member.guildWarAttacks.sort(
            (left, right) => (right.occurredAt ?? 0) - (left.occurredAt ?? 0),
          ),
          teams: summarizeTeams(member.guildWarTeamStats),
          defenses: sortAndLimitDefenses(member.guildWarDefenses, MAX_GUILD_WAR_DEFENSES),
        },
        siege: {
          attacks: member.siegeAttacks.sort(
            (left, right) => (right.occurredAt ?? 0) - (left.occurredAt ?? 0),
          ),
          teams: summarizeTeams(member.siegeTeamStats),
          defenses: sortAndLimitDefenses(member.siegeDefenses, MAX_SIEGE_DEFENSES),
        },
        coverage: member.coverage,
        provenance: {
          attendance: [...member.provenance.attendance].sort(),
          subjugation: [...member.provenance.subjugation].sort(),
          labyrinth: [...member.provenance.labyrinth].sort(),
          guildWarAttacks: [...member.provenance.guildWarAttacks].sort(),
          guildWarDefenses: [...member.provenance.guildWarDefenses].sort(),
          siegeAttacks: [...member.provenance.siegeAttacks].sort(),
          siegeDefenses: [...member.provenance.siegeDefenses].sort(),
        },
      }))
      .sort((left, right) => left.member.wizardName.localeCompare(right.member.wizardName)),
    siegeMatches: [...siegeMatches.values()].sort(
      (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
    ),
  };
};

export const flattenMembersForBackend = (payload: GuildLeadershipPayload) =>
  payload.members.map((member) => ({
    wizardId: member.member.wizardId,
    member: member.member,
    attendance: member.attendance,
    subjugation: member.subjugation,
    labyrinth: member.labyrinth,
    guildWar: member.guildWar,
    siege: member.siege,
    coverage: member.coverage,
    provenance: member.provenance,
  }));
