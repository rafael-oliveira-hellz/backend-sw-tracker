import type { FastifyInstance, FastifyReply, RouteShorthandOptions } from "fastify";
import {
  WeeklyPunishmentService,
  isDefenseCompliancePunishmentWindow,
  isDefenseComplianceWarningWindow,
  isDefenseSetupWindow,
  isWeeklyParticipationWindow,
} from "../application/weekly-punishment-service";

import type {
  GuildCurrentStateDto,
  GuildImportHistoryDetailDto,
  GuildImportHistoryItemDto,
  GuildWeeklyPunishmentDto,
  ImportGuildFilesRequestDto,
} from "../domain/models";

type ImportGuildFilesReply = {
  success: boolean;
  result?: unknown;
  payload?: unknown;
  error?: string;
  message?: string;
};

type ListImportHistoryReply = {
  success: boolean;
  history?: GuildImportHistoryItemDto[];
  error?: string;
  message?: string;
};

type ImportHistoryDetailReply = {
  success: boolean;
  detail?: GuildImportHistoryDetailDto;
  error?: string;
  message?: string;
};

type CurrentGuildStateReply = {
  success: boolean;
  currentState?: GuildCurrentStateDto;
  error?: string;
  message?: string;
};

type WeeklyPunishmentsReply = {
  success: boolean;
  punishments?: GuildWeeklyPunishmentDto[];
  run?: {
    weekKey: string;
    evaluatedAt: string;
    saved: number;
    skipped: boolean;
    reason: string;
  };
  error?: string;
  message?: string;
};

const importGuildFilesSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      required: ["files"],
      properties: {
        sourceLabel: { type: "string" },
        files: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["fileName", "content"],
            properties: {
              fileName: { type: "string", minLength: 1 },
              content: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  },
};

const importHistoryParamsSchema: RouteShorthandOptions = {
  schema: {
    params: {
      type: "object",
      required: ["importRunId"],
      properties: {
        importRunId: { type: "string", minLength: 1 },
      },
    },
  },
};

const currentStateQuerySchema: RouteShorthandOptions = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        guildId: {
          anyOf: [{ type: "string", minLength: 1 }, { type: "number" }],
        },
      },
    },
  },
};

const punishmentsQuerySchema: RouteShorthandOptions = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        weekKey: { type: "string", minLength: 1 },
      },
    },
  },
};

const sendImportError = (
  reply: FastifyReply,
  statusCode: number,
  error: string,
  message: string,
) => reply.code(statusCode).send({ success: false, error, message } satisfies ImportGuildFilesReply);

const getBearerToken = (authorization?: string) =>
  authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;

const requireAdminUser = async (
  app: FastifyInstance,
  authorization?: string,
): Promise<{ username: string } | null> => {
  const token = getBearerToken(authorization);
  if (!token) {
    return null;
  }

  const user = await app.authServices.authService.authenticate(token);
  if (user.role !== "leader" && user.role !== "vice-leader") {
    return null;
  }

  return { username: user.username };
};

export async function registerGuildLeadershipRoutes(app: FastifyInstance) {
  const weeklyPunishmentService = new WeeklyPunishmentService(app.guildLeadershipServices.repository);

  app.get("/health", async () => ({
    success: true,
    service: "guild-leadership-backend",
  }));

  app.post<{ Body: ImportGuildFilesRequestDto }>(
    "/api/guild/import-files",
    importGuildFilesSchema,
    async (request, reply) => {
      try {
        const detailed = await app.guildLeadershipServices.importService.importFromFilesDetailed(
          request.body,
        );

        return reply.code(200).send({
          success: true,
          result: detailed.result,
          payload: detailed.payload,
        } satisfies ImportGuildFilesReply);
      } catch (error) {
        request.log.error({ err: error }, "Guild import failed");
        return sendImportError(
          reply,
          400,
          "import_failed",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    },
  );

  app.get("/api/guild/import-history", async (request, reply) => {
    try {
      const history = await app.guildLeadershipServices.repository.listImportHistory();
      return reply.code(200).send({ success: true, history } satisfies ListImportHistoryReply);
    } catch (error) {
      request.log.error({ err: error }, "Import history list failed");
      return reply.code(500).send({
        success: false,
        error: "history_list_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      } satisfies ListImportHistoryReply);
    }
  });

  app.get<{ Querystring: { guildId?: string | number } }>(
    "/api/guild/current-state",
    currentStateQuerySchema,
    async (request, reply) => {
      try {
        const currentState = request.query.guildId
          ? await app.guildLeadershipServices.repository.findCurrentStateByGuildId(
              request.query.guildId,
            )
          : await app.guildLeadershipServices.repository.findLatestCurrentState();

        if (!currentState) {
          return reply.code(404).send({
            success: false,
            error: "current_state_not_found",
            message: "Current guild state not found.",
          } satisfies CurrentGuildStateReply);
        }

        return reply.code(200).send({
          success: true,
          currentState,
        } satisfies CurrentGuildStateReply);
      } catch (error) {
        request.log.error({ err: error }, "Current guild state fetch failed");
        return reply.code(500).send({
          success: false,
          error: "current_state_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies CurrentGuildStateReply);
      }
    },
  );

  app.get<{ Params: { importRunId: string } }>(
    "/api/guild/import-history/:importRunId",
    importHistoryParamsSchema,
    async (request, reply) => {
      try {
        const detail = await app.guildLeadershipServices.repository.findImportHistoryById(
          request.params.importRunId,
        );

        if (!detail) {
          return reply.code(404).send({
            success: false,
            error: "history_not_found",
            message: "Import run not found.",
          } satisfies ImportHistoryDetailReply);
        }

        return reply.code(200).send({
          success: true,
          detail,
        } satisfies ImportHistoryDetailReply);
      } catch (error) {
        request.log.error({ err: error }, "Import history detail failed");
        return reply.code(500).send({
          success: false,
          error: "history_detail_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies ImportHistoryDetailReply);
      }
    },
  );

  app.get<{ Querystring: { weekKey?: string } }>(
    "/api/guild/punishments",
    punishmentsQuerySchema,
    async (request, reply) => {
      try {
        const adminUser = await requireAdminUser(app, request.headers.authorization);
        if (!adminUser) {
          return reply.code(403).send({
            success: false,
            error: "auth_failed",
            message: "Apenas líderes e vice-líderes podem consultar punições.",
          } satisfies WeeklyPunishmentsReply);
        }

        const punishments = await weeklyPunishmentService.listWeeklyPunishments(request.query.weekKey);
        return reply.code(200).send({
          success: true,
          punishments,
        } satisfies WeeklyPunishmentsReply);
      } catch (error) {
        request.log.error({ err: error }, "Punishment list failed");
        return reply.code(500).send({
          success: false,
          error: "punishments_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        } satisfies WeeklyPunishmentsReply);
      }
    },
  );

  app.post("/api/guild/punishments/run-weekly-evaluation", async (request, reply) => {
    try {
      const adminUser = await requireAdminUser(app, request.headers.authorization);
      if (!adminUser) {
        return reply.code(403).send({
          success: false,
          error: "auth_failed",
          message: "Apenas líderes e vice-líderes podem executar a avaliação semanal de punições.",
        } satisfies WeeklyPunishmentsReply);
      }

      const now = new Date();
      const participationRun = isWeeklyParticipationWindow(now)
        ? await weeklyPunishmentService.runForPreviousCompletedWeek(now)
        : null;
      const defenseSetupRun = isDefenseSetupWindow(now)
        ? await weeklyPunishmentService.runCurrentWeekDefenseSetupEvaluation(now)
        : null;
      const defenseComplianceRun =
        isDefenseComplianceWarningWindow(now) || isDefenseCompliancePunishmentWindow(now)
          ? await weeklyPunishmentService.runDefenseComplianceEvaluation(now)
          : null;
      const run =
        defenseComplianceRun ??
        defenseSetupRun ??
        participationRun ?? {
          weekKey: "",
          evaluatedAt: now.toISOString(),
          saved: 0,
          skipped: true,
          reason:
            "Nenhuma janela de avaliação está elegível neste momento. A participação abre no domingo às 05:00 de Brasília, os avisos de defesa rodam de domingo até segunda 12:00 e o setup de defesa abre na segunda às 12:00 de Brasília.",
        };
      request.log.info(
        {
          requestedBy: adminUser.username,
          participationRun,
          defenseSetupRun,
          defenseComplianceRun,
          responseRun: run,
        },
        "Manual weekly punishment evaluation executed",
      );

      return reply.code(200).send({
        success: true,
        run,
      } satisfies WeeklyPunishmentsReply);
    } catch (error) {
      request.log.error({ err: error }, "Weekly punishment evaluation failed");
      return reply.code(500).send({
        success: false,
        error: "weekly_punishment_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      } satisfies WeeklyPunishmentsReply);
    }
  });
}
