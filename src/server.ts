import "dotenv/config";

import { buildGuildLeadershipFastifyApp } from "./app/build-app";
import { getGuildLeadershipAppConfig } from "./app/config";
import { WeeklyPunishmentScheduler } from "./modules/guildLeadership/application/weekly-punishment-scheduler";
import { WeeklyPunishmentService } from "./modules/guildLeadership/application/weekly-punishment-service";

async function start() {
  const config = getGuildLeadershipAppConfig();
  const app = await buildGuildLeadershipFastifyApp(config);

  try {
    const repository = app.guildLeadershipServices.repository;
    const weeklyPunishmentService = new WeeklyPunishmentService(repository);
    const weeklyPunishmentScheduler = new WeeklyPunishmentScheduler(
      weeklyPunishmentService,
      app.log,
    );

    app.log.info(
      { mongodb: repository.getConnectionInfo() },
      "Validating MongoDB connectivity before startup",
    );

    await repository.verifyConnection();

    app.log.info(
      { mongodb: repository.getConnectionInfo() },
      "MongoDB connectivity validated",
    );

    app.addHook("onClose", async () => {
      weeklyPunishmentScheduler.stop();
    });

    await app.listen({
      port: config.port,
      host: config.host,
    });

    weeklyPunishmentScheduler.start();
    app.log.info("Weekly punishment scheduler started");
  } catch (error) {
    app.log.error({ err: error }, "Failed to start Guild Leadership Fastify server");
    try {
      await app.close();
    } catch {
      // best effort shutdown
    }
    process.exit(1);
  }
}

void start();
