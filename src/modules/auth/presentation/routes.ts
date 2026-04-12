import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";

import type {
  AuthenticateRequestDto,
  LoginRequestDto,
  LogoutRequestDto,
  RefreshRequestDto,
} from "../domain/models";

type ResetPasswordRequestDto = {
  userId: string;
};

type ResyncImportedUsersReply = {
  success: boolean;
  sync?: {
    upserted: number;
    removed: number;
    defaultPasswordApplied: boolean;
    requestedBy: string;
    source: {
      importRunId: string;
      snapshotId: string;
      guildId?: number;
      guildName?: string;
      users: number;
    };
  };
  error?: string;
  message?: string;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const loginSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      required: ["usernameOrNumber", "password"],
      properties: {
        usernameOrNumber: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 },
      },
    },
  },
};

const refreshSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: { type: "string", minLength: 1 },
      },
    },
  },
};

const logoutSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      properties: {
        refreshToken: { type: "string" },
      },
    },
  },
};

const authenticateSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
      },
    },
  },
};

const resetPasswordSchema: RouteShorthandOptions = {
  schema: {
    body: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: { type: "string", minLength: 1 },
      },
    },
  },
};

const getBearerToken = (request: FastifyRequest) => {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return undefined;
  }

  return header.slice("Bearer ".length).trim();
};

const sendAuthError = (reply: FastifyReply, statusCode: number, message: string) =>
  reply.code(statusCode).send({
    success: false,
    error: "auth_failed",
    message,
  });

const requireAdminUser = async (app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) => {
  const token = getBearerToken(request);
  if (!token) {
    sendAuthError(reply, 401, "Access token ausente.");
    return null;
  }

  const user = await app.authServices.authService.authenticate(token);
  if (user.role !== "leader" && user.role !== "vice-leader") {
    sendAuthError(reply, 403, "Apenas líderes e vice-líderes podem acessar esta rota.");
    return null;
  }

  return user;
};

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginRequestDto }>("/api/auth/login", loginSchema, async (request, reply) => {
    try {
      const session = await app.authServices.authService.login(request.body);
      return reply.code(200).send({ success: true, session });
    } catch (error) {
      return sendAuthError(reply, 401, error instanceof Error ? error.message : "Falha no login.");
    }
  });

  app.post<{ Body: RefreshRequestDto }>("/api/auth/refresh", refreshSchema, async (request, reply) => {
    try {
      const session = await app.authServices.authService.refresh(request.body.refreshToken);
      return reply.code(200).send({ success: true, session });
    } catch (error) {
      return sendAuthError(reply, 401, error instanceof Error ? error.message : "Falha ao renovar sessão.");
    }
  });

  app.post<{ Body: LogoutRequestDto }>("/api/auth/logout", logoutSchema, async (request, reply) => {
    try {
      await app.authServices.authService.logout({
        accessToken: getBearerToken(request),
        refreshToken: request.body?.refreshToken,
      });
      return reply.code(200).send({ success: true });
    } catch (error) {
      return sendAuthError(reply, 400, error instanceof Error ? error.message : "Falha ao encerrar sessão.");
    }
  });

  app.post<{ Body: AuthenticateRequestDto }>("/api/auth/authenticate", authenticateSchema, async (request, reply) => {
    try {
      const token = request.body?.accessToken ?? getBearerToken(request);
      if (!token) {
        return sendAuthError(reply, 401, "Access token ausente.");
      }

      const user = await app.authServices.authService.authenticate(token);
      return reply.code(200).send({ success: true, user });
    } catch (error) {
      return sendAuthError(reply, 401, error instanceof Error ? error.message : "Falha na autenticação.");
    }
  });

  app.get("/api/auth/me", async (request, reply) => {
    try {
      const token = getBearerToken(request);
      if (!token) {
        return sendAuthError(reply, 401, "Access token ausente.");
      }

      const user = await app.authServices.authService.me(token);
      return reply.code(200).send({ success: true, user });
    } catch (error) {
      return sendAuthError(reply, 401, error instanceof Error ? error.message : "Falha ao carregar usuário.");
    }
  });

  app.get("/api/auth/admin/users", async (request, reply) => {
    try {
      const adminUser = await requireAdminUser(app, request, reply);
      if (!adminUser) {
        return reply;
      }

      const users = await app.authServices.authService.listUsers();
      return reply.code(200).send({
        success: true,
        users,
        requestedBy: adminUser.username,
      });
    } catch (error) {
      return sendAuthError(reply, 500, error instanceof Error ? error.message : "Falha ao listar usuários.");
    }
  });

  app.post<{ Body: ResetPasswordRequestDto }>("/api/auth/admin/reset-password", resetPasswordSchema, async (request, reply) => {
    try {
      const adminUser = await requireAdminUser(app, request, reply);
      if (!adminUser) {
        return reply;
      }

      const user = await app.authServices.authService.resetUserPassword(
        request.body.userId,
        app.authServices.defaultImportedUserPassword,
      );

      return reply.code(200).send({
        success: true,
        user,
        resetBy: adminUser.username,
      });
    } catch (error) {
      return sendAuthError(reply, 400, error instanceof Error ? error.message : "Falha ao resetar a senha.");
    }
  });

  app.post("/api/auth/admin/resync-imported-users", async (request, reply) => {
    try {
      const adminUser = await requireAdminUser(app, request, reply);
      if (!adminUser) {
        return reply;
      }

      const currentState = await app.guildLeadershipServices.repository.findLatestCurrentState();
      if (!currentState) {
        return reply.code(404).send({
          success: false,
          error: "current_state_not_found",
          message: "Nenhuma visão consolidada atual foi encontrada para ressincronizar os acessos.",
        } satisfies ResyncImportedUsersReply);
      }

      const importedUsers = currentState.members
        .filter((member) => member.member.wizardName.trim() !== "")
        .map((member) => ({
          username: member.member.wizardName,
          summonerNumber: String(member.wizardId),
          guildName: member.member.guildName ?? currentState.guildName ?? "",
          guildId: toOptionalNumber(member.member.guildId) ?? toOptionalNumber(currentState.guildId),
          wizardId: member.wizardId,
          role: member.member.guildRole ?? "member",
        }));

      const sync = await app.authServices.authService.syncImportedGuildUsers(
        importedUsers,
        app.authServices.defaultImportedUserPassword,
      );

      request.log.info(
        {
          requestedBy: adminUser.username,
          importRunId: currentState.importRunId,
          snapshotId: currentState.snapshotId,
          guildId: currentState.guildId,
          guildName: currentState.guildName,
          users: importedUsers.length,
          upserted: sync.upserted,
          removed: sync.removed,
        },
        "Manual imported-user resync executed",
      );

      return reply.code(200).send({
        success: true,
        sync: {
          ...sync,
          defaultPasswordApplied: sync.upserted > 0,
          requestedBy: adminUser.username,
          source: {
            importRunId: currentState.importRunId,
            snapshotId: currentState.snapshotId,
            guildId: currentState.guildId,
            guildName: currentState.guildName,
            users: importedUsers.length,
          },
        },
      } satisfies ResyncImportedUsersReply);
    } catch (error) {
      return sendAuthError(
        reply,
        400,
        error instanceof Error ? error.message : "Falha ao ressincronizar os acessos importados.",
      );
    }
  });
}
