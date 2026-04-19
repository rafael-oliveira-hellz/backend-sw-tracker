import {
  Double,
  MongoClient,
  type Collection,
  type Db,
  type Document,
} from "mongodb";

import type {
  GuildLeadershipReadRepository,
  GuildLeadershipRepository,
  SaveGuildLeadershipCurrentStateCommand,
} from "../application/contracts";
import type {
  GuildAttackEventEntity,
  GuildCurrentStateDto,
  GuildDefenseDeckEntity,
  GuildImportHistoryDetailDto,
  GuildImportHistoryItemDto,
  GuildImportRunEntity,
  GuildImportSourceDto,
  GuildImportSourceEntity,
  GuildLeadershipSnapshotDto,
  GuildMemberSnapshotEntity,
  GuildSnapshotEntity,
  GuildTeamUsageEntity,
  LabyrinthCycleDto,
  LabyrinthCycleEntity,
  GuildWeeklyPunishmentDto,
  GuildWeeklyPunishmentEntity,
} from "../domain/models";
import { mergeCurrentGuildState } from "../domain/models";

export type MongoGuildLeadershipRepositoryOptions = {
  client?: MongoClient;
  mongoUri: string;
  databaseName: string;
  collectionPrefix?: string;
};

type MongoConnectionInfo = {
  mongoUri: string;
  databaseName: string;
  collectionPrefix: string;
};

type MongoGuildCollections = {
  importRuns: string;
  importSources: string;
  snapshots: string;
  memberSnapshots: string;
  attackEvents: string;
  defenseDecks: string;
  teamUsage: string;
  currentStates: string;
  labyrinthCycles: string;
  weeklyPunishments: string;
  healthchecks: string;
};

const DEFAULT_COLLECTION_PREFIX = "";

const sortByDateDesc = <T>(items: T[], getValue: (item: T) => string) =>
  [...items].sort(
    (left, right) =>
      new Date(getValue(right)).getTime() - new Date(getValue(left)).getTime(),
  );

const toHistoryItem = (
  importRun: GuildImportRunEntity,
  snapshot: GuildSnapshotEntity | undefined,
  sourcesCount: number,
  membersCount: number,
  attacksCount: number,
  defensesCount: number,
  teamUsageCount: number,
): GuildImportHistoryItemDto => ({
  importRunId: importRun.id,
  snapshotId: snapshot?.id ?? "",
  importedAt: importRun.importedAt,
  generatedAt: snapshot?.generatedAt ?? importRun.importedAt,
  sourceFolder: importRun.sourceFolder,
  guildId: snapshot?.guildId,
  guildName: snapshot?.guildName,
  currentUserWizardId: snapshot?.currentUserWizardId,
  totalFilesRead: importRun.totalFilesRead,
  sourcesSaved: sourcesCount,
  membersSaved: membersCount,
  attacksSaved: attacksCount,
  defensesSaved: defensesCount,
  teamUsageSaved: teamUsageCount,
});

const toSnapshotDto = (snapshot: GuildSnapshotEntity): GuildLeadershipSnapshotDto => ({
  generatedAt: snapshot.generatedAt,
  sourceFolder: snapshot.sourceFolder,
  filesRead: JSON.parse(snapshot.filesReadJson) as string[],
  guildId: snapshot.guildId,
  guildName: snapshot.guildName,
  currentUserWizardId: snapshot.currentUserWizardId,
  siegeMatches: snapshot.siegeMatchesJson
    ? (JSON.parse(snapshot.siegeMatchesJson) as GuildLeadershipSnapshotDto["siegeMatches"])
    : [],
  mergePolicy: JSON.parse(snapshot.mergePolicyJson) as GuildLeadershipSnapshotDto["mergePolicy"],
});

const toImportSourceDto = (source: GuildImportSourceEntity): GuildImportSourceDto => ({
  fileName: source.fileName,
  command: source.command,
  usedInAggregation: source.usedInAggregation,
  priorityOrder: source.priorityOrder,
});

const toWeeklyPunishmentDto = (
  punishment: GuildWeeklyPunishmentEntity,
): GuildWeeklyPunishmentDto => ({
  weekKey: punishment.weekKey,
  weekStart: punishment.weekStart,
  weekEnd: punishment.weekEnd,
  evaluatedAt: punishment.evaluatedAt,
  guildId: punishment.guildId,
  guildName: punishment.guildName,
  importRunId: punishment.importRunId,
  snapshotId: punishment.snapshotId,
  wizardId: punishment.wizardId,
  memberName: punishment.memberName,
  role: punishment.role,
  cooldownActive: punishment.cooldownActive,
  punishmentApplied: punishment.punishmentApplied,
  markedForRemoval: punishment.markedForRemoval ?? false,
  punishedEventKeys: JSON.parse(punishment.punishedEventKeysJson) as GuildWeeklyPunishmentDto["punishedEventKeys"],
  reasonSummary: punishment.reasonSummary,
  removalReasonSummary: punishment.removalReasonSummary,
  nextEligiblePenaltyAt: punishment.nextEligiblePenaltyAt,
  events: JSON.parse(punishment.eventsJson) as GuildWeeklyPunishmentDto["events"],
});

const toLabyrinthCycleDto = (cycle: LabyrinthCycleEntity): LabyrinthCycleDto => ({
  guildId: cycle.guildId,
  guildName: cycle.guildName,
  cycleStartDate: cycle.cycleStartDate,
  expectedDurationDays: cycle.expectedDurationDays,
  requiredAttacksByDay: JSON.parse(cycle.requiredAttacksByDayJson) as number[],
  actualDurationDays: cycle.actualDurationDays,
  isConcluded: cycle.isConcluded,
  concludedAt: cycle.concludedAt,
  concludedBy: cycle.concludedBy,
  updatedAt: cycle.updatedAt,
  updatedBy: cycle.updatedBy,
  entries: JSON.parse(cycle.entriesJson) as LabyrinthCycleDto["entries"],
});

const sanitizeMongoDocument = <T extends Document>(document: T | null): T | null => {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  return rest as T;
};

const sanitizeMongoDocuments = <T extends Document>(documents: T[]): T[] =>
  documents
    .map((document) => sanitizeMongoDocument(document))
    .filter(Boolean) as T[];

const getGuildKey = (guildId?: number | string) => String(guildId ?? "unknown");

export class MongoGuildLeadershipRepository
  implements GuildLeadershipRepository, GuildLeadershipReadRepository {
  private readonly client: MongoClient;

  private readonly ownsClient: boolean;

  private db: Db | null = null;

  private indexesEnsured: Promise<void> | null = null;

  private readonly connectionInfo: MongoConnectionInfo;

  private readonly collections: MongoGuildCollections;

  constructor(private readonly options: MongoGuildLeadershipRepositoryOptions) {
    this.client = options.client ?? new MongoClient(options.mongoUri);
    this.ownsClient = !options.client;
    this.connectionInfo = {
      mongoUri: options.mongoUri,
      databaseName: options.databaseName,
      collectionPrefix: options.collectionPrefix ?? DEFAULT_COLLECTION_PREFIX,
    };
    this.collections = {
      importRuns: this.collectionName("import_runs"),
      importSources: this.collectionName("import_sources"),
      snapshots: this.collectionName("snapshots"),
      memberSnapshots: this.collectionName("member_snapshots"),
      attackEvents: this.collectionName("attack_events"),
      defenseDecks: this.collectionName("defense_decks"),
      teamUsage: this.collectionName("team_usage"),
      currentStates: this.collectionName("current_states"),
      labyrinthCycles: this.collectionName("labyrinth_cycles"),
      weeklyPunishments: this.collectionName("weekly_punishments"),
      healthchecks: this.collectionName("healthchecks"),
    };
  }

  getConnectionInfo(): MongoConnectionInfo {
    return this.connectionInfo;
  }

  async verifyConnection(): Promise<void> {
    const db = await this.getDb();
    await db.command({ ping: 1 });
    await this.ensureIndexes();

    const checkId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await db.collection(this.collections.healthchecks).insertOne({
      id: checkId,
      checkedAt: new Date().toISOString(),
      kind: "startup",
    });
    await db.collection(this.collections.healthchecks).deleteOne({ id: checkId });
  }

  async saveImportRun(importRun: GuildImportRunEntity): Promise<GuildImportRunEntity> {
    await this.ensureIndexes();
    await (await this.getCollection<GuildImportRunEntity>(this.collections.importRuns)).insertOne(importRun);
    return importRun;
  }

  async saveImportSources(sources: GuildImportSourceEntity[]): Promise<GuildImportSourceEntity[]> {
    if (sources.length === 0) {
      return sources;
    }

    await this.ensureIndexes();
    await (await this.getCollection<GuildImportSourceEntity>(this.collections.importSources)).insertMany(sources, { ordered: true });
    return sources;
  }

  async saveSnapshot(snapshot: GuildSnapshotEntity): Promise<GuildSnapshotEntity> {
    await this.ensureIndexes();
    await (await this.getCollection<GuildSnapshotEntity>(this.collections.snapshots)).insertOne(snapshot);
    return snapshot;
  }

  async saveMembers(members: GuildMemberSnapshotEntity[]): Promise<GuildMemberSnapshotEntity[]> {
    if (members.length === 0) {
      return members;
    }

    await this.ensureIndexes();
    await (await this.getCollection<GuildMemberSnapshotEntity>(this.collections.memberSnapshots)).insertMany(members, { ordered: true });
    return members;
  }

  async saveAttacks(attacks: GuildAttackEventEntity[]): Promise<GuildAttackEventEntity[]> {
    if (attacks.length === 0) {
      return attacks;
    }

    await this.ensureIndexes();
    await (await this.getCollection<GuildAttackEventEntity>(this.collections.attackEvents)).insertMany(attacks, { ordered: true });
    return attacks;
  }

  async saveDefenses(defenses: GuildDefenseDeckEntity[]): Promise<GuildDefenseDeckEntity[]> {
    if (defenses.length === 0) {
      return defenses;
    }

    await this.ensureIndexes();
    await (await this.getCollection<Document>(this.collections.defenseDecks)).insertMany(
      defenses.map((defense) => ({
          ...defense,
          ...(defense.winRate !== undefined ? { winRate: new Double(defense.winRate) } : {}),
        })),
      { ordered: true },
    );
    return defenses;
  }

  async saveTeamUsage(teamUsage: GuildTeamUsageEntity[]): Promise<GuildTeamUsageEntity[]> {
    if (teamUsage.length === 0) {
      return teamUsage;
    }

    await this.ensureIndexes();
    await (await this.getCollection<GuildTeamUsageEntity>(this.collections.teamUsage)).insertMany(teamUsage, { ordered: true });
    return teamUsage;
  }

  async saveCurrentState(command: SaveGuildLeadershipCurrentStateCommand): Promise<void> {
    await this.ensureIndexes();

    const collection = await this.getCollection<GuildCurrentStateDto & { guildKey: string }>(this.collections.currentStates);
    const guildKey = getGuildKey(command.currentState.guildId);
    const existing = await collection.findOne({ guildKey });
    const merged = mergeCurrentGuildState(
      existing ? (sanitizeMongoDocument(existing) as GuildCurrentStateDto | null) ?? undefined : undefined,
      command.currentState,
    );

    await collection.updateOne(
      { guildKey },
      {
        $set: {
          ...merged,
          guildKey,
        },
      },
      { upsert: true },
    );
  }

  async saveWeeklyPunishments(
    punishments: GuildWeeklyPunishmentEntity[],
  ): Promise<GuildWeeklyPunishmentEntity[]> {
    if (punishments.length === 0) {
      return punishments;
    }

    await this.ensureIndexes();
    const collection = await this.getCollection<GuildWeeklyPunishmentEntity>(
      this.collections.weeklyPunishments,
    );

    await Promise.all(
      punishments.map((punishment) =>
        collection.updateOne(
          { weekKey: punishment.weekKey, wizardId: punishment.wizardId },
          {
            $set: punishment,
          },
          { upsert: true },
        ),
      ),
    );

    return punishments;
  }

  async saveLabyrinthCycle(cycle: LabyrinthCycleEntity): Promise<LabyrinthCycleEntity> {
    await this.ensureIndexes();
    const collection = await this.getCollection<LabyrinthCycleEntity>(this.collections.labyrinthCycles);

    await collection.updateOne(
      cycle.guildId !== undefined
        ? {
            guildId: cycle.guildId,
            cycleStartDate: cycle.cycleStartDate,
          }
        : {
            cycleStartDate: cycle.cycleStartDate,
          },
      {
        $set: cycle,
      },
      { upsert: true },
    );

    return cycle;
  }

  async listSnapshots(): Promise<GuildSnapshotEntity[]> {
    const snapshots = await (await this.getCollection<GuildSnapshotEntity>(this.collections.snapshots))
      .find({})
      .sort({ generatedAt: -1 })
      .toArray();

    return sanitizeMongoDocuments(snapshots as unknown as Document[]) as GuildSnapshotEntity[];
  }

  async findSnapshotById(snapshotId: string): Promise<GuildSnapshotEntity | null> {
    const snapshot = await (await this.getCollection<GuildSnapshotEntity>(this.collections.snapshots)).findOne({ id: snapshotId });
    return sanitizeMongoDocument(snapshot as Document | null) as GuildSnapshotEntity | null;
  }

  async listImportHistory(): Promise<GuildImportHistoryItemDto[]> {
    const importRuns = sanitizeMongoDocuments(
      await (await this.getCollection<GuildImportRunEntity>(this.collections.importRuns))
        .find({})
        .sort({ importedAt: -1 })
        .toArray() as unknown as Document[],
    ) as GuildImportRunEntity[];

    const snapshots = sanitizeMongoDocuments(
      await (await this.getCollection<GuildSnapshotEntity>(this.collections.snapshots))
        .find({})
        .toArray() as unknown as Document[],
    ) as GuildSnapshotEntity[];
    const snapshotByImportRunId = new Map(snapshots.map((snapshot) => [snapshot.importRunId, snapshot]));

    const history = await Promise.all(
      importRuns.map(async (importRun) => {
        const snapshot = snapshotByImportRunId.get(importRun.id);
        return toHistoryItem(
          importRun,
          snapshot,
          await (await this.getCollection<GuildImportSourceEntity>(this.collections.importSources)).countDocuments({ importRunId: importRun.id }),
          snapshot
            ? await (await this.getCollection<GuildMemberSnapshotEntity>(this.collections.memberSnapshots)).countDocuments({ snapshotId: snapshot.id })
            : 0,
          snapshot
            ? await (await this.getCollection<GuildAttackEventEntity>(this.collections.attackEvents)).countDocuments({ snapshotId: snapshot.id })
            : 0,
          snapshot
            ? await (await this.getCollection<GuildDefenseDeckEntity>(this.collections.defenseDecks)).countDocuments({ snapshotId: snapshot.id })
            : 0,
          snapshot
            ? await (await this.getCollection<GuildTeamUsageEntity>(this.collections.teamUsage)).countDocuments({ snapshotId: snapshot.id })
            : 0,
        );
      }),
    );

    return sortByDateDesc(history, (item) => item.importedAt);
  }

  async findImportHistoryById(importRunId: string): Promise<GuildImportHistoryDetailDto | null> {
    const importRun = await (await this.getCollection<GuildImportRunEntity>(this.collections.importRuns)).findOne({ id: importRunId });
    if (!importRun) {
      return null;
    }

    const cleanImportRun = sanitizeMongoDocument(importRun as Document as GuildImportRunEntity);
    if (!cleanImportRun) {
      return null;
    }

    const snapshot = await (await this.getCollection<GuildSnapshotEntity>(this.collections.snapshots)).findOne({ importRunId });
    if (!snapshot) {
      return null;
    }

    const cleanSnapshot = sanitizeMongoDocument(snapshot as Document as GuildSnapshotEntity);
    if (!cleanSnapshot) {
      return null;
    }

    const sources = sanitizeMongoDocuments(
      await (await this.getCollection<GuildImportSourceEntity>(this.collections.importSources))
        .find({ importRunId })
        .sort({ priorityOrder: 1 })
        .toArray() as unknown as Document[],
    ) as GuildImportSourceEntity[];

    return {
      history: toHistoryItem(
        cleanImportRun,
        cleanSnapshot,
        sources.length,
        await (await this.getCollection<GuildMemberSnapshotEntity>(this.collections.memberSnapshots)).countDocuments({ snapshotId: cleanSnapshot.id }),
        await (await this.getCollection<GuildAttackEventEntity>(this.collections.attackEvents)).countDocuments({ snapshotId: cleanSnapshot.id }),
        await (await this.getCollection<GuildDefenseDeckEntity>(this.collections.defenseDecks)).countDocuments({ snapshotId: cleanSnapshot.id }),
        await (await this.getCollection<GuildTeamUsageEntity>(this.collections.teamUsage)).countDocuments({ snapshotId: cleanSnapshot.id }),
      ),
      importSources: sources.map(toImportSourceDto),
      snapshot: toSnapshotDto(cleanSnapshot),
    };
  }

  async findCurrentStateByGuildId(guildId: number | string): Promise<GuildCurrentStateDto | null> {
    const document = await (await this.getCollection<GuildCurrentStateDto & { guildKey: string }>(this.collections.currentStates))
      .findOne({ guildKey: getGuildKey(guildId) });

    const sanitized = sanitizeMongoDocument(document as Document | null);
    if (!sanitized) {
      return null;
    }

    const { guildKey, ...rest } = sanitized as GuildCurrentStateDto & { guildKey: string };
    return rest;
  }

  async findLatestCurrentState(): Promise<GuildCurrentStateDto | null> {
    const document = await (await this.getCollection<GuildCurrentStateDto & { guildKey: string }>(this.collections.currentStates))
      .find({})
      .sort({ updatedAt: -1 })
      .limit(1)
      .next();

    const sanitized = sanitizeMongoDocument(document as Document | null);
    if (!sanitized) {
      return null;
    }

    const { guildKey, ...rest } = sanitized as GuildCurrentStateDto & { guildKey: string };
    return rest;
  }

  async findLabyrinthCycleByStartDate(params: {
    guildId?: number | string;
    cycleStartDate: string;
  }): Promise<LabyrinthCycleDto | null> {
    const document = await (
      await this.getCollection<LabyrinthCycleEntity>(this.collections.labyrinthCycles)
    ).findOne(
      params.guildId !== undefined
        ? {
            guildId: Number(params.guildId),
            cycleStartDate: params.cycleStartDate,
          }
        : {
            cycleStartDate: params.cycleStartDate,
          },
    );

    const sanitized = sanitizeMongoDocument(document as Document | null);
    if (!sanitized) {
      return null;
    }

    return toLabyrinthCycleDto(sanitized as LabyrinthCycleEntity);
  }

  async listWeeklyPunishments(params?: {
    weekKey?: string;
    evaluatedAtFrom?: string;
  }): Promise<GuildWeeklyPunishmentDto[]> {
    const query: Record<string, unknown> = {};

    if (params?.weekKey) {
      query.weekKey = params.weekKey;
    }

    if (params?.evaluatedAtFrom) {
      query.evaluatedAt = { $gte: params.evaluatedAtFrom };
    }

    const punishments = sanitizeMongoDocuments(
      (await (
        await this.getCollection<GuildWeeklyPunishmentEntity>(this.collections.weeklyPunishments)
      )
        .find(query)
        .sort({ evaluatedAt: -1, memberName: 1 })
        .toArray()) as unknown as Document[],
    ) as GuildWeeklyPunishmentEntity[];

    return punishments.map(toWeeklyPunishmentDto);
  }

  async close() {
    if (this.ownsClient) {
      await this.client.close();
    }
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.indexesEnsured) {
      this.indexesEnsured = this.createIndexes();
    }

    await this.indexesEnsured;
  }

  private async createIndexes(): Promise<void> {
    const db = await this.getDb();

    await Promise.all([
      db.collection(this.collections.importRuns).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_import_run_id" },
        { key: { importedAt: -1 }, name: "idx_imported_at_desc" },
      ]),
      db.collection(this.collections.importSources).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_import_source_id" },
        { key: { importRunId: 1, priorityOrder: 1 }, name: "idx_import_run_priority" },
        { key: { importRunId: 1, fileName: 1 }, name: "idx_import_run_file_name" },
      ]),
      db.collection(this.collections.snapshots).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_snapshot_id" },
        { key: { importRunId: 1 }, unique: true, name: "uid_snapshot_import_run_id" },
        { key: { guildId: 1, generatedAt: -1 }, name: "idx_snapshot_guild_generated" },
      ]),
      db.collection(this.collections.memberSnapshots).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_member_snapshot_id" },
        { key: { snapshotId: 1, wizardId: 1 }, name: "idx_member_snapshot_wizard" },
        { key: { guildId: 1, wizardId: 1 }, name: "idx_member_guild_wizard" },
      ]),
      db.collection(this.collections.attackEvents).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_attack_event_id" },
        { key: { snapshotId: 1, wizardId: 1, context: 1 }, name: "idx_attack_snapshot_wizard_context" },
        { key: { battleId: 1 }, name: "idx_attack_battle_id" },
        { key: { occurredAt: -1 }, name: "idx_attack_occurred_at_desc" },
      ]),
      db.collection(this.collections.defenseDecks).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_defense_deck_id" },
        { key: { snapshotId: 1, wizardId: 1, context: 1 }, name: "idx_defense_snapshot_wizard_context" },
        { key: { teamSignature: 1 }, name: "idx_defense_team_signature" },
      ]),
      db.collection(this.collections.teamUsage).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_team_usage_id" },
        { key: { snapshotId: 1, wizardId: 1, context: 1 }, name: "idx_team_usage_snapshot_wizard_context" },
        { key: { teamSignature: 1, context: 1 }, name: "idx_team_usage_signature_context" },
        { key: { totalBattles: -1 }, name: "idx_team_usage_total_battles_desc" },
      ]),
      db.collection(this.collections.currentStates).createIndexes([
        { key: { guildKey: 1 }, unique: true, name: "uid_current_state_guild_key" },
        { key: { guildId: 1 }, name: "idx_current_state_guild_id" },
        { key: { updatedAt: -1 }, name: "idx_current_state_updated_at_desc" },
      ]),
      db.collection(this.collections.labyrinthCycles).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_labyrinth_cycle_id" },
        {
          key: { guildId: 1, cycleStartDate: 1 },
          unique: true,
          name: "uid_labyrinth_cycle_guild_start",
        },
        { key: { cycleStartDate: -1, updatedAt: -1 }, name: "idx_labyrinth_cycle_start_updated_desc" },
      ]),
      db.collection(this.collections.weeklyPunishments).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_weekly_punishment_id" },
        { key: { weekKey: 1, wizardId: 1 }, unique: true, name: "uid_weekly_punishment_week_wizard" },
        { key: { weekKey: 1, punishmentApplied: 1 }, name: "idx_weekly_punishment_week_applied" },
        { key: { guildId: 1, evaluatedAt: -1 }, name: "idx_weekly_punishment_guild_evaluated_desc" },
        { key: { nextEligiblePenaltyAt: 1 }, name: "idx_weekly_punishment_next_eligible" },
      ]),
      db.collection(this.collections.healthchecks).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_healthcheck_id" },
        { key: { checkedAt: -1 }, name: "idx_healthcheck_checked_at_desc" },
      ]),
    ]);
  }

  private async getDb(): Promise<Db> {
    if (!this.db) {
      await this.client.connect();
      this.db = this.client.db(this.options.databaseName);
    }

    return this.db;
  }

  private async getCollection<T extends Document>(name: string): Promise<Collection<T>> {
    const db = await this.getDb();
    return db.collection<T>(name);
  }

  private collectionName(suffix: string) {
    return this.connectionInfo.collectionPrefix
      ? `${this.connectionInfo.collectionPrefix}_${suffix}`
      : suffix;
  }
}
