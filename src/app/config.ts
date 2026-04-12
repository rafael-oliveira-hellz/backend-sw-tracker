import { MongoClient } from "mongodb";

import { BasicAuthService } from "../modules/auth/application/service";
import { MongoAuthRepository } from "../modules/auth/infrastructure/mongodb-auth.repository";
import { MongoGuildLeadershipRepository } from "../modules/guildLeadership/infrastructure/mongodb.repository";
import { GuildLeadershipImportService } from "../modules/guildLeadership/application/import-service";

export type GuildLeadershipAppConfig = {
  port: number;
  host: string;
  corsOrigin: boolean | string | RegExp | Array<string | RegExp>;
  bodyLimitBytes: number;
  mongoUri: string;
  mongoDatabaseName: string;
  mongoCollectionPrefix: string;
  defaultImportedUserPassword: string;
};

export type GuildLeadershipAppServices = {
  repository: MongoGuildLeadershipRepository;
  importService: GuildLeadershipImportService;
};

export type AuthAppServices = {
  authRepository: MongoAuthRepository;
  authService: BasicAuthService;
  defaultImportedUserPassword: string;
};

export type AppServices = GuildLeadershipAppServices & AuthAppServices & {
  mongoClient: MongoClient;
};

const DEFAULT_BODY_LIMIT_MB = 200;
const DEFAULT_COLLECTION_PREFIX = "";

const parseCorsOrigin = (value?: string): GuildLeadershipAppConfig["corsOrigin"] => {
  if (!value || value === "*") {
    return true;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length <= 1 ? entries[0] ?? true : entries;
};

const parseBodyLimitBytes = (value?: string) => {
  const parsedMb = Number(value ?? DEFAULT_BODY_LIMIT_MB);
  if (!Number.isFinite(parsedMb) || parsedMb <= 0) {
    return DEFAULT_BODY_LIMIT_MB * 1024 * 1024;
  }

  return Math.floor(parsedMb * 1024 * 1024);
};

const resolveMongoDatabaseName = (mongoUri: string, explicitName?: string) => {
  if (explicitName && explicitName.trim() !== "") {
    return explicitName.trim();
  }

  try {
    const url = new URL(mongoUri);
    const pathname = url.pathname.replace(/^\//, "").trim();
    if (pathname) {
      return pathname;
    }
  } catch {
    // fallback to explicit validation below
  }

  throw new Error("MONGODB_DB_NAME is required when the database name is not present in MONGODB_URI.");
};

export function getGuildLeadershipAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GuildLeadershipAppConfig {
  const mongoUri = environment.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required.");
  }

  return {
    port: Number(environment.PORT ?? 3333),
    host: environment.HOST ?? "0.0.0.0",
    corsOrigin: parseCorsOrigin(environment.CORS_ORIGIN),
    bodyLimitBytes: parseBodyLimitBytes(environment.BODY_LIMIT_MB),
    mongoUri,
    mongoDatabaseName: resolveMongoDatabaseName(mongoUri, environment.MONGODB_DB_NAME),
    mongoCollectionPrefix: environment.MONGODB_COLLECTION_PREFIX ?? DEFAULT_COLLECTION_PREFIX,
    defaultImportedUserPassword: environment.DEFAULT_IMPORTED_USER_PASSWORD?.trim() || "guild1234",
  };
}

export function createGuildLeadershipServices(
  config: GuildLeadershipAppConfig,
): AppServices {
  const mongoClient = new MongoClient(config.mongoUri);

  const repository = new MongoGuildLeadershipRepository({
    client: mongoClient,
    mongoUri: config.mongoUri,
    databaseName: config.mongoDatabaseName,
    collectionPrefix: config.mongoCollectionPrefix,
  });

  const authRepository = new MongoAuthRepository({
    client: mongoClient,
    databaseName: config.mongoDatabaseName,
    usersCollectionName: "auth",
    sessionsCollectionName: config.mongoCollectionPrefix
      ? `${config.mongoCollectionPrefix}_auth_sessions`
      : "auth_sessions",
  });
  const authService = new BasicAuthService(authRepository);

  return {
    mongoClient,
    repository,
    importService: new GuildLeadershipImportService(
      repository,
      authService,
      config.defaultImportedUserPassword,
    ),
    authRepository,
    authService,
    defaultImportedUserPassword: config.defaultImportedUserPassword,
  };
}
