import type { AuthService, ImportedGuildAuthUser } from "../../auth/application/contracts";
import type { GuildLeadershipPersistenceDto } from "../domain/models";
import { buildGuildLeadershipPersistencePackageFromFiles } from "../infrastructure/loader";
import type {
  GuildLeadershipImportResult,
  GuildLeadershipRepository,
  ImportGuildLeadershipFromFilesCommand,
} from "./contracts";
import { GuildLeadershipPersistenceService } from "./persistence-service";

export type GuildLeadershipImportWithPayloadResult = {
  result: GuildLeadershipImportResult;
  payload: GuildLeadershipPersistenceDto;
};

const isGuildRosterCommand = (command: string) =>
  command === "SWGT-HubUserLogin" || command === "HubUserLogin" || command === "GetGuildInfo";

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export class GuildLeadershipImportService {
  private readonly persistenceService: GuildLeadershipPersistenceService;

  constructor(
    private readonly repository: GuildLeadershipRepository,
    private readonly authService?: AuthService,
    private readonly defaultImportedUserPassword = "guild1234",
  ) {
    this.persistenceService = new GuildLeadershipPersistenceService(repository);
  }

  async importFromFilesDetailed(
    command: ImportGuildLeadershipFromFilesCommand,
  ): Promise<GuildLeadershipImportWithPayloadResult> {
    const sourceLabel = command.sourceLabel ?? "upload://frontend";

    console.info(
      `[guild-import] import requested from ${sourceLabel} with ${command.files.length} uploaded file(s)`,
    );

    for (const [index, file] of command.files.entries()) {
      console.info(
        `[guild-import] received file ${index + 1}/${command.files.length}: ${file.fileName}`,
      );
    }

    const persistencePackage = buildGuildLeadershipPersistencePackageFromFiles(
      command.files,
      sourceLabel,
    );

    console.info(
      `[guild-import] aggregation ready for ${sourceLabel}: sources=${persistencePackage.dto.importSources.length}, members=${persistencePackage.dto.members.length}, attacks=${persistencePackage.dto.attacks.length}, defenses=${persistencePackage.dto.defenses.length}, teamUsage=${persistencePackage.dto.teamUsage.length}`,
    );

    const result = await this.persistenceService.save({
      dto: persistencePackage.dto,
      entities: persistencePackage.entities,
    });

    const importedUsers = this.buildImportedGuildUsers(persistencePackage.dto);
    const rosterSources = persistencePackage.dto.importSources.filter((source) =>
      isGuildRosterCommand(source.command),
    );
    const hasGuildRosterSource = rosterSources.length > 0;

    console.info(
      `[guild-import] roster source detection: found=${hasGuildRosterSource} commands=${rosterSources.map((source) => source.command).join(", ") || "none"} importedUsers=${importedUsers.length}`,
    );

    if (this.authService && hasGuildRosterSource && importedUsers.length > 0) {
      const roleSummary = importedUsers.reduce<Record<string, number>>((summary, user) => {
        summary[user.role] = (summary[user.role] ?? 0) + 1;
        return summary;
      }, {});
      console.info(
        `[guild-import] syncing auth users from guild snapshot: users=${importedUsers.length} roles=${JSON.stringify(roleSummary)} sourceFiles=${rosterSources.map((source) => source.fileName).join(", ")}`,
      );
      const authSync = await this.authService.syncImportedGuildUsers(
        importedUsers,
        this.defaultImportedUserPassword,
      );
      result.authSync = {
        ...authSync,
        defaultPasswordApplied: authSync.upserted > 0,
      };
      console.info(
        `[guild-import] synced auth users: upserted=${authSync.upserted}, removed=${authSync.removed}`,
      );
    } else if (this.authService && hasGuildRosterSource && importedUsers.length === 0) {
      console.info(
        "[guild-import] skipping auth sync because the roster source was found but no importable users were extracted",
      );
    } else if (this.authService && !hasGuildRosterSource) {
      console.info(
        "[guild-import] skipping auth sync because this batch does not contain the full guild roster source",
      );
    }

    console.info(
      `[guild-import] import persisted: importRunId=${result.importRun.id}, snapshotId=${result.snapshot.id}, guild=${result.snapshot.guildName ?? "unknown"}, files=${result.importRun.totalFilesRead}`,
    );

    return {
      result,
      payload: persistencePackage.dto,
    };
  }

  async importFromFiles(
    command: ImportGuildLeadershipFromFilesCommand,
  ): Promise<GuildLeadershipImportResult> {
    const detailed = await this.importFromFilesDetailed(command);
    return detailed.result;
  }

  private buildImportedGuildUsers(dto: GuildLeadershipPersistenceDto): ImportedGuildAuthUser[] {
    const guildId = toOptionalNumber(dto.snapshot.guildId);
    const guildName = dto.snapshot.guildName ?? "";
    const activeRosterSet = new Set(dto.activeRosterWizardIds);

    return dto.members
      .filter((member) =>
        activeRosterSet.size === 0 ? true : activeRosterSet.has(member.wizardId),
      )
      .filter((member) => member.member.wizardName.trim() !== "")
      .map((member) => ({
        username: member.member.wizardName,
        summonerNumber: String(member.wizardId),
        guildName: member.member.guildName ?? guildName,
        guildId: toOptionalNumber(member.member.guildId) ?? guildId,
        wizardId: member.wizardId,
        role: member.member.guildRole ?? "member",
      }));
  }
}
