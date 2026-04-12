import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import {
  createGuildLeadershipServices,
  getGuildLeadershipAppConfig,
  type GuildLeadershipAppConfig,
} from "./config";
import { guildLeadershipServicesPlugin } from "./plugins/guild-leadership-services";
import { registerAuthRoutes } from "../modules/auth/presentation/routes";
import { registerGuildLeadershipRoutes } from "../modules/guildLeadership/presentation/routes";

type AppErrorShape = {
  statusCode?: number;
  message?: string;
  validation?: unknown;
};

export async function buildGuildLeadershipFastifyApp(
  config: GuildLeadershipAppConfig = getGuildLeadershipAppConfig(),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes,
  });

  const services = createGuildLeadershipServices(config);

  await app.register(cors, {
    origin: config.corsOrigin,
  });

  await app.register(guildLeadershipServicesPlugin, {
    services,
  });

  await app.register(registerAuthRoutes);
  await app.register(registerGuildLeadershipRoutes);

  app.setErrorHandler((error, request, reply) => {
    const appError = error as AppErrorShape;
    request.log.error({ err: error }, "Unhandled application error");

    if (appError.validation) {
      reply.code(400).send({
        success: false,
        error: "validation_failed",
        message: appError.message ?? "Falha de validacao.",
        details: appError.validation,
      });
      return;
    }

    if (appError.statusCode === 413) {
      reply.code(413).send({
        success: false,
        error: "request_too_large",
        message: "O upload excedeu o limite configurado do backend. Aumente BODY_LIMIT_MB ou envie menos arquivos por lote.",
      });
      return;
    }

    reply.code(appError.statusCode ?? 500).send({
      success: false,
      error: "internal_server_error",
      message: appError.message ?? "Erro interno do servidor.",
    });
  });

  return app;
}
