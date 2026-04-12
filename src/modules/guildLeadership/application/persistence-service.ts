import { buildCurrentGuildState } from "../domain/models";
import type {
  GuildLeadershipImportResult,
  GuildLeadershipRepository,
  SaveGuildLeadershipSnapshotCommand,
} from "./contracts";

export class GuildLeadershipPersistenceService {
  constructor(private readonly repository: GuildLeadershipRepository) {}

  async save(command: SaveGuildLeadershipSnapshotCommand): Promise<GuildLeadershipImportResult> {
    const { dto, entities } = command;
    const currentState = buildCurrentGuildState(dto, entities);

    console.info(`[guild-import] saving importRun: ${entities.importRun.id}`);
    await this.repository.saveImportRun(entities.importRun);
    console.info(`[guild-import] saved importRun: ${entities.importRun.id}`);

    console.info(`[guild-import] saving importSources: ${entities.importSources.length}`);
    await this.repository.saveImportSources(entities.importSources);
    console.info(`[guild-import] saved importSources: ${entities.importSources.length}`);

    console.info(`[guild-import] saving snapshot: ${entities.snapshot.id}`);
    await this.repository.saveSnapshot(entities.snapshot);
    console.info(`[guild-import] saved snapshot: ${entities.snapshot.id}`);

    console.info(`[guild-import] saving members: ${entities.members.length}`);
    await this.repository.saveMembers(entities.members);
    console.info(`[guild-import] saved members: ${entities.members.length}`);

    console.info(`[guild-import] saving attacks: ${entities.attacks.length}`);
    await this.repository.saveAttacks(entities.attacks);
    console.info(`[guild-import] saved attacks: ${entities.attacks.length}`);

    console.info(`[guild-import] saving defenses: ${entities.defenses.length}`);
    await this.repository.saveDefenses(entities.defenses);
    console.info(`[guild-import] saved defenses: ${entities.defenses.length}`);

    console.info(`[guild-import] saving teamUsage: ${entities.teamUsage.length}`);
    await this.repository.saveTeamUsage(entities.teamUsage);
    console.info(`[guild-import] saved teamUsage: ${entities.teamUsage.length}`);

    console.info(`[guild-import] saving currentState for guild: ${currentState.guildId ?? "unknown"}`);
    await this.repository.saveCurrentState({
      dto,
      entities,
      currentState,
    });
    console.info(`[guild-import] saved currentState for guild: ${currentState.guildId ?? "unknown"}`);

    return {
      importRun: entities.importRun,
      snapshot: entities.snapshot,
      sourcesSaved: entities.importSources.length,
      membersSaved: entities.members.length,
      attacksSaved: entities.attacks.length,
      defensesSaved: entities.defenses.length,
      teamUsageSaved: entities.teamUsage.length,
    };
  }
}
