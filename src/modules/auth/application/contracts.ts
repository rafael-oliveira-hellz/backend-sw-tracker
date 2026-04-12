import type {
  AuthSessionDto,
  AuthSessionEntity,
  AuthUserDto,
  AuthUserEntity,
  LoginRequestDto,
} from "../domain/models";

export interface ImportedGuildAuthUser {
  username: string;
  summonerNumber: string;
  guildName: string;
  guildId?: number;
  wizardId?: number;
  role: AuthUserEntity["role"];
}

export interface AuthRepository {
  ensureIndexes(): Promise<void>;
  findUserById(userId: string): Promise<AuthUserEntity | null>;
  findUserByUsernameOrSummoner(usernameOrNumber: string): Promise<AuthUserEntity | null>;
  listUsers(): Promise<AuthUserEntity[]>;
  createUser(user: AuthUserEntity): Promise<AuthUserEntity>;
  createSession(session: AuthSessionEntity): Promise<AuthSessionEntity>;
  findSessionByAccessTokenHash(accessTokenHash: string): Promise<AuthSessionEntity | null>;
  findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionEntity | null>;
  updateSessionTokens(sessionId: string, session: Pick<AuthSessionEntity, "accessTokenHash" | "refreshTokenHash" | "accessTokenExpiresAt" | "refreshTokenExpiresAt" | "lastUsedAt" | "updatedAt">): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string, passwordSalt: string, updatedAt: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;
  revokeSession(sessionId: string, revokedAt: string): Promise<void>;
  syncImportedGuildUsers(users: ImportedGuildAuthUser[], defaultPassword: string): Promise<{
    upserted: number;
    removed: number;
  }>;
}

export interface AuthenticatedRequest {
  accessToken?: string;
  refreshToken?: string;
}

export interface AuthService {
  login(request: LoginRequestDto): Promise<AuthSessionDto>;
  me(accessToken: string): Promise<AuthUserDto>;
  authenticate(accessToken: string): Promise<AuthUserDto>;
  refresh(refreshToken: string): Promise<AuthSessionDto>;
  logout(request: AuthenticatedRequest): Promise<void>;
  listUsers(): Promise<AuthUserDto[]>;
  resetUserPassword(userId: string, nextPassword: string): Promise<AuthUserDto>;
  syncImportedGuildUsers(users: ImportedGuildAuthUser[], defaultPassword: string): Promise<{
    upserted: number;
    removed: number;
  }>;
}
