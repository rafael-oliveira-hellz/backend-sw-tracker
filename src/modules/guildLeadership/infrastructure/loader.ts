import fs from "node:fs";
import path from "node:path";

import {
  buildGuildLeadershipPayload,
  flattenMembersForBackend,
  type GuildSnapshotEntry,
} from "../domain/core";
import {
  mapDtoToEntities,
  type GuildImportSourceDto,
  type GuildLeadershipPersistenceDto,
  type GuildLeadershipPersistenceEntities,
  type UploadedGuildFileDto,
} from "../domain/models";

export type GuildLeadershipPersistencePayload = GuildLeadershipPersistenceDto;

export type GuildLeadershipPersistencePackage = {
  dto: GuildLeadershipPersistenceDto;
  entities: GuildLeadershipPersistenceEntities;
};

const isJsonFile = (fileName: string) => fileName.toLowerCase().endsWith(".json");

const tryParseJson = (filePath: string) => {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GuildSnapshotEntry["data"];
};

const parseJsonContent = (content: string) => JSON.parse(content) as GuildSnapshotEntry["data"];

const decodeCommand = (entry: GuildSnapshotEntry): string => {
  if (Array.isArray(entry.data)) {
    const first = entry.data[0] as Record<string, unknown> | undefined;
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

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractGuildIdentityFromSnapshots = (snapshots: GuildSnapshotEntry[]) => {
  for (const snapshot of snapshots) {
    if (Array.isArray(snapshot.data)) {
      continue;
    }

    const command = decodeCommand(snapshot);
    if (
      command !== "HubUserLogin" &&
      command !== "SWGT-HubUserLogin" &&
      command !== "GetGuildInfo"
    ) {
      continue;
    }

    const guildInfo = snapshot.data.guild_info ?? snapshot.data.guild ?? {};
    const guildId = toOptionalNumber(guildInfo?.guild_id);
    const guildName =
      typeof guildInfo?.name === "string" && guildInfo.name.trim() !== ""
        ? guildInfo.name.trim()
        : undefined;

    if (guildId !== undefined || guildName) {
      return {
        guildId,
        guildName,
      };
    }
  }

  return {
    guildId: undefined,
    guildName: undefined,
  };
};

const buildPersistencePayloadFromSnapshots = (
  snapshots: GuildSnapshotEntry[],
  sourceLabel: string,
): GuildLeadershipPersistencePayload => {
  const leadershipPayload = buildGuildLeadershipPayload(snapshots);
  const members = flattenMembersForBackend(leadershipPayload);

  const attacks: GuildLeadershipPersistencePayload["attacks"] = [];
  const defenses: GuildLeadershipPersistencePayload["defenses"] = [];
  const teamUsage: GuildLeadershipPersistencePayload["teamUsage"] = [];
  const snapshotGuildIdentity = extractGuildIdentityFromSnapshots(snapshots);

  let guildId: number | undefined = snapshotGuildIdentity.guildId;
  let guildName: string | undefined = snapshotGuildIdentity.guildName;
  let currentUserWizardId: number | undefined;

  const importSources: GuildImportSourceDto[] = snapshots.map((snapshot, index) => ({
    fileName: snapshot.fileName,
    command: decodeCommand(snapshot),
    usedInAggregation: true,
    priorityOrder: index + 1,
  }));

  for (const member of members) {
    guildId ??= member.member.guildId;
    guildName ??= member.member.guildName;
    if (member.member.isCurrentUser) {
      currentUserWizardId = member.member.wizardId;
    }

    for (const attack of member.guildWar.attacks) {
      attacks.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "guildWar",
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
        teamSignature: attack.team.signature,
        teamLabel: attack.team.label,
        monsters: attack.team.monsters,
        monsterNames: attack.team.monsterNames,
      });
    }

    for (const attack of member.siege.attacks) {
      attacks.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "siege",
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
        teamSignature: attack.team.signature,
        teamLabel: attack.team.label,
        monsters: attack.team.monsters,
        monsterNames: attack.team.monsterNames,
      });
    }

    for (const defense of member.guildWar.defenses) {
      defenses.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "guildWar",
        deckId: defense.deckId,
        assignedBase: defense.assignedBase,
        round: defense.round,
        ratingId: defense.ratingId,
        unitIds: defense.unitIds,
        source: defense.source,
        teamSignature: defense.team.signature,
        teamLabel: defense.team.label,
        monsters: defense.team.monsters,
        monsterNames: defense.team.monsterNames,
        wins: defense.wins,
        losses: defense.losses,
        draws: defense.draws,
        totalBattles: defense.totalBattles,
        winRate: defense.winRate,
        equipmentAudit: defense.equipmentAudit,
        complianceAudit: defense.complianceAudit,
      });
    }

    for (const defense of member.siege.defenses) {
      defenses.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "siege",
        deckId: defense.deckId,
        assignedBase: defense.assignedBase,
        round: defense.round,
        ratingId: defense.ratingId,
        unitIds: defense.unitIds,
        source: defense.source,
        teamSignature: defense.team.signature,
        teamLabel: defense.team.label,
        monsters: defense.team.monsters,
        monsterNames: defense.team.monsterNames,
        wins: defense.wins,
        losses: defense.losses,
        draws: defense.draws,
        totalBattles: defense.totalBattles,
        winRate: defense.winRate,
        equipmentAudit: defense.equipmentAudit,
        complianceAudit: defense.complianceAudit,
      });
    }

    for (const usage of member.guildWar.teams) {
      teamUsage.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "guildWar",
        teamSignature: usage.team.signature,
        teamLabel: usage.team.label,
        monsters: usage.team.monsters,
        monsterNames: usage.team.monsterNames,
        totalBattles: usage.totalBattles,
        wins: usage.wins,
        losses: usage.losses,
        draws: usage.draws,
        winRate: usage.winRate,
        contexts: usage.contexts,
      });
    }

    for (const usage of member.siege.teams) {
      teamUsage.push({
        wizardId: member.wizardId,
        memberName: member.member.wizardName,
        context: "siege",
        teamSignature: usage.team.signature,
        teamLabel: usage.team.label,
        monsters: usage.team.monsters,
        monsterNames: usage.team.monsterNames,
        totalBattles: usage.totalBattles,
        wins: usage.wins,
        losses: usage.losses,
        draws: usage.draws,
        winRate: usage.winRate,
        contexts: usage.contexts,
      });
    }
  }

  return {
    importRun: {
      importedAt: new Date().toISOString(),
      sourceFolder: sourceLabel,
      totalFilesRead: snapshots.length,
    },
    importSources,
    snapshot: {
      generatedAt: leadershipPayload.generatedAt,
      sourceFolder: sourceLabel,
      filesRead: snapshots.map((snapshot) => snapshot.fileName),
      guildId,
      guildName,
      currentUserWizardId,
      siegeMatches: leadershipPayload.siegeMatches,
      mergePolicy: leadershipPayload.mergePolicy,
    },
    activeRosterWizardIds: leadershipPayload.activeRosterWizardIds,
    members,
    attacks: attacks.sort((left, right) => (right.occurredAt ?? 0) - (left.occurredAt ?? 0)),
    defenses,
    teamUsage: teamUsage.sort((left, right) => right.totalBattles - left.totalBattles),
  };
};

export function normalizeUploadedGuildFiles(files: UploadedGuildFileDto[]): UploadedGuildFileDto[] {
  const deduped = new Map<string, UploadedGuildFileDto>();

  for (const file of files) {
    if (!isJsonFile(file.fileName)) {
      continue;
    }

    deduped.set(file.fileName, file);
  }

  return [...deduped.values()].sort((left, right) => left.fileName.localeCompare(right.fileName));
}

export function readGuildSnapshotsFromUploadedFiles(
  files: UploadedGuildFileDto[],
): GuildSnapshotEntry[] {
  const normalizedFiles = normalizeUploadedGuildFiles(files);

  console.info(
    `[guild-import] starting snapshot parsing for ${normalizedFiles.length} JSON file(s)`,
  );

  return normalizedFiles.map((file, index) => {
    console.info(
      `[guild-import] parsing file ${index + 1}/${normalizedFiles.length}: ${file.fileName}`,
    );

    try {
      const snapshot: GuildSnapshotEntry = {
        fileName: file.fileName,
        data: parseJsonContent(file.content),
      };

      console.info(
        `[guild-import] parsed file ${index + 1}/${normalizedFiles.length}: ${file.fileName} (command=${decodeCommand(snapshot)})`,
      );

      return snapshot;
    } catch (error) {
      console.error(
        `[guild-import] failed to parse file ${index + 1}/${normalizedFiles.length}: ${file.fileName}`,
        error,
      );
      throw error;
    }
  });
}

export function buildGuildLeadershipPersistencePayloadFromFiles(
  files: UploadedGuildFileDto[],
  sourceLabel = "upload://frontend",
): GuildLeadershipPersistencePayload {
  const snapshots = readGuildSnapshotsFromUploadedFiles(files);
  return buildPersistencePayloadFromSnapshots(snapshots, sourceLabel);
}

export function buildGuildLeadershipPersistencePackageFromFiles(
  files: UploadedGuildFileDto[],
  sourceLabel = "upload://frontend",
): GuildLeadershipPersistencePackage {
  const dto = buildGuildLeadershipPersistencePayloadFromFiles(files, sourceLabel);

  return {
    dto,
    entities: mapDtoToEntities(dto),
  };
}

export function writeGuildLeadershipPayloadToFile(
  files: UploadedGuildFileDto[],
  outputFilePath: string,
  sourceLabel = "upload://frontend",
) {
  const payload = buildGuildLeadershipPersistencePayloadFromFiles(files, sourceLabel);
  const resolvedOutput = path.resolve(outputFilePath);

  fs.writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2), "utf-8");

  return {
    outputFilePath: resolvedOutput,
    payload,
  };
}
