import type {
  GuildAttackEventEntity,
  GuildCurrentStateDto,
  GuildDefenseDeckEntity,
  GuildImportHistoryDetailDto,
  GuildImportHistoryItemDto,
  GuildImportRunEntity,
  GuildImportSourceEntity,
  GuildLeadershipPersistenceDto,
  GuildLeadershipPersistenceEntities,
  GuildMemberSnapshotEntity,
  GuildSnapshotEntity,
  GuildTeamUsageEntity,
  GuildWeeklyPunishmentDto,
  GuildWeeklyPunishmentEntity,
  ImportGuildFilesRequestDto,
} from "../domain/models";

export interface SaveGuildLeadershipSnapshotCommand {
  dto: GuildLeadershipPersistenceDto;
  entities: GuildLeadershipPersistenceEntities;
}

export interface SaveGuildLeadershipCurrentStateCommand {
  dto: GuildLeadershipPersistenceDto;
  entities: GuildLeadershipPersistenceEntities;
  currentState: GuildCurrentStateDto;
}

export interface ImportGuildLeadershipFromFilesCommand extends ImportGuildFilesRequestDto {}

export interface GuildLeadershipImportResult {
  importRun: GuildImportRunEntity;
  snapshot: GuildSnapshotEntity;
  sourcesSaved: number;
  membersSaved: number;
  attacksSaved: number;
  defensesSaved: number;
  teamUsageSaved: number;
  authSync?: {
    upserted: number;
    removed: number;
    defaultPasswordApplied: boolean;
  };
}

export interface GuildLeadershipRepository {
  saveImportRun(importRun: GuildImportRunEntity): Promise<GuildImportRunEntity>;
  saveImportSources(sources: GuildImportSourceEntity[]): Promise<GuildImportSourceEntity[]>;
  saveSnapshot(snapshot: GuildSnapshotEntity): Promise<GuildSnapshotEntity>;
  saveMembers(members: GuildMemberSnapshotEntity[]): Promise<GuildMemberSnapshotEntity[]>;
  saveAttacks(attacks: GuildAttackEventEntity[]): Promise<GuildAttackEventEntity[]>;
  saveDefenses(defenses: GuildDefenseDeckEntity[]): Promise<GuildDefenseDeckEntity[]>;
  saveTeamUsage(teamUsage: GuildTeamUsageEntity[]): Promise<GuildTeamUsageEntity[]>;
  saveCurrentState(command: SaveGuildLeadershipCurrentStateCommand): Promise<void>;
  saveWeeklyPunishments(
    punishments: GuildWeeklyPunishmentEntity[],
  ): Promise<GuildWeeklyPunishmentEntity[]>;
}

export interface GuildLeadershipReadRepository {
  listSnapshots(): Promise<GuildSnapshotEntity[]>;
  findSnapshotById(snapshotId: string): Promise<GuildSnapshotEntity | null>;
  listImportHistory(): Promise<GuildImportHistoryItemDto[]>;
  findImportHistoryById(importRunId: string): Promise<GuildImportHistoryDetailDto | null>;
  findCurrentStateByGuildId(guildId: number | string): Promise<GuildCurrentStateDto | null>;
  findLatestCurrentState(): Promise<GuildCurrentStateDto | null>;
  listWeeklyPunishments(params?: {
    weekKey?: string;
    evaluatedAtFrom?: string;
  }): Promise<GuildWeeklyPunishmentDto[]>;
}
