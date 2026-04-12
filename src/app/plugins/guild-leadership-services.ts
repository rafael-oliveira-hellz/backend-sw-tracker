import fp from "fastify-plugin";

import type { AppServices } from "../config";

declare module "fastify" {
  interface FastifyInstance {
    guildLeadershipServices: Pick<AppServices, "repository" | "importService">;
    authServices: Pick<AppServices, "authRepository" | "authService" | "defaultImportedUserPassword">;
  }
}

export const guildLeadershipServicesPlugin = fp<{ services: AppServices }>(
  async (app, options) => {
    app.decorate("guildLeadershipServices", {
      repository: options.services.repository,
      importService: options.services.importService,
    });

    app.decorate("authServices", {
      authRepository: options.services.authRepository,
      authService: options.services.authService,
      defaultImportedUserPassword: options.services.defaultImportedUserPassword,
    });

    app.addHook("onClose", async () => {
      await options.services.mongoClient.close();
    });
  },
  {
    name: "guild-leadership-services",
  },
);
