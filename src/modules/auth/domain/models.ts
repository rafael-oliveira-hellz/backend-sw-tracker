export type AuthUserRole = "member" | "senior" | "vice-leader" | "leader";

export interface AuthUserDto {
  id: string;
  username: string;
  summonerNumber: string;
  guildName: string;
  role: AuthUserRole;
  guildId?: number;
  wizardId?: number;
  importedFromGuild?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthSessionDto {
  user: AuthUserDto;
  tokens: AuthTokensDto;
}

export interface LoginRequestDto {
  usernameOrNumber: string;
  password: string;
}

export interface RefreshRequestDto {
  refreshToken: string;
}

export interface LogoutRequestDto {
  refreshToken?: string;
}

export interface AuthenticateRequestDto {
  accessToken?: string;
}

export interface AuthUserEntity {
  id: string;
  username: string;
  usernameNormalized: string;
  summonerNumber: string;
  guildName: string;
  role: AuthUserRole;
  guildId?: number;
  wizardId?: number;
  importedFromGuild?: boolean;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionEntity {
  id: string;
  userId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  revokedAt?: string;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}
