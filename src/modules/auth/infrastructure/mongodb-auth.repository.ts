import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import type { MongoClient, Db, Document } from "mongodb";

import type { AuthRepository, ImportedGuildAuthUser } from "../application/contracts";
import type { AuthSessionEntity, AuthUserEntity } from "../domain/models";

export type MongoAuthRepositoryOptions = {
  client: MongoClient;
  databaseName: string;
  usersCollectionName?: string;
  sessionsCollectionName?: string;
};

type MongoAuthCollections = {
  users: string;
  sessions: string;
};

const DEFAULT_USERS_COLLECTION = "auth";
const DEFAULT_SESSIONS_COLLECTION = "auth_sessions";
const normalizeUsername = (value: string) => value.trim().toLowerCase();
const generateSalt = () => randomBytes(16).toString("hex");
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sanitizeMongoDocument = <T extends Document>(document: T | null): T | null => {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  return rest as T;
};

const sanitizeMongoDocuments = <T extends Document>(documents: T[]): T[] =>
  documents
    .map((document) => sanitizeMongoDocument(document))
    .filter(Boolean) as T[];

export class MongoAuthRepository implements AuthRepository {
  private db: Db | null = null;

  private indexesEnsured: Promise<void> | null = null;

  private readonly collections: MongoAuthCollections;

  constructor(private readonly options: MongoAuthRepositoryOptions) {
    this.collections = {
      users: options.usersCollectionName ?? DEFAULT_USERS_COLLECTION,
      sessions: options.sessionsCollectionName ?? DEFAULT_SESSIONS_COLLECTION,
    };
  }

  async ensureIndexes(): Promise<void> {
    if (!this.indexesEnsured) {
      this.indexesEnsured = this.createIndexes();
    }

    await this.indexesEnsured;
  }

  async findUserById(userId: string): Promise<AuthUserEntity | null> {
    const user = await (await this.getDb()).collection<AuthUserEntity>(this.collections.users).findOne({ id: userId });
    return sanitizeMongoDocument(user as Document as AuthUserEntity | null);
  }

  async findUserByUsernameOrSummoner(usernameOrNumber: string): Promise<AuthUserEntity | null> {
    const trimmed = usernameOrNumber.trim();
    const normalized = trimmed.toLowerCase();
    const maybeWizardId = Number(trimmed);
    const user = await (await this.getDb()).collection<AuthUserEntity>(this.collections.users).findOne({
      $or: [
        { username: trimmed },
        { usernameNormalized: normalized },
        { summonerNumber: trimmed },
        ...(Number.isFinite(maybeWizardId) ? [{ wizardId: maybeWizardId }] : []),
      ],
    });

    return sanitizeMongoDocument(user as Document as AuthUserEntity | null);
  }

  async listUsers(): Promise<AuthUserEntity[]> {
    const users = await (await this.getDb())
      .collection<AuthUserEntity>(this.collections.users)
      .find({})
      .sort({ guildName: 1, role: 1, usernameNormalized: 1 })
      .toArray();

    return (sanitizeMongoDocuments(users as unknown as Document[]) as AuthUserEntity[]) ?? [];
  }

  async createUser(user: AuthUserEntity): Promise<AuthUserEntity> {
    await (await this.getDb()).collection<AuthUserEntity>(this.collections.users).insertOne(user);
    return user;
  }

  async createSession(session: AuthSessionEntity): Promise<AuthSessionEntity> {
    await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).insertOne(session);
    return session;
  }

  async findSessionByAccessTokenHash(accessTokenHash: string): Promise<AuthSessionEntity | null> {
    const session = await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).findOne({ accessTokenHash });
    return sanitizeMongoDocument(session as Document as AuthSessionEntity | null);
  }

  async findSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionEntity | null> {
    const session = await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).findOne({ refreshTokenHash });
    return sanitizeMongoDocument(session as Document as AuthSessionEntity | null);
  }

  async updateSessionTokens(
    sessionId: string,
    session: Pick<AuthSessionEntity, "accessTokenHash" | "refreshTokenHash" | "accessTokenExpiresAt" | "refreshTokenExpiresAt" | "lastUsedAt" | "updatedAt">,
  ): Promise<void> {
    await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).updateOne(
      { id: sessionId },
      {
        $set: {
          ...session,
        },
        $unset: {
          revokedAt: "",
        },
      },
    );
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    passwordSalt: string,
    updatedAt: string,
  ): Promise<void> {
    await (await this.getDb()).collection<AuthUserEntity>(this.collections.users).updateOne(
      { id: userId },
      {
        $set: {
          passwordHash,
          passwordSalt,
          updatedAt,
        },
      },
    );
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).deleteMany({
      userId,
    });
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    await (await this.getDb()).collection<AuthSessionEntity>(this.collections.sessions).updateOne(
      { id: sessionId },
      {
        $set: {
          revokedAt,
          updatedAt: revokedAt,
        },
      },
    );
  }

  async syncImportedGuildUsers(users: ImportedGuildAuthUser[], defaultPassword: string): Promise<{
    upserted: number;
    removed: number;
  }> {
    if (users.length === 0) {
      return {
        upserted: 0,
        removed: 0,
      };
    }

    const db = await this.getDb();
    const usersCollection = db.collection<AuthUserEntity>(this.collections.users);
    const sessionsCollection = db.collection<AuthSessionEntity>(this.collections.sessions);
    const now = new Date().toISOString();
    const upsertedUserIds = new Set<string>();
    const wizardIdsByGuild = new Map<number, Set<number>>();

    for (const importedUser of users) {
      const username = importedUser.username.trim();
      const summonerNumber = importedUser.summonerNumber.trim();
      const guildName = importedUser.guildName.trim();
      const guildId = toOptionalNumber(importedUser.guildId);
      const usernameNormalized = normalizeUsername(username);
      const nextSalt = generateSalt();
      const nextPasswordHash = hashPassword(defaultPassword, nextSalt);

      let existing: AuthUserEntity | null = null;

      if (importedUser.wizardId !== undefined) {
        existing = await usersCollection.findOne({
          wizardId: importedUser.wizardId,
        } as Partial<AuthUserEntity>);
      }

      if (!existing) {
        existing = await usersCollection.findOne({
          $or: [
            { usernameNormalized },
            { summonerNumber },
          ],
        });
      }

      if (existing) {
        await usersCollection.updateOne(
          { id: existing.id },
          {
            $set: {
              username,
              usernameNormalized,
              summonerNumber,
              guildName,
              guildId,
              wizardId: importedUser.wizardId,
              role: importedUser.role,
              importedFromGuild: true,
              passwordHash: nextPasswordHash,
              passwordSalt: nextSalt,
              updatedAt: now,
            },
          },
        );

        upsertedUserIds.add(existing.id);
      } else {
        const userId = randomUUID();
        const entity: AuthUserEntity = {
          id: userId,
          username,
          usernameNormalized,
          summonerNumber,
          guildName,
          guildId,
          wizardId: importedUser.wizardId,
          role: importedUser.role,
          importedFromGuild: true,
          passwordHash: nextPasswordHash,
          passwordSalt: nextSalt,
          createdAt: now,
          updatedAt: now,
        };

        await usersCollection.insertOne(entity);
        upsertedUserIds.add(userId);
      }

      if (guildId !== undefined && importedUser.wizardId !== undefined) {
        const wizardIds = wizardIdsByGuild.get(guildId) ?? new Set<number>();
        wizardIds.add(importedUser.wizardId);
        wizardIdsByGuild.set(guildId, wizardIds);
      }
    }

    let removed = 0;

    for (const [guildId, activeWizardIds] of wizardIdsByGuild.entries()) {
      const staleImportedUsers = await usersCollection
        .find({
          guildId,
          importedFromGuild: true,
          wizardId: {
            $nin: [...activeWizardIds],
          },
        })
        .toArray();

      if (staleImportedUsers.length === 0) {
        continue;
      }

      const staleUserIds = staleImportedUsers.map((user) => user.id);

      await usersCollection.deleteMany({
        id: {
          $in: staleUserIds,
        },
      });

      await sessionsCollection.deleteMany({
        userId: {
          $in: staleUserIds,
        },
      });

      removed += staleImportedUsers.length;
    }

    return {
      upserted: upsertedUserIds.size,
      removed,
    };
  }

  private async createIndexes(): Promise<void> {
    const db = await this.getDb();

    await Promise.all([
      db.collection(this.collections.users).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_auth_user_id" },
        { key: { usernameNormalized: 1 }, unique: true, name: "uid_auth_username_normalized" },
        { key: { summonerNumber: 1 }, unique: true, name: "uid_auth_summoner_number" },
        { key: { wizardId: 1 }, unique: true, sparse: true, name: "uid_auth_wizard_id" },
        { key: { guildId: 1, importedFromGuild: 1 }, name: "idx_auth_guild_imported" },
      ]),
      db.collection(this.collections.sessions).createIndexes([
        { key: { id: 1 }, unique: true, name: "uid_auth_session_id" },
        { key: { accessTokenHash: 1 }, unique: true, name: "uid_auth_access_token_hash" },
        { key: { refreshTokenHash: 1 }, unique: true, name: "uid_auth_refresh_token_hash" },
        { key: { userId: 1, revokedAt: 1 }, name: "idx_auth_session_user_revoked" },
        { key: { accessTokenExpiresAt: 1 }, name: "idx_auth_access_expires_at" },
        { key: { refreshTokenExpiresAt: 1 }, name: "idx_auth_refresh_expires_at" },
      ]),
    ]);
  }

  private async getDb(): Promise<Db> {
    if (!this.db) {
      this.db = this.options.client.db(this.options.databaseName);
    }

    return this.db;
  }
}
