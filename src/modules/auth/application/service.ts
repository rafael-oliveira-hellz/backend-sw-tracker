import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type {
  AuthRepository,
  AuthService,
  AuthenticatedRequest,
  ImportedGuildAuthUser,
} from "./contracts";
import type {
  AuthSessionDto,
  AuthSessionEntity,
  AuthTokensDto,
  AuthUserDto,
  AuthUserEntity,
  LoginRequestDto,
} from "../domain/models";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 4;

const now = () => Date.now();
const nowIso = () => new Date().toISOString();
const futureIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const normalizeLoginValue = (value: string) => value.trim().toLowerCase();
const generateSalt = () => randomBytes(16).toString("hex");
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const generateToken = () => `${randomUUID()}_${randomBytes(32).toString("hex")}`;
const isExpired = (value: string) => new Date(value).getTime() <= now();

const toAuthUserDto = (user: AuthUserEntity): AuthUserDto => ({
  id: user.id,
  username: user.username,
  summonerNumber: user.summonerNumber,
  guildName: user.guildName,
  role: user.role,
  guildId: user.guildId,
  wizardId: user.wizardId,
  importedFromGuild: user.importedFromGuild,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const verifyPassword = (password: string, user: AuthUserEntity) => {
  const candidate = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  const current = Buffer.from(user.passwordHash, "hex");
  if (candidate.length !== current.length) {
    return false;
  }

  return timingSafeEqual(candidate, current);
};

export class BasicAuthService implements AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async login(request: LoginRequestDto): Promise<AuthSessionDto> {
    const loginValue = request.usernameOrNumber.trim();
    if (!loginValue || !request.password) {
      throw new Error("Credenciais inválidas.");
    }

    await this.repository.ensureIndexes();
    const user = await this.repository.findUserByUsernameOrSummoner(loginValue);

    if (!user || !verifyPassword(request.password, user)) {
      throw new Error("Nome de invocador/número ou senha incorretos.");
    }

    return this.createSessionResponse(user);
  }

  async me(accessToken: string): Promise<AuthUserDto> {
    const user = await this.getUserByAccessToken(accessToken);
    return toAuthUserDto(user);
  }

  async authenticate(accessToken: string): Promise<AuthUserDto> {
    return this.me(accessToken);
  }

  async refresh(refreshToken: string): Promise<AuthSessionDto> {
    if (!refreshToken) {
      throw new Error("Refresh token ausente.");
    }

    await this.repository.ensureIndexes();
    const session = await this.repository.findSessionByRefreshTokenHash(hashToken(refreshToken));
    if (!session || session.revokedAt || isExpired(session.refreshTokenExpiresAt)) {
      throw new Error("Refresh token inválido ou expirado.");
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      throw new Error("Usuário da sessão não encontrado.");
    }

    const nextTokens = this.generateTokens();
    const timestamp = nowIso();

    await this.repository.updateSessionTokens(session.id, {
      accessTokenHash: hashToken(nextTokens.accessToken),
      refreshTokenHash: hashToken(nextTokens.refreshToken),
      accessTokenExpiresAt: nextTokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: nextTokens.refreshTokenExpiresAt,
      lastUsedAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      user: toAuthUserDto(user),
      tokens: nextTokens,
    };
  }

  async logout(request: AuthenticatedRequest): Promise<void> {
    await this.repository.ensureIndexes();

    if (request.accessToken) {
      const session = await this.repository.findSessionByAccessTokenHash(hashToken(request.accessToken));
      if (session && !session.revokedAt) {
        await this.repository.revokeSession(session.id, nowIso());
        return;
      }
    }

    if (request.refreshToken) {
      const session = await this.repository.findSessionByRefreshTokenHash(hashToken(request.refreshToken));
      if (session && !session.revokedAt) {
        await this.repository.revokeSession(session.id, nowIso());
      }
    }
  }

  async listUsers(): Promise<AuthUserDto[]> {
    await this.repository.ensureIndexes();
    const users = await this.repository.listUsers();
    return users.map(toAuthUserDto);
  }

  async resetUserPassword(userId: string, nextPassword: string): Promise<AuthUserDto> {
    if (!userId.trim()) {
      throw new Error("Usuário não informado.");
    }

    if (!nextPassword || nextPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    await this.repository.ensureIndexes();
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado.");
    }

    const salt = generateSalt();
    const updatedAt = nowIso();
    await this.repository.updateUserPassword(
      userId,
      hashPassword(nextPassword, salt),
      salt,
      updatedAt,
    );
    await this.repository.deleteSessionsByUserId(userId);

    return {
      ...toAuthUserDto(user),
      updatedAt,
    };
  }

  async syncImportedGuildUsers(users: ImportedGuildAuthUser[], defaultPassword: string) {
    if (!defaultPassword || defaultPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`A senha padrão de importação deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    await this.repository.ensureIndexes();
    return this.repository.syncImportedGuildUsers(users, defaultPassword);
  }

  private async createSessionResponse(user: AuthUserEntity): Promise<AuthSessionDto> {
    const tokens = this.generateTokens();
    const timestamp = nowIso();
    const session: AuthSessionEntity = {
      id: randomUUID(),
      userId: user.id,
      accessTokenHash: hashToken(tokens.accessToken),
      refreshTokenHash: hashToken(tokens.refreshToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      lastUsedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.createSession(session);

    return {
      user: toAuthUserDto(user),
      tokens,
    };
  }

  private generateTokens(): AuthTokensDto {
    return {
      accessToken: generateToken(),
      refreshToken: generateToken(),
      accessTokenExpiresAt: futureIso(ACCESS_TOKEN_TTL_MS),
      refreshTokenExpiresAt: futureIso(REFRESH_TOKEN_TTL_MS),
    };
  }

  private async getUserByAccessToken(accessToken: string): Promise<AuthUserEntity> {
    if (!accessToken) {
      throw new Error("Access token ausente.");
    }

    await this.repository.ensureIndexes();
    const session = await this.repository.findSessionByAccessTokenHash(hashToken(accessToken));
    if (!session || session.revokedAt || isExpired(session.accessTokenExpiresAt)) {
      throw new Error("Access token inválido ou expirado.");
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      throw new Error("Usuário da sessão não encontrado.");
    }

    return user;
  }
}
