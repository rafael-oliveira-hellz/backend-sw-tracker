export type BattleContext = "guildWar" | "siege";
export type BattleOutcome = "win" | "loss" | "draw" | "unknown";

export interface TeamCompositionDto {
  signature: string;
  monsters: number[];
  monsterNames: string[];
  label: string;
}

export interface TeamUsageSummaryDto {
  team: TeamCompositionDto;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  contexts: string[];
}

export interface AttackBattleRecordDto {
  context: BattleContext;
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
  outcome: BattleOutcome;
  scoreDelta?: number;
  team: TeamCompositionDto;
}

export interface DefenseUnitEquipmentDto {
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
}

export interface DefenseEquipmentAuditDto {
  status: "ok" | "incomplete" | "unknown";
  canIdentifySlots: boolean;
  summary: string;
  issuesCount: number;
  units: DefenseUnitEquipmentDto[];
}

export interface DefenseComplianceIssueDto {
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
}

export interface DefenseComplianceAuditDto {
  status: "ok" | "warning";
  summary: string;
  issuesCount: number;
  warningDeadlineAt?: string;
  issues: DefenseComplianceIssueDto[];
}

export interface DefenseDeckSummaryDto {
  context: BattleContext;
  deckId?: number;
  assignedBase?: number;
  round?: number;
  ratingId?: number;
  unitIds?: number[];
  team: TeamCompositionDto;
  wins?: number;
  losses?: number;
  draws?: number;
  totalBattles?: number;
  winRate?: number;
  source: string;
  equipmentAudit?: DefenseEquipmentAuditDto;
  complianceAudit?: DefenseComplianceAuditDto;
}

export interface SiegeGuildStandingDto {
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
  result: BattleOutcome;
}

export interface SiegeMatchSummaryDto {
  siegeId?: number;
  matchId?: number;
  seasonType?: number;
  currentGuildId?: number;
  currentGuildName?: string;
  result: BattleOutcome;
  currentGuildStanding?: SiegeGuildStandingDto;
  opponents: SiegeGuildStandingDto[];
  source: string;
  updatedAt?: number;
}

export interface MemberProfileDto {
  wizardId: number;
  wizardName: string;
  channelUid?: number;
  level?: number;
  ratingId?: number;
  joinedAt?: string;
  guildId?: number;
  guildName?: string;
  guildRole?: "member" | "senior" | "vice-leader" | "leader";
  guildGrade?: number;
  isCurrentUser?: boolean;
}

export interface AttendanceDto {
  attendedToday?: boolean;
  rewardClaimed?: boolean;
  date?: string;
}

export interface SubjugationDto {
  clearScore?: number;
  contributeRatio?: number;
  rank?: number;
  lastUpdated?: string;
  weekNum?: number;
  miniBossTypes?: number[];
  bossTypes?: number[];
  battleLogs?: Array<{
    battleType: number;
    clearScore?: number;
    battleCount?: number;
    dateAdd?: string;
    dateMod?: string;
    bossDetected?: boolean;
  }>;
}

export interface LabyrinthDto {
  score?: number;
  contributionRate?: number;
  rank?: number;
  isMvp?: boolean;
}

export interface MemberCoverageDto {
  attendance: boolean;
  subjugation: boolean;
  labyrinth: boolean;
  guildWarAttacks: boolean;
  guildWarDefenses: boolean;
  siegeAttacks: boolean;
  siegeDefenses: boolean;
}

export interface MemberProvenanceDto {
  attendance: string[];
  subjugation: string[];
  labyrinth: string[];
  guildWarAttacks: string[];
  guildWarDefenses: string[];
  siegeAttacks: string[];
  siegeDefenses: string[];
}

export interface GuildWarMemberDto {
  currentAttackCount?: number;
  currentEnergy?: number;
  attacks: AttackBattleRecordDto[];
  teams: TeamUsageSummaryDto[];
  defenses: DefenseDeckSummaryDto[];
}

export interface SiegeMemberDto {
  attacks: AttackBattleRecordDto[];
  teams: TeamUsageSummaryDto[];
  defenses: DefenseDeckSummaryDto[];
}

export interface GuildMemberSnapshotDto {
  wizardId: number;
  member: MemberProfileDto;
  attendance: AttendanceDto;
  subjugation: SubjugationDto;
  labyrinth: LabyrinthDto;
  guildWar: GuildWarMemberDto;
  siege: SiegeMemberDto;
  coverage: MemberCoverageDto;
  provenance: MemberProvenanceDto;
}

export interface GuildLeadershipMergePolicyDto {
  fileOrdering: "fileNameAsc";
  duplicateResolution: "latestFileWins";
  notes: string;
}

export interface UploadedGuildFileDto {
  fileName: string;
  content: string;
}

export interface ImportGuildFilesRequestDto {
  files: UploadedGuildFileDto[];
  sourceLabel?: string;
}

export interface GuildImportRunDto {
  importedAt: string;
  sourceFolder: string;
  totalFilesRead: number;
}

export interface GuildImportSourceDto {
  fileName: string;
  command: string;
  usedInAggregation: boolean;
  priorityOrder: number;
}

export interface GuildLeadershipSnapshotDto {
  generatedAt: string;
  sourceFolder: string;
  filesRead: string[];
  guildId?: number;
  guildName?: string;
  currentUserWizardId?: number;
  siegeMatches: SiegeMatchSummaryDto[];
  mergePolicy: GuildLeadershipMergePolicyDto;
}

export interface GuildAttackEventDto {
  wizardId: number;
  memberName: string;
  context: BattleContext;
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
  outcome: BattleOutcome;
  scoreDelta?: number;
  teamSignature: string;
  teamLabel: string;
  monsters: number[];
  monsterNames: string[];
}

export interface GuildDefenseDeckDto {
  wizardId: number;
  memberName: string;
  context: BattleContext;
  deckId?: number;
  assignedBase?: number;
  round?: number;
  ratingId?: number;
  unitIds?: number[];
  source: string;
  teamSignature: string;
  teamLabel: string;
  monsters: number[];
  monsterNames: string[];
  wins?: number;
  losses?: number;
  draws?: number;
  totalBattles?: number;
  winRate?: number;
  equipmentAudit?: DefenseEquipmentAuditDto;
  complianceAudit?: DefenseComplianceAuditDto;
}

export interface GuildTeamUsageDto {
  wizardId: number;
  memberName: string;
  context: BattleContext;
  teamSignature: string;
  teamLabel: string;
  monsters: number[];
  monsterNames: string[];
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  contexts: string[];
}

export interface GuildLeadershipPersistenceDto {
  importRun: GuildImportRunDto;
  importSources: GuildImportSourceDto[];
  snapshot: GuildLeadershipSnapshotDto;
  activeRosterWizardIds: number[];
  members: GuildMemberSnapshotDto[];
  attacks: GuildAttackEventDto[];
  defenses: GuildDefenseDeckDto[];
  teamUsage: GuildTeamUsageDto[];
}

export interface GuildImportHistoryItemDto {
  importRunId: string;
  snapshotId: string;
  importedAt: string;
  generatedAt: string;
  sourceFolder: string;
  guildId?: number;
  guildName?: string;
  currentUserWizardId?: number;
  totalFilesRead: number;
  sourcesSaved: number;
  membersSaved: number;
  attacksSaved: number;
  defensesSaved: number;
  teamUsageSaved: number;
}

export interface GuildImportHistoryDetailDto {
  history: GuildImportHistoryItemDto;
  importSources: GuildImportSourceDto[];
  snapshot: GuildLeadershipSnapshotDto;
}

export interface GuildCurrentMemberStateDto {
  guildId?: number;
  guildName?: string;
  importRunId: string;
  snapshotId: string;
  updatedAt: string;
  wizardId: number;
  member: MemberProfileDto;
  attendance: AttendanceDto;
  subjugation: SubjugationDto;
  labyrinth: LabyrinthDto;
  guildWar: GuildWarMemberDto;
  siege: SiegeMemberDto;
  coverage: MemberCoverageDto;
  provenance: MemberProvenanceDto;
}

export interface GuildCurrentStateDto {
  guildId?: number;
  guildName?: string;
  importRunId: string;
  snapshotId: string;
  updatedAt: string;
  activeRosterWizardIds: number[];
  siegeMatches: SiegeMatchSummaryDto[];
  members: GuildCurrentMemberStateDto[];
}

export interface LabyrinthParticipationEntryDto {
  wizardId: number;
  memberName: string;
  validAttacks: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface LabyrinthCycleDto {
  guildId?: number;
  guildName?: string;
  cycleStartDate: string;
  expectedDurationDays: number;
  requiredAttacksByDay: number[];
  actualDurationDays?: number;
  isConcluded: boolean;
  concludedAt?: string;
  concludedBy?: string;
  updatedAt: string;
  updatedBy?: string;
  entries: LabyrinthParticipationEntryDto[];
}

export type WeeklyPunishmentEventKey =
  | "guildWar"
  | "siege"
  | "guildWarDefenseSetup"
  | "siegeDefenseSetup"
  | "guildWarDefenseCompliance"
  | "siegeDefenseCompliance"
  | "labyrinth"
  | "subjugation";

export interface WeeklyPunishmentEventAssessmentDto {
  eventKey: WeeklyPunishmentEventKey;
  label: string;
  required: boolean;
  completed: number;
  expected: number;
  punishmentApplied: boolean;
  reason: string;
}

export interface GuildWeeklyPunishmentDto {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  evaluatedAt: string;
  guildId?: number;
  guildName?: string;
  importRunId: string;
  snapshotId: string;
  wizardId: number;
  memberName: string;
  role?: "member" | "senior" | "vice-leader" | "leader";
  cooldownActive: boolean;
  punishmentApplied: boolean;
  markedForRemoval: boolean;
  punishedEventKeys: WeeklyPunishmentEventKey[];
  reasonSummary: string;
  removalReasonSummary?: string;
  nextEligiblePenaltyAt?: string;
  events: WeeklyPunishmentEventAssessmentDto[];
}

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuildImportRunEntity extends BaseEntity {
  sourceFolder: string;
  importedAt: string;
  totalFilesRead: number;
}

export interface GuildImportSourceEntity extends BaseEntity {
  importRunId: string;
  fileName: string;
  command: string;
  usedInAggregation: boolean;
  priorityOrder: number;
}

export interface GuildSnapshotEntity extends BaseEntity {
  importRunId: string;
  guildId?: number;
  guildName?: string;
  generatedAt: string;
  sourceFolder: string;
  filesReadJson: string;
  currentUserWizardId?: number;
  siegeMatchesJson: string;
  mergePolicyJson: string;
}

export interface GuildMemberSnapshotEntity extends BaseEntity {
  snapshotId: string;
  wizardId: number;
  wizardName: string;
  channelUid?: number;
  level?: number;
  ratingId?: number;
  guildId?: number;
  guildName?: string;
  guildRole?: "member" | "senior" | "vice-leader" | "leader";
  guildGrade?: number;
  isCurrentUser: boolean;
  attendedToday: boolean;
  rewardClaimed: boolean;
  attendanceDate?: string;
  subjugationClearScore?: number;
  subjugationContributeRatio?: number;
  subjugationRank?: number;
  subjugationLastUpdated?: string;
  labyrinthScore?: number;
  labyrinthContributionRate?: number;
  labyrinthRank?: number;
  labyrinthIsMvp: boolean;
  guildWarCurrentAttackCount?: number;
  guildWarCurrentEnergy?: number;
  coverageJson: string;
  provenanceJson: string;
}

export interface GuildAttackEventEntity extends BaseEntity {
  snapshotId: string;
  wizardId: number;
  memberName: string;
  context: BattleContext;
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
  outcome: BattleOutcome;
  scoreDelta?: number;
  teamSignature: string;
  teamLabel: string;
  monstersJson: string;
  monsterNamesJson: string;
}

export interface GuildDefenseDeckEntity extends BaseEntity {
  snapshotId: string;
  wizardId: number;
  memberName: string;
  context: BattleContext;
  deckId?: number;
  assignedBase?: number;
  round?: number;
  ratingId?: number;
  unitIdsJson?: string;
  source: string;
  teamSignature: string;
  teamLabel: string;
  monstersJson: string;
  monsterNamesJson: string;
  wins?: number;
  losses?: number;
  draws?: number;
  totalBattles?: number;
  winRate?: number;
  equipmentAuditJson?: string;
  complianceAuditJson?: string;
}

export interface GuildTeamUsageEntity extends BaseEntity {
  snapshotId: string;
  wizardId: number;
  memberName: string;
  context: BattleContext;
  teamSignature: string;
  teamLabel: string;
  monstersJson: string;
  monsterNamesJson: string;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  contextsJson: string;
}

export interface GuildWeeklyPunishmentEntity extends BaseEntity {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  evaluatedAt: string;
  guildId?: number;
  guildName?: string;
  importRunId: string;
  snapshotId: string;
  wizardId: number;
  memberName: string;
  role?: "member" | "senior" | "vice-leader" | "leader";
  cooldownActive: boolean;
  punishmentApplied: boolean;
  markedForRemoval: boolean;
  punishedEventKeysJson: string;
  reasonSummary: string;
  removalReasonSummary?: string;
  nextEligiblePenaltyAt?: string;
  eventsJson: string;
}

export interface LabyrinthCycleEntity extends BaseEntity {
  guildId?: number;
  guildName?: string;
  cycleStartDate: string;
  expectedDurationDays: number;
  requiredAttacksByDayJson: string;
  actualDurationDays?: number;
  isConcluded: boolean;
  concludedAt?: string;
  concludedBy?: string;
  updatedBy?: string;
  entriesJson: string;
}

export interface GuildLeadershipPersistenceEntities {
  importRun: GuildImportRunEntity;
  importSources: GuildImportSourceEntity[];
  snapshot: GuildSnapshotEntity;
  members: GuildMemberSnapshotEntity[];
  attacks: GuildAttackEventEntity[];
  defenses: GuildDefenseDeckEntity[];
  teamUsage: GuildTeamUsageEntity[];
}

export interface EntityIdFactory {
  (): string;
}

const defaultIdFactory: EntityIdFactory = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

export function mapDtoToEntities(
  dto: GuildLeadershipPersistenceDto,
  createId: EntityIdFactory = defaultIdFactory,
): GuildLeadershipPersistenceEntities {
  const timestamp = nowIso();
  const importRunId = createId();
  const snapshotId = createId();

  const importRun: GuildImportRunEntity = {
    id: importRunId,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceFolder: dto.importRun.sourceFolder,
    importedAt: dto.importRun.importedAt,
    totalFilesRead: dto.importRun.totalFilesRead,
  };

  const importSources: GuildImportSourceEntity[] = dto.importSources.map((source) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    importRunId,
    fileName: source.fileName,
    command: source.command,
    usedInAggregation: source.usedInAggregation,
    priorityOrder: source.priorityOrder,
  }));

  const snapshot: GuildSnapshotEntity = {
    id: snapshotId,
    createdAt: timestamp,
    updatedAt: timestamp,
    importRunId,
    guildId: dto.snapshot.guildId,
    guildName: dto.snapshot.guildName,
    generatedAt: dto.snapshot.generatedAt,
    sourceFolder: dto.snapshot.sourceFolder,
    filesReadJson: JSON.stringify(dto.snapshot.filesRead),
    currentUserWizardId: dto.snapshot.currentUserWizardId,
    siegeMatchesJson: JSON.stringify(dto.snapshot.siegeMatches),
    mergePolicyJson: JSON.stringify(dto.snapshot.mergePolicy),
  };

  const members: GuildMemberSnapshotEntity[] = dto.members.map((member) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshotId,
    wizardId: member.wizardId,
    wizardName: member.member.wizardName,
    channelUid: member.member.channelUid,
    level: member.member.level,
    ratingId: member.member.ratingId,
    guildId: member.member.guildId,
    guildName: member.member.guildName,
    guildRole: member.member.guildRole,
    guildGrade: member.member.guildGrade,
    isCurrentUser: Boolean(member.member.isCurrentUser),
    attendedToday: Boolean(member.attendance.attendedToday),
    rewardClaimed: Boolean(member.attendance.rewardClaimed),
    attendanceDate: member.attendance.date,
    subjugationClearScore: member.subjugation.clearScore,
    subjugationContributeRatio: member.subjugation.contributeRatio,
    subjugationRank: member.subjugation.rank,
    subjugationLastUpdated: member.subjugation.lastUpdated,
    labyrinthScore: member.labyrinth.score,
    labyrinthContributionRate: member.labyrinth.contributionRate,
    labyrinthRank: member.labyrinth.rank,
    labyrinthIsMvp: Boolean(member.labyrinth.isMvp),
    guildWarCurrentAttackCount: member.guildWar.currentAttackCount,
    guildWarCurrentEnergy: member.guildWar.currentEnergy,
    coverageJson: JSON.stringify(member.coverage),
    provenanceJson: JSON.stringify(member.provenance),
  }));

  const attacks: GuildAttackEventEntity[] = dto.attacks.map((attack) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshotId,
    wizardId: attack.wizardId,
    memberName: attack.memberName,
    context: attack.context,
    battleId: attack.battleId,
    matchId: attack.matchId,
    dateId: attack.dateId,
    occurredAt: attack.occurredAt,
    targetLabel: attack.targetLabel,
    targetWizardId: attack.targetWizardId,
    targetGuildId: attack.targetGuildId,
    targetGuildName: attack.targetGuildName,
    baseId: attack.baseId,
    baseNumber: attack.baseNumber,
    outcome: attack.outcome,
    scoreDelta: attack.scoreDelta,
    teamSignature: attack.teamSignature,
    teamLabel: attack.teamLabel,
    monstersJson: JSON.stringify(attack.monsters),
    monsterNamesJson: JSON.stringify(attack.monsterNames),
  }));

  const defenses: GuildDefenseDeckEntity[] = dto.defenses.map((defense) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshotId,
    wizardId: defense.wizardId,
    memberName: defense.memberName,
      context: defense.context,
      deckId: defense.deckId,
      assignedBase: defense.assignedBase,
      round: defense.round,
      ratingId: defense.ratingId,
      unitIdsJson: defense.unitIds ? JSON.stringify(defense.unitIds) : undefined,
      source: defense.source,
    teamSignature: defense.teamSignature,
    teamLabel: defense.teamLabel,
    monstersJson: JSON.stringify(defense.monsters),
    monsterNamesJson: JSON.stringify(defense.monsterNames),
    wins: defense.wins,
    losses: defense.losses,
    draws: defense.draws,
    totalBattles: defense.totalBattles,
    winRate: defense.winRate,
    equipmentAuditJson: defense.equipmentAudit
      ? JSON.stringify(defense.equipmentAudit)
      : undefined,
    complianceAuditJson: defense.complianceAudit
      ? JSON.stringify(defense.complianceAudit)
      : undefined,
  }));

  const teamUsage: GuildTeamUsageEntity[] = dto.teamUsage.map((usage) => ({
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshotId,
    wizardId: usage.wizardId,
    memberName: usage.memberName,
    context: usage.context,
    teamSignature: usage.teamSignature,
    teamLabel: usage.teamLabel,
    monstersJson: JSON.stringify(usage.monsters),
    monsterNamesJson: JSON.stringify(usage.monsterNames),
    totalBattles: usage.totalBattles,
    wins: usage.wins,
    losses: usage.losses,
    draws: usage.draws,
    winRate: usage.winRate,
    contextsJson: JSON.stringify(usage.contexts),
  }));

  return {
    importRun,
    importSources,
    snapshot,
    members,
    attacks,
    defenses,
    teamUsage,
  };
}

export function buildCurrentGuildState(
  dto: GuildLeadershipPersistenceDto,
  entities: GuildLeadershipPersistenceEntities,
): GuildCurrentStateDto {
  const updatedAt = entities.snapshot.generatedAt;
  const activeRosterSet = new Set(dto.activeRosterWizardIds);

  return {
    guildId: dto.snapshot.guildId,
    guildName: dto.snapshot.guildName,
    importRunId: entities.importRun.id,
    snapshotId: entities.snapshot.id,
    updatedAt,
    activeRosterWizardIds: [...dto.activeRosterWizardIds],
    siegeMatches: dto.snapshot.siegeMatches,
    members: dto.members
      .filter((member) =>
        activeRosterSet.size === 0 ? true : activeRosterSet.has(member.wizardId),
      )
      .map((member) => ({
        guildId: member.member.guildId ?? dto.snapshot.guildId,
        guildName: member.member.guildName ?? dto.snapshot.guildName,
        importRunId: entities.importRun.id,
        snapshotId: entities.snapshot.id,
        updatedAt,
        wizardId: member.wizardId,
        member: member.member,
        attendance: member.attendance,
        subjugation: member.subjugation,
        labyrinth: member.labyrinth,
        guildWar: member.guildWar,
        siege: member.siege,
        coverage: member.coverage,
        provenance: member.provenance,
      })),
  };
}


const pickDefined = <T>(incoming: T | undefined, current: T | undefined): T | undefined =>
  incoming ?? current;

const buildAttackIdentity = (attack: AttackBattleRecordDto) =>
  [
    attack.context,
    attack.battleId,
    attack.matchId ?? '',
    attack.baseId ?? attack.baseNumber ?? '',
    attack.targetWizardId ?? '',
    attack.dateId ?? '',
  ].join(':');

const mergeAttackRecords = (
  existing: AttackBattleRecordDto[],
  incoming: AttackBattleRecordDto[],
) => {
  const merged = new Map<string, AttackBattleRecordDto>();

  for (const attack of existing) {
    merged.set(buildAttackIdentity(attack), attack);
  }

  for (const attack of incoming) {
    merged.set(buildAttackIdentity(attack), attack);
  }

  return [...merged.values()].sort((left, right) => (right.occurredAt ?? 0) - (left.occurredAt ?? 0));
};

const buildDefenseIdentity = (defense: DefenseDeckSummaryDto) => {
  if (defense.deckId !== undefined) {
    return `${defense.context}:deck:${defense.deckId}`;
  }

  return [
    defense.context,
    defense.round ?? '',
    defense.assignedBase ?? '',
    defense.team.signature,
  ].join(':');
};

const mergeDefenseSummaries = (
  existing: DefenseDeckSummaryDto[],
  incoming: DefenseDeckSummaryDto[],
) => {
  const merged = new Map<string, DefenseDeckSummaryDto>();

  for (const defense of existing) {
    merged.set(buildDefenseIdentity(defense), defense);
  }

  for (const defense of incoming) {
    const key = buildDefenseIdentity(defense);
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? {
            ...previous,
            ...defense,
            team: defense.team.monsters.length ? defense.team : previous.team,
            equipmentAudit: defense.equipmentAudit ?? previous.equipmentAudit,
            complianceAudit: defense.complianceAudit ?? previous.complianceAudit,
          }
        : defense,
    );
  }

  return [...merged.values()];
};

const mergeTeamUsageSummaries = (
  existing: TeamUsageSummaryDto[],
  incoming: TeamUsageSummaryDto[],
) => {
  const merged = new Map<string, TeamUsageSummaryDto>();

  for (const team of existing) {
    merged.set(team.team.signature, {
      ...team,
      contexts: [...team.contexts],
    });
  }

  for (const team of incoming) {
    const previous = merged.get(team.team.signature);
    if (!previous) {
      merged.set(team.team.signature, {
        ...team,
        contexts: [...team.contexts],
      });
      continue;
    }

    const wins = previous.wins + team.wins;
    const losses = previous.losses + team.losses;
    const draws = previous.draws + team.draws;
    const totalBattles = previous.totalBattles + team.totalBattles;
    const total = wins + losses + draws;

    merged.set(team.team.signature, {
      team: team.team.monsters.length ? team.team : previous.team,
      totalBattles,
      wins,
      losses,
      draws,
      winRate: total > 0 ? ((wins + draws * 0.5) / total) * 100 : 0,
      contexts: [...new Set([...previous.contexts, ...team.contexts])].sort(),
    });
  }

  return [...merged.values()].sort(
    (left, right) => right.totalBattles - left.totalBattles || right.winRate - left.winRate,
  );
};

const buildSiegeMatchIdentity = (match: SiegeMatchSummaryDto) =>
  `${match.siegeId ?? 'unknown'}:${match.matchId ?? 'unknown'}`;

const mergeSiegeMatches = (
  existing: SiegeMatchSummaryDto[],
  incoming: SiegeMatchSummaryDto[],
) => {
  const merged = new Map<string, SiegeMatchSummaryDto>();

  for (const match of existing) {
    merged.set(buildSiegeMatchIdentity(match), match);
  }

  for (const match of incoming) {
    merged.set(buildSiegeMatchIdentity(match), match);
  }

  return [...merged.values()].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
};

export function mergeCurrentGuildMemberState(
  existing: GuildCurrentMemberStateDto | undefined,
  incoming: GuildCurrentMemberStateDto,
): GuildCurrentMemberStateDto {
  if (!existing) {
    return incoming;
  }

  const nextCoverage: MemberCoverageDto = {
    attendance: incoming.coverage.attendance || existing.coverage.attendance,
    subjugation: incoming.coverage.subjugation || existing.coverage.subjugation,
    labyrinth: incoming.coverage.labyrinth || existing.coverage.labyrinth,
    guildWarAttacks: incoming.coverage.guildWarAttacks || existing.coverage.guildWarAttacks,
    guildWarDefenses: incoming.coverage.guildWarDefenses || existing.coverage.guildWarDefenses,
    siegeAttacks: incoming.coverage.siegeAttacks || existing.coverage.siegeAttacks,
    siegeDefenses: incoming.coverage.siegeDefenses || existing.coverage.siegeDefenses,
  };

  return {
    guildId: pickDefined(incoming.guildId, existing.guildId),
    guildName: pickDefined(incoming.guildName, existing.guildName),
    importRunId: incoming.importRunId,
    snapshotId: incoming.snapshotId,
    updatedAt: incoming.updatedAt,
    wizardId: incoming.wizardId,
    member: {
      wizardId: incoming.member.wizardId,
      wizardName: incoming.member.wizardName,
      channelUid: pickDefined(incoming.member.channelUid, existing.member.channelUid),
      level: pickDefined(incoming.member.level, existing.member.level),
      ratingId: pickDefined(incoming.member.ratingId, existing.member.ratingId),
      guildId: pickDefined(incoming.member.guildId, existing.member.guildId),
      guildName: pickDefined(incoming.member.guildName, existing.member.guildName),
      guildRole: pickDefined(incoming.member.guildRole, existing.member.guildRole),
      guildGrade: pickDefined(incoming.member.guildGrade, existing.member.guildGrade),
      isCurrentUser: pickDefined(incoming.member.isCurrentUser, existing.member.isCurrentUser),
    },
    attendance: incoming.coverage.attendance ? incoming.attendance : existing.attendance,
    subjugation: incoming.coverage.subjugation ? incoming.subjugation : existing.subjugation,
    labyrinth: incoming.coverage.labyrinth ? incoming.labyrinth : existing.labyrinth,
    guildWar: {
      currentAttackCount: incoming.coverage.guildWarAttacks
        ? pickDefined(incoming.guildWar.currentAttackCount, existing.guildWar.currentAttackCount)
        : existing.guildWar.currentAttackCount,
      currentEnergy: incoming.coverage.guildWarAttacks
        ? pickDefined(incoming.guildWar.currentEnergy, existing.guildWar.currentEnergy)
        : existing.guildWar.currentEnergy,
      attacks: incoming.coverage.guildWarAttacks
        ? mergeAttackRecords(existing.guildWar.attacks, incoming.guildWar.attacks)
        : existing.guildWar.attacks,
      teams: incoming.coverage.guildWarAttacks
        ? mergeTeamUsageSummaries(existing.guildWar.teams, incoming.guildWar.teams)
        : existing.guildWar.teams,
      defenses: incoming.coverage.guildWarDefenses
        ? mergeDefenseSummaries(existing.guildWar.defenses, incoming.guildWar.defenses)
        : existing.guildWar.defenses,
    },
    siege: {
      attacks: incoming.coverage.siegeAttacks
        ? mergeAttackRecords(existing.siege.attacks, incoming.siege.attacks)
        : existing.siege.attacks,
      teams: incoming.coverage.siegeAttacks
        ? mergeTeamUsageSummaries(existing.siege.teams, incoming.siege.teams)
        : existing.siege.teams,
      defenses: incoming.coverage.siegeDefenses
        ? mergeDefenseSummaries(existing.siege.defenses, incoming.siege.defenses)
        : existing.siege.defenses,
    },
    coverage: nextCoverage,
    provenance: {
      attendance: incoming.coverage.attendance ? incoming.provenance.attendance : existing.provenance.attendance,
      subjugation: incoming.coverage.subjugation ? incoming.provenance.subjugation : existing.provenance.subjugation,
      labyrinth: incoming.coverage.labyrinth ? incoming.provenance.labyrinth : existing.provenance.labyrinth,
      guildWarAttacks: incoming.coverage.guildWarAttacks ? incoming.provenance.guildWarAttacks : existing.provenance.guildWarAttacks,
      guildWarDefenses: incoming.coverage.guildWarDefenses ? incoming.provenance.guildWarDefenses : existing.provenance.guildWarDefenses,
      siegeAttacks: incoming.coverage.siegeAttacks ? incoming.provenance.siegeAttacks : existing.provenance.siegeAttacks,
      siegeDefenses: incoming.coverage.siegeDefenses ? incoming.provenance.siegeDefenses : existing.provenance.siegeDefenses,
    },
  };
}

export function mergeCurrentGuildState(
  existing: GuildCurrentStateDto | undefined,
  incoming: GuildCurrentStateDto,
): GuildCurrentStateDto {
  if (!existing) {
    return incoming;
  }

  const memberMap = new Map<number, GuildCurrentMemberStateDto>();

  for (const member of existing.members) {
    memberMap.set(member.wizardId, member);
  }

  for (const member of incoming.members) {
    memberMap.set(
      member.wizardId,
      mergeCurrentGuildMemberState(memberMap.get(member.wizardId), member),
    );
  }

  const effectiveActiveRosterWizardIds =
    incoming.activeRosterWizardIds.length > 0
      ? [...incoming.activeRosterWizardIds]
      : existing.activeRosterWizardIds.length > 0
        ? [...existing.activeRosterWizardIds]
        : [];
  const activeRosterSet = new Set(effectiveActiveRosterWizardIds);

  return {
    guildId: pickDefined(incoming.guildId, existing.guildId),
    guildName: pickDefined(incoming.guildName, existing.guildName),
    importRunId: incoming.importRunId,
    snapshotId: incoming.snapshotId,
    updatedAt: incoming.updatedAt,
    activeRosterWizardIds: effectiveActiveRosterWizardIds,
    siegeMatches: mergeSiegeMatches(existing.siegeMatches ?? [], incoming.siegeMatches ?? []),
    members: Array.from(memberMap.values())
      .filter((member) => (activeRosterSet.size === 0 ? true : activeRosterSet.has(member.wizardId)))
      .sort((left, right) => left.wizardId - right.wizardId),
  };
}
