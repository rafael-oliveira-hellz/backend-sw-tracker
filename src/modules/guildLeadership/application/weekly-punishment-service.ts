import { randomUUID } from "node:crypto";

import type {
  GuildLeadershipReadRepository,
  GuildLeadershipRepository,
} from "./contracts";
import type {
  AttackBattleRecordDto,
  GuildCurrentMemberStateDto,
  GuildCurrentStateDto,
  GuildWeeklyPunishmentDto,
  GuildWeeklyPunishmentEntity,
  WeeklyPunishmentEventAssessmentDto,
  WeeklyPunishmentEventKey,
} from "../domain/models";

const BRAZIL_TIMEZONE = "America/Sao_Paulo";
const PENALTY_COOLDOWN_DAYS = 15;
const LABYRINTH_FIRST_START_UTC = new Date(Date.UTC(2026, 3, 4));
const LABYRINTH_CYCLE_DAYS = 15;
const LABYRINTH_ACTIVE_DAYS = 4;
const GUILD_WAR_REQUIRED_DEFENSES = 5;
const SIEGE_REQUIRED_DEFENSES = 3;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type WeekRange = {
  weekKey: string;
  weekStart: Date;
  weekEnd: Date;
};

type WeeklyPunishmentRunResult = {
  weekKey: string;
  evaluatedAt: string;
  saved: number;
  skipped: boolean;
  reason: string;
  evaluationKind: "weeklyParticipation" | "defenseSetup" | "defenseCompliance";
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getBrazilCalendarDate = (date: Date): CalendarDate => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
  };
};

const formatBrazilDateTime = (dateIso: string) =>
  new Date(dateIso).toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIMEZONE,
  });

const formatBrazilDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createUtcDate = ({ year, month, day }: CalendarDate) =>
  new Date(Date.UTC(year, month - 1, day));

const addUtcDays = (date: Date, days: number) => {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

const startOfUtcWeekSunday = (date: Date) => {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
  return copy;
};

const endOfUtcWeekSaturday = (weekStart: Date) => addUtcDays(weekStart, 6);

const buildPreviousCompletedWeekRange = (now: Date): WeekRange => {
  const brazilToday = createUtcDate(getBrazilCalendarDate(now));
  const currentWeekStart = startOfUtcWeekSunday(brazilToday);
  const previousWeekStart = addUtcDays(currentWeekStart, -7);
  const previousWeekEnd = endOfUtcWeekSaturday(previousWeekStart);

  return {
    weekKey: formatBrazilDate(previousWeekStart),
    weekStart: previousWeekStart,
    weekEnd: previousWeekEnd,
  };
};

const buildCurrentWeekRange = (now: Date): WeekRange => {
  const brazilToday = createUtcDate(getBrazilCalendarDate(now));
  const currentWeekStart = startOfUtcWeekSunday(brazilToday);
  const currentWeekEnd = endOfUtcWeekSaturday(currentWeekStart);

  return {
    weekKey: formatBrazilDate(currentWeekStart),
    weekStart: currentWeekStart,
    weekEnd: currentWeekEnd,
  };
};

const resolveAttackDate = (attack: AttackBattleRecordDto): Date | null => {
  if (attack.occurredAt) {
    const parts = getBrazilCalendarDate(new Date(attack.occurredAt * 1000));
    return createUtcDate(parts);
  }

  if (attack.dateId) {
    const value = String(attack.dateId);
    if (value.length === 8) {
      return new Date(
        Date.UTC(
          Number(value.slice(0, 4)),
          Number(value.slice(4, 6)) - 1,
          Number(value.slice(6, 8)),
        ),
      );
    }
  }

  return null;
};

const buildAttackIdentity = (attack: AttackBattleRecordDto) =>
  [
    attack.context,
    attack.battleId,
    attack.matchId ?? "",
    attack.baseId ?? attack.baseNumber ?? "",
    attack.targetWizardId ?? "",
    attack.dateId ?? "",
  ].join(":");

const dedupeAttacks = (attacks: AttackBattleRecordDto[]) => {
  const seen = new Set<string>();

  return attacks.filter((attack) => {
    const identity = buildAttackIdentity(attack);
    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
};

const buildGuildWarEntryKey = (attack: AttackBattleRecordDto) =>
  attack.context === "guildWar" ? attack.battleId.replace(/-\d+$/, "") : attack.battleId;

const countGuildWarEntries = (attacks: AttackBattleRecordDto[]) =>
  new Set(dedupeAttacks(attacks).map((attack) => buildGuildWarEntryKey(attack))).size;

const filterAttacksToWeek = (
  attacks: AttackBattleRecordDto[],
  weekStart: Date,
  weekEnd: Date,
) =>
  dedupeAttacks(attacks).filter((attack) => {
    const attackDate = resolveAttackDate(attack);
    if (!attackDate) {
      return false;
    }

    return attackDate >= weekStart && attackDate <= weekEnd;
  });

const filterAttacksByWeekdays = (attacks: AttackBattleRecordDto[], weekdays: number[]) =>
  dedupeAttacks(attacks).filter((attack) => {
    const attackDate = resolveAttackDate(attack);
    return attackDate ? weekdays.includes(attackDate.getUTCDay()) : false;
  });

const memberDidLabyrinth = (member: GuildCurrentMemberStateDto) =>
  Boolean(
    (member.labyrinth.score ?? 0) > 0 ||
      (member.labyrinth.contributionRate ?? 0) > 0 ||
      member.labyrinth.isMvp,
  );

const memberDidSubjugation = (member: GuildCurrentMemberStateDto) =>
  Boolean(
    (member.subjugation.clearScore ?? 0) > 0 ||
      (member.subjugation.contributeRatio ?? 0) > 0,
  );

const isLabyrinthActiveDuringWeek = (weekStart: Date, weekEnd: Date) => {
  for (
    let cycleStart = new Date(LABYRINTH_FIRST_START_UTC.getTime());
    cycleStart <= addUtcDays(weekEnd, LABYRINTH_CYCLE_DAYS);
    cycleStart = addUtcDays(cycleStart, LABYRINTH_CYCLE_DAYS)
  ) {
    const cycleEnd = addUtcDays(cycleStart, LABYRINTH_ACTIVE_DAYS - 1);
    if (cycleStart <= weekEnd && cycleEnd >= weekStart) {
      return true;
    }
  }

  return false;
};

const buildReason = (
  label: string,
  completed: number,
  expected: number,
  details?: string,
) =>
  `${label}: ${completed}/${expected}${details ? ` (${details})` : ""}`;

const calculateWinRate = (wins: number, losses: number, draws: number) => {
  const total = wins + losses + draws;
  if (total <= 0) {
    return 0;
  }

  return Number((((wins + draws * 0.5) / total) * 100).toFixed(2));
};

const createAssessment = (
  eventKey: WeeklyPunishmentEventKey,
  label: string,
  required: boolean,
  completed: number,
  expected: number,
  punishmentApplied: boolean,
  reason: string,
): WeeklyPunishmentEventAssessmentDto => ({
  eventKey,
  label,
  required,
  completed,
  expected,
  punishmentApplied,
  reason,
});

const mergeAssessments = (
  existing: WeeklyPunishmentEventAssessmentDto[],
  incoming: WeeklyPunishmentEventAssessmentDto[],
) => {
  const byKey = new Map<WeeklyPunishmentEventKey, WeeklyPunishmentEventAssessmentDto>();

  for (const assessment of existing) {
    byKey.set(assessment.eventKey, assessment);
  }

  for (const assessment of incoming) {
    byKey.set(assessment.eventKey, assessment);
  }

  return Array.from(byKey.values());
};

const buildPunishmentSummary = (
  assessments: WeeklyPunishmentEventAssessmentDto[],
  cooldownActive: boolean,
  nextEligiblePenaltyAt?: string,
) => {
  const punished = assessments.filter((assessment) => assessment.punishmentApplied);
  if (punished.length > 0) {
    return punished.map((assessment) => assessment.reason).join(" | ");
  }

  if (cooldownActive) {
    return `Isento de nova punição até ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indisponível"} por punição anterior.`;
  }

  return "Sem pendências punitivas nas avaliações já executadas para esta semana.";
};

const memberWasAssignedToGuildWar = (member: GuildCurrentMemberStateDto) =>
  member.guildWar.currentAttackCount !== undefined || member.guildWar.currentEnergy !== undefined;

const buildRemovalMarker = (
  member: GuildCurrentMemberStateDto,
  week: WeekRange,
  punishmentApplied: boolean,
) => {
  if (!punishmentApplied) {
    return {
      markedForRemoval: false,
      removalReasonSummary: undefined,
    };
  }

  const reasons: string[] = [];
  const subjugationCompleted = memberDidSubjugation(member);
  const labyrinthRequired = isLabyrinthActiveDuringWeek(week.weekStart, week.weekEnd);
  const labyrinthCompleted = memberDidLabyrinth(member);

  if (!subjugationCompleted) {
    reasons.push("Sem ataque registrado na subjugação durante a semana de punição.");
  }

  if (labyrinthRequired && !labyrinthCompleted) {
    reasons.push("Lab aberto na semana de punição e sem ataque registrado no labirinto.");
  }

  return {
    markedForRemoval: reasons.length > 0,
    removalReasonSummary:
      reasons.length > 0
        ? `Marcado para remoção: ${reasons.join(" ")}`
        : undefined,
  };
};

const memberWasAssignedToSiege = (member: GuildCurrentMemberStateDto) =>
  member.siege.defenses.length > 0 || member.coverage.siegeAttacks || member.coverage.siegeDefenses;

const formatDefenseLocation = (
  context: "guildWar" | "siege",
  defense: GuildCurrentMemberStateDto["guildWar"]["defenses"][number],
) =>
  context === "guildWar"
    ? `rodada ${defense.round ?? "-"}`
    : `base ${defense.assignedBase ?? "-"}`;

const getDefenseCompliancePhase = (now = new Date()): "warning" | "punishment" | null => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  if (weekday === "Sun") {
    return "warning";
  }

  if (weekday === "Mon" && hour < 12) {
    return "warning";
  }

  if (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(weekday)) {
    return "punishment";
  }

  return null;
};

export class WeeklyPunishmentService {
  constructor(
    private readonly repository: GuildLeadershipRepository & GuildLeadershipReadRepository,
  ) {}

  async runForPreviousCompletedWeek(now = new Date()): Promise<WeeklyPunishmentRunResult> {
    const currentState = await this.repository.findLatestCurrentState();

    if (!currentState) {
      return {
        evaluationKind: "weeklyParticipation",
        weekKey: buildPreviousCompletedWeekRange(now).weekKey,
        evaluatedAt: now.toISOString(),
        saved: 0,
        skipped: true,
        reason: "Nenhum estado atual sincronizado foi encontrado para avaliar punições.",
      };
    }

    const week = buildPreviousCompletedWeekRange(now);
    const recentPunishments = await this.repository.listWeeklyPunishments({
      evaluatedAtFrom: addUtcDays(week.weekStart, -PENALTY_COOLDOWN_DAYS).toISOString(),
    });
    const existing = await this.repository.listWeeklyPunishments({ weekKey: week.weekKey });

    const entities = this.buildParticipationPunishmentEntities(
      currentState,
      week,
      now.toISOString(),
      recentPunishments,
      existing,
    );

    await this.repository.saveWeeklyPunishments(entities);

    return {
      evaluationKind: "weeklyParticipation",
      weekKey: week.weekKey,
      evaluatedAt: now.toISOString(),
      saved: entities.length,
      skipped: false,
      reason: "Avaliação semanal de participação consolidada com sucesso.",
    };
  }

  async runCurrentWeekDefenseSetupEvaluation(now = new Date()): Promise<WeeklyPunishmentRunResult> {
    const currentState = await this.repository.findLatestCurrentState();

    if (!currentState) {
      return {
        evaluationKind: "defenseSetup",
        weekKey: buildCurrentWeekRange(now).weekKey,
        evaluatedAt: now.toISOString(),
        saved: 0,
        skipped: true,
        reason: "Nenhum estado atual sincronizado foi encontrado para avaliar defesas.",
      };
    }

    const week = buildCurrentWeekRange(now);
    const recentPunishments = await this.repository.listWeeklyPunishments({
      evaluatedAtFrom: addUtcDays(week.weekStart, -PENALTY_COOLDOWN_DAYS).toISOString(),
    });
    const existing = await this.repository.listWeeklyPunishments({ weekKey: week.weekKey });

    const entities = this.buildDefenseSetupPunishmentEntities(
      currentState,
      week,
      now.toISOString(),
      recentPunishments,
      existing,
    );

    await this.repository.saveWeeklyPunishments(entities);

    return {
      evaluationKind: "defenseSetup",
      weekKey: week.weekKey,
      evaluatedAt: now.toISOString(),
      saved: entities.length,
      skipped: false,
      reason: "Avaliação de setup de defesa consolidada com sucesso.",
    };
  }

  async listWeeklyPunishments(weekKey?: string) {
    return this.repository.listWeeklyPunishments({ weekKey });
  }

  async runDefenseComplianceEvaluation(now = new Date()): Promise<WeeklyPunishmentRunResult> {
    const currentState = await this.repository.findLatestCurrentState();

    if (!currentState) {
      return {
        evaluationKind: "defenseCompliance",
        weekKey: buildCurrentWeekRange(now).weekKey,
        evaluatedAt: now.toISOString(),
        saved: 0,
        skipped: true,
        reason: "Nenhum estado atual sincronizado foi encontrado para avaliar os alertas de defesa.",
      };
    }

    const phase = getDefenseCompliancePhase(now);
    if (!phase) {
      return {
        evaluationKind: "defenseCompliance",
        weekKey: buildCurrentWeekRange(now).weekKey,
        evaluatedAt: now.toISOString(),
        saved: 0,
        skipped: true,
        reason: "A janela de auditoria de composição/equipamento não está ativa neste momento.",
      };
    }

    const week = buildCurrentWeekRange(now);
    const recentPunishments = await this.repository.listWeeklyPunishments({
      evaluatedAtFrom: addUtcDays(week.weekStart, -PENALTY_COOLDOWN_DAYS).toISOString(),
    });
    const existing = await this.repository.listWeeklyPunishments({ weekKey: week.weekKey });

    const entities = currentState.members.map((member) => {
      const existingPunishment = existing.find((entry) => entry.wizardId === member.wizardId);
      const { cooldownActive, nextEligiblePenaltyAt } = this.resolveCooldown(
        member,
        now.toISOString(),
        recentPunishments,
        existingPunishment,
      );

      const incomingAssessments = this.buildDefenseComplianceAssessments(
        member,
        phase,
        cooldownActive,
        nextEligiblePenaltyAt,
      );

      return this.buildEntityFromAssessments(
        member,
        currentState,
        week,
        now.toISOString(),
        cooldownActive,
        nextEligiblePenaltyAt,
        existingPunishment,
        incomingAssessments,
      );
    });

    await this.repository.saveWeeklyPunishments(entities);

    return {
      evaluationKind: "defenseCompliance",
      weekKey: week.weekKey,
      evaluatedAt: now.toISOString(),
      saved: entities.length,
      skipped: false,
      reason:
        phase === "warning"
          ? "Avisos de composição/equipamento das defesas atualizados com sucesso."
          : "Avaliação final de composição/equipamento das defesas consolidada com sucesso.",
    };
  }

  private buildParticipationPunishmentEntities(
    currentState: GuildCurrentStateDto,
    week: WeekRange,
    evaluatedAt: string,
    recentPunishments: GuildWeeklyPunishmentDto[],
    existing: GuildWeeklyPunishmentDto[],
  ): GuildWeeklyPunishmentEntity[] {
    return currentState.members.map((member) => {
      const existingPunishment = existing.find((entry) => entry.wizardId === member.wizardId);
      const { cooldownActive, nextEligiblePenaltyAt } = this.resolveCooldown(
        member,
        evaluatedAt,
        recentPunishments,
        existingPunishment,
      );

      const incomingAssessments = this.buildParticipationAssessments(
        member,
        week,
        cooldownActive,
        nextEligiblePenaltyAt,
      );

      return this.buildEntityFromAssessments(
        member,
        currentState,
        week,
        evaluatedAt,
        cooldownActive,
        nextEligiblePenaltyAt,
        existingPunishment,
        incomingAssessments,
      );
    });
  }

  private buildDefenseSetupPunishmentEntities(
    currentState: GuildCurrentStateDto,
    week: WeekRange,
    evaluatedAt: string,
    recentPunishments: GuildWeeklyPunishmentDto[],
    existing: GuildWeeklyPunishmentDto[],
  ): GuildWeeklyPunishmentEntity[] {
    return currentState.members.map((member) => {
      const existingPunishment = existing.find((entry) => entry.wizardId === member.wizardId);
      const { cooldownActive, nextEligiblePenaltyAt } = this.resolveCooldown(
        member,
        evaluatedAt,
        recentPunishments,
        existingPunishment,
      );

      const incomingAssessments = this.buildDefenseSetupAssessments(
        member,
        cooldownActive,
        nextEligiblePenaltyAt,
      );

      return this.buildEntityFromAssessments(
        member,
        currentState,
        week,
        evaluatedAt,
        cooldownActive,
        nextEligiblePenaltyAt,
        existingPunishment,
        incomingAssessments,
      );
    });
  }

  private resolveCooldown(
    member: GuildCurrentMemberStateDto,
    evaluatedAt: string,
    recentPunishments: GuildWeeklyPunishmentDto[],
    existingPunishment?: GuildWeeklyPunishmentDto,
  ) {
    const latestRecentPunishment = recentPunishments
      .filter((punishment) => punishment.wizardId === member.wizardId && punishment.punishmentApplied)
      .sort(
        (left, right) =>
          new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
      )[0];

    const cooldownActive = latestRecentPunishment
      ? new Date(latestRecentPunishment.evaluatedAt).getTime() +
          PENALTY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000 >
        new Date(evaluatedAt).getTime()
      : existingPunishment?.cooldownActive ?? false;

    const nextEligiblePenaltyAt = latestRecentPunishment
      ? new Date(
          new Date(latestRecentPunishment.evaluatedAt).getTime() +
            PENALTY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      : existingPunishment?.nextEligiblePenaltyAt;

    return {
      cooldownActive,
      nextEligiblePenaltyAt,
    };
  }

  private buildEntityFromAssessments(
    member: GuildCurrentMemberStateDto,
    currentState: GuildCurrentStateDto,
    week: WeekRange,
    evaluatedAt: string,
    cooldownActive: boolean,
    nextEligiblePenaltyAt: string | undefined,
    existingPunishment: GuildWeeklyPunishmentDto | undefined,
    incomingAssessments: WeeklyPunishmentEventAssessmentDto[],
  ): GuildWeeklyPunishmentEntity {
    const mergedAssessments = mergeAssessments(existingPunishment?.events ?? [], incomingAssessments);
    const punishedEventKeys = mergedAssessments
      .filter((assessment) => assessment.punishmentApplied)
      .map((assessment) => assessment.eventKey);
    const punishmentApplied = punishedEventKeys.length > 0;
    const { markedForRemoval, removalReasonSummary } = buildRemovalMarker(
      member,
      week,
      punishmentApplied,
    );

    return {
      id: existingPunishment?.wizardId ? randomUUID() : randomUUID(),
      createdAt: existingPunishment?.evaluatedAt ?? evaluatedAt,
      updatedAt: evaluatedAt,
      weekKey: week.weekKey,
      weekStart: week.weekStart.toISOString(),
      weekEnd: week.weekEnd.toISOString(),
      evaluatedAt,
      guildId: toOptionalNumber(member.member.guildId) ?? toOptionalNumber(currentState.guildId),
      guildName: member.member.guildName ?? currentState.guildName,
      importRunId: currentState.importRunId,
      snapshotId: currentState.snapshotId,
      wizardId: member.wizardId,
      memberName: member.member.wizardName,
      role: member.member.guildRole,
      cooldownActive,
      punishmentApplied,
      markedForRemoval,
      punishedEventKeysJson: JSON.stringify(punishedEventKeys),
      reasonSummary: buildPunishmentSummary(
        mergedAssessments,
        cooldownActive,
        nextEligiblePenaltyAt,
      ),
      removalReasonSummary,
      nextEligiblePenaltyAt,
      eventsJson: JSON.stringify(mergedAssessments),
    };
  }

  private buildParticipationAssessments(
    member: GuildCurrentMemberStateDto,
    week: WeekRange,
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
  ): WeeklyPunishmentEventAssessmentDto[] {
    const guildWarAssigned = memberWasAssignedToGuildWar(member);
    const guildWarWeekAttacks = filterAttacksToWeek(
      member.guildWar.attacks ?? [],
      week.weekStart,
      week.weekEnd,
    );
    const guildWarOne = filterAttacksByWeekdays(guildWarWeekAttacks, [3, 4]);
    const guildWarTwo = filterAttacksByWeekdays(guildWarWeekAttacks, [5, 6]);
    const guildWarEntriesOne = countGuildWarEntries(guildWarOne);
    const guildWarEntriesTwo = countGuildWarEntries(guildWarTwo);
    const guildWarCompleted = guildWarEntriesOne + guildWarEntriesTwo;
    const guildWarExpected = guildWarAssigned ? 4 : 0;
    const guildWarWouldPunish = guildWarAssigned && guildWarCompleted < guildWarExpected;

    const siegeAssigned = memberWasAssignedToSiege(member);
    const siegeWeekAttacks = filterAttacksToWeek(
      member.siege.attacks ?? [],
      week.weekStart,
      week.weekEnd,
    );
    const siegeOne = filterAttacksByWeekdays(siegeWeekAttacks, [1, 2]).length;
    const siegeTwo = filterAttacksByWeekdays(siegeWeekAttacks, [4, 5]).length;
    const siegeCompleted = siegeOne + siegeTwo;
    const siegeExpected = siegeAssigned ? 60 : 0;
    const siegeWouldPunish = siegeAssigned && (siegeOne < 30 || siegeTwo < 30);

    const labyrinthRequired = isLabyrinthActiveDuringWeek(week.weekStart, week.weekEnd);
    const labyrinthCompleted = memberDidLabyrinth(member) ? 1 : 0;
    const labyrinthWouldPunish = labyrinthRequired && labyrinthCompleted < 1;

    const subjugationCompleted = memberDidSubjugation(member) ? 1 : 0;
    const subjugationWouldPunish = subjugationCompleted < 1;

    const cooldownReason = cooldownActive
      ? `Isento nesta semana por punição anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indisponível"}.`
      : undefined;

    return [
      createAssessment(
        "guildWar",
        "Batalha de Guilda",
        guildWarAssigned,
        guildWarCompleted,
        guildWarExpected,
        guildWarWouldPunish && !cooldownActive,
        cooldownReason ??
          (!guildWarAssigned
            ? "Sem escalação registrada em GW no snapshot usado para avaliação."
            : guildWarWouldPunish
              ? buildReason(
                  "GW obrigatória não concluída",
                  guildWarCompleted,
                  guildWarExpected,
                  `GW 1: ${guildWarEntriesOne}/2 entradas, GW 2: ${guildWarEntriesTwo}/2 entradas`,
                )
              : buildReason(
                  "GW concluída",
                  guildWarCompleted,
                  guildWarExpected,
                  `GW 1: ${guildWarEntriesOne}/2 entradas, GW 2: ${guildWarEntriesTwo}/2 entradas`,
                )),
      ),
      createAssessment(
        "siege",
        "Batalha de Assalto",
        siegeAssigned,
        siegeCompleted,
        siegeExpected,
        siegeWouldPunish && !cooldownActive,
        cooldownReason ??
          (!siegeAssigned
            ? "Sem participação elegível registrada em siege no snapshot usado para avaliação."
            : siegeWouldPunish
              ? buildReason(
                  "Assalto obrigatório não concluído",
                  siegeCompleted,
                  siegeExpected,
                  `Siege 1: ${siegeOne}/30 ataques, Siege 2: ${siegeTwo}/30 ataques`,
                )
              : buildReason(
                  "Assalto concluído",
                  siegeCompleted,
                  siegeExpected,
                  `Siege 1: ${siegeOne}/30 ataques, Siege 2: ${siegeTwo}/30 ataques`,
                )),
      ),
      createAssessment(
        "labyrinth",
        "Labirinto",
        labyrinthRequired,
        labyrinthCompleted,
        labyrinthRequired ? 1 : 0,
        labyrinthWouldPunish && !cooldownActive,
        cooldownReason ??
          (!labyrinthRequired
            ? "Labirinto não esteve ativo nesta semana."
            : labyrinthCompleted > 0
              ? "Participação registrada no labirinto do ciclo."
              : "Sem participação registrada no labirinto ativo da semana."),
      ),
      createAssessment(
        "subjugation",
        "Subjugação",
        true,
        subjugationCompleted,
        1,
        subjugationWouldPunish && !cooldownActive,
        cooldownReason ??
          (subjugationCompleted > 0
            ? "Participação registrada na subjugação da semana."
            : "Sem participação registrada na subjugação obrigatória da semana."),
      ),
    ];
  }

  private buildDefenseSetupAssessments(
    member: GuildCurrentMemberStateDto,
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
  ): WeeklyPunishmentEventAssessmentDto[] {
    const guildWarAssigned = memberWasAssignedToGuildWar(member);
    const guildWarDefenseCount = member.guildWar.defenses.length;
    const guildWarWouldPunish =
      guildWarAssigned && guildWarDefenseCount < GUILD_WAR_REQUIRED_DEFENSES;

    const siegeAssigned = memberWasAssignedToSiege(member);
    const siegeDefenseCount = member.siege.defenses.length;
    const siegeWouldPunish = siegeAssigned && siegeDefenseCount < SIEGE_REQUIRED_DEFENSES;

    const cooldownReason = cooldownActive
      ? `Isento nesta semana por punição anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indisponível"}.`
      : undefined;

    return [
      createAssessment(
        "guildWarDefenseSetup",
        "Setup de defesa em GW",
        guildWarAssigned,
        guildWarDefenseCount,
        guildWarAssigned ? GUILD_WAR_REQUIRED_DEFENSES : 0,
        guildWarWouldPunish && !cooldownActive,
        cooldownReason ??
          (!guildWarAssigned
            ? "Sem escalação registrada em GW para exigir defesa nesta semana."
            : guildWarWouldPunish
              ? buildReason(
                  "GW sem todas as defesas obrigatórias",
                  guildWarDefenseCount,
                  GUILD_WAR_REQUIRED_DEFENSES,
                  "Mínimo exigido até segunda-feira 12:00 de Brasília",
                )
              : buildReason(
                  "GW com defesas completas",
                  guildWarDefenseCount,
                  GUILD_WAR_REQUIRED_DEFENSES,
                  "Mínimo exigido até segunda-feira 12:00 de Brasília",
                )),
      ),
      createAssessment(
        "siegeDefenseSetup",
        "Setup de defesa em Siege",
        siegeAssigned,
        siegeDefenseCount,
        siegeAssigned ? SIEGE_REQUIRED_DEFENSES : 0,
        siegeWouldPunish && !cooldownActive,
        cooldownReason ??
          (!siegeAssigned
            ? "Sem participação elegível registrada em siege para exigir defesa nesta semana."
            : siegeWouldPunish
              ? buildReason(
                  "Siege abaixo do mínimo de defesas",
                  siegeDefenseCount,
                  SIEGE_REQUIRED_DEFENSES,
                  "Mínimo exigido até segunda-feira 12:00 de Brasília",
                )
              : buildReason(
                  "Siege com defesas suficientes",
                  siegeDefenseCount,
                  SIEGE_REQUIRED_DEFENSES,
                  "Mínimo exigido até segunda-feira 12:00 de Brasília",
                )),
      ),
    ];
  }

  private buildDefenseComplianceAssessments(
    member: GuildCurrentMemberStateDto,
    phase: "warning" | "punishment",
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
  ): WeeklyPunishmentEventAssessmentDto[] {
    const cooldownReason = cooldownActive
      ? `Isento nesta semana por puniÃ§Ã£o anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indisponÃ­vel"}.`
      : undefined;

    const buildAssessmentForContext = (
      context: "guildWar" | "siege",
      eventKey: WeeklyPunishmentEventKey,
      label: string,
      defenses: GuildCurrentMemberStateDto["guildWar"]["defenses"],
    ) => {
      const totalDefenses = defenses.length;
      const flaggedDefenses = defenses.filter(
        (defense) => (defense.complianceAudit?.issuesCount ?? 0) > 0,
      );
      const issueFreeDefenses = Math.max(0, totalDefenses - flaggedDefenses.length);
      const warningDeadlineAt = flaggedDefenses[0]?.complianceAudit?.warningDeadlineAt;
      const details = flaggedDefenses
        .map(
          (defense) =>
            `${formatDefenseLocation(context, defense)}: ${defense.complianceAudit?.summary ?? "alerta de defesa"}`,
        )
        .join(" | ");
      const wouldPunish = phase === "punishment" && flaggedDefenses.length > 0;

      return createAssessment(
        eventKey,
        label,
        totalDefenses > 0,
        issueFreeDefenses,
        totalDefenses,
        wouldPunish && !cooldownActive,
        cooldownReason ??
          (totalDefenses === 0
            ? "Nenhuma defesa elegÃ­vel com alerta desse contexto foi encontrada no snapshot atual."
            : flaggedDefenses.length === 0
              ? buildReason("Defesas sem alerta", issueFreeDefenses, totalDefenses)
              : phase === "warning"
                ? `Aviso ativo atÃ© ${warningDeadlineAt ? formatBrazilDateTime(warningDeadlineAt) : "segunda-feira 12:00 de BrasÃ­lia"} para corrigir: ${details}`
                : `PendÃªncia mantida apÃ³s o prazo final: ${details}`),
      );
    };

    return [
      buildAssessmentForContext(
        "guildWar",
        "guildWarDefenseCompliance",
        "Alerta de composiÃ§Ã£o/equipamento em GW",
        member.guildWar.defenses,
      ),
      buildAssessmentForContext(
        "siege",
        "siegeDefenseCompliance",
        "Alerta de composiÃ§Ã£o/equipamento em Siege",
        member.siege.defenses,
      ),
    ];
  }
}

export const calculateWeightedWinRate = calculateWinRate;

export const isWeeklyParticipationWindow = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  if (weekday === "Sun") {
    return hour > 5 || (hour === 5 && minute >= 0);
  }

  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(weekday);
};

export const isDefenseSetupWindow = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  if (weekday === "Mon") {
    return hour > 12 || (hour === 12 && minute >= 0);
  }

  return ["Tue", "Wed", "Thu", "Fri", "Sat"].includes(weekday);
};

export const isDefenseComplianceWarningWindow = (now = new Date()) =>
  getDefenseCompliancePhase(now) === "warning";

export const isDefenseCompliancePunishmentWindow = (now = new Date()) =>
  getDefenseCompliancePhase(now) === "punishment";

export const getDefenseComplianceWarningSlotKey = (now = new Date()) => {
  if (!isDefenseComplianceWarningWindow(now)) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const bucket = Math.floor(hour / 2);

  return `${year}-${month}-${day}-bucket-${bucket}`;
};
