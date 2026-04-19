import { randomUUID } from "node:crypto";

import type {
  GuildLeadershipReadRepository,
  GuildLeadershipRepository,
} from "./contracts";
import type {
  AttackBattleRecordDto,
  GuildCurrentMemberStateDto,
  GuildCurrentStateDto,
  LabyrinthCycleDto,
  LabyrinthCycleEntity,
  GuildWeeklyPunishmentDto,
  GuildWeeklyPunishmentEntity,
  WeeklyPunishmentEventAssessmentDto,
  WeeklyPunishmentEventKey,
} from "../domain/models";

const BRAZIL_TIMEZONE = "America/Sao_Paulo";
const PENALTY_COOLDOWN_DAYS = 7;
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

type UpsertCurrentLabyrinthCycleInput = {
  actualDurationDays?: number;
  requiredAttacksByDay?: number[];
  updatedBy?: string;
  entries: Array<{
    wizardId: number;
    memberName?: string;
    validAttacks: number;
  }>;
};

type MemberWeekEntryRules = {
  joinedAt?: string;
  joinedThisWeek: boolean;
  joinedWeekday?: number;
  exemptGuildWarAndSiege: boolean;
  subjugationRequired: boolean;
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

const differenceInUtcDays = (left: Date, right: Date) =>
  Math.floor((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000));

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

const buildLabyrinthCycleStartDate = (now: Date) => {
  const brazilToday = createUtcDate(getBrazilCalendarDate(now));
  const diffInDays = differenceInUtcDays(brazilToday, LABYRINTH_FIRST_START_UTC);
  const completedCycles = diffInDays >= 0 ? Math.floor(diffInDays / LABYRINTH_CYCLE_DAYS) : 0;

  return addUtcDays(LABYRINTH_FIRST_START_UTC, completedCycles * LABYRINTH_CYCLE_DAYS);
};

const listLabyrinthCycleStartsForWeek = (weekStart: Date, weekEnd: Date) => {
  const starts: Date[] = [];

  for (
    let cycleStart = new Date(LABYRINTH_FIRST_START_UTC.getTime());
    cycleStart <= addUtcDays(weekEnd, LABYRINTH_CYCLE_DAYS);
    cycleStart = addUtcDays(cycleStart, LABYRINTH_CYCLE_DAYS)
  ) {
    const cycleEnd = addUtcDays(cycleStart, LABYRINTH_ACTIVE_DAYS - 1);
    if (cycleStart <= weekEnd && cycleEnd >= weekStart) {
      starts.push(new Date(cycleStart.getTime()));
    }
  }

  return starts;
};

const buildDefaultRequiredAttacksByDay = (days: number) =>
  Array.from({ length: Math.max(0, days) }, () => 1);

const normalizeRequiredAttacksByDay = (input: number[] | undefined, days: number) => {
  const normalizedDays = Math.max(0, Math.trunc(days));
  const source = input ?? [];

  return Array.from({ length: normalizedDays }, (_, index) => {
    const value = source[index];
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  });
};

const memberDidSubjugation = (member: GuildCurrentMemberStateDto) =>
  Boolean(
    (member.subjugation.clearScore ?? 0) > 0 ||
      (member.subjugation.contributeRatio ?? 0) > 0,
  );

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
  cooldownActive: boolean,
  assessments: WeeklyPunishmentEventAssessmentDto[],
) => {
  const defenseViolationWhileSuspended = assessments.some(
    (assessment) =>
      (assessment.eventKey === "guildWarDefenseCompliance" ||
        assessment.eventKey === "siegeDefenseCompliance") &&
      assessment.required &&
      assessment.completed < assessment.expected,
  );

  if (cooldownActive && defenseViolationWhileSuspended) {
    return {
      markedForRemoval: true,
      removalReasonSummary:
        "Marcado para remo\u00e7\u00e3o: membro em cooldown manteve defesa irregular ap\u00f3s o prazo de corre\u00e7\u00e3o.",
    };
  }

  if (!cooldownActive || memberDidSubjugation(member)) {
    return {
      markedForRemoval: false,
      removalReasonSummary: undefined,
    };
  }

  return {
    markedForRemoval: true,
    removalReasonSummary:
      "Marcado para remo\u00e7\u00e3o: membro suspenso na semana anterior e sem participa\u00e7\u00e3o registrada na subjuga\u00e7\u00e3o desta semana.",
  };
};
const memberWasAssignedToSiege = (member: GuildCurrentMemberStateDto) =>
  member.siege.defenses.length > 0 || member.coverage.siegeAttacks || member.coverage.siegeDefenses;

const getMemberWeekEntryRules = (
  joinedAt: string | undefined,
  week: WeekRange,
): MemberWeekEntryRules => {
  if (!joinedAt) {
    return {
      joinedAt: undefined,
      joinedThisWeek: false,
      joinedWeekday: undefined,
      exemptGuildWarAndSiege: false,
      subjugationRequired: true,
    };
  }

  const joinedDate = createUtcDate(getBrazilCalendarDate(new Date(joinedAt)));
  const joinedThisWeek = joinedDate >= week.weekStart && joinedDate <= week.weekEnd;
  const joinedWeekday = joinedDate.getUTCDay();

  if (!joinedThisWeek) {
    return {
      joinedAt,
      joinedThisWeek: false,
      joinedWeekday,
      exemptGuildWarAndSiege: false,
      subjugationRequired: true,
    };
  }

  return {
    joinedAt,
    joinedThisWeek: true,
    joinedWeekday,
    exemptGuildWarAndSiege: joinedWeekday >= 1 && joinedWeekday <= 5,
    subjugationRequired: joinedWeekday <= 3,
  };
};

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
    const entities = await this.buildParticipationPunishmentEntities(
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

  async getCurrentLabyrinthCycle(now = new Date()): Promise<LabyrinthCycleDto> {
    const currentState = await this.repository.findLatestCurrentState();
    const cycleStartDate = formatBrazilDate(buildLabyrinthCycleStartDate(now));
    const existingCycle = await this.repository.findLabyrinthCycleByStartDate({
      guildId: currentState?.guildId,
      cycleStartDate,
    });

    return (
      existingCycle ?? {
        guildId: currentState?.guildId,
        guildName: currentState?.guildName,
        cycleStartDate,
        expectedDurationDays: LABYRINTH_ACTIVE_DAYS,
        requiredAttacksByDay: buildDefaultRequiredAttacksByDay(LABYRINTH_ACTIVE_DAYS),
        actualDurationDays: undefined,
        isConcluded: false,
        concludedAt: undefined,
        concludedBy: undefined,
        updatedAt: currentState?.updatedAt ?? now.toISOString(),
        updatedBy: undefined,
        entries: [],
      }
    );
  }

  async saveCurrentLabyrinthCycle(
    input: UpsertCurrentLabyrinthCycleInput,
    now = new Date(),
  ): Promise<LabyrinthCycleDto> {
    const currentState = await this.repository.findLatestCurrentState();
    const cycle = await this.getCurrentLabyrinthCycle(now);
    const memberNameByWizardId = new Map(
      (currentState?.members ?? []).map((member) => [member.wizardId, member.member.wizardName]),
    );

    const nextEntries = input.entries
      .map((entry) => ({
        wizardId: entry.wizardId,
        memberName:
          entry.memberName ??
          memberNameByWizardId.get(entry.wizardId) ??
          cycle.entries.find((savedEntry) => savedEntry.wizardId === entry.wizardId)?.memberName ??
          `Wizard ${entry.wizardId}`,
        validAttacks: Math.max(0, Math.trunc(entry.validAttacks)),
        updatedAt: now.toISOString(),
        updatedBy: input.updatedBy,
      }))
      .filter((entry) => entry.validAttacks > 0)
      .sort((left, right) => left.memberName.localeCompare(right.memberName, "pt-BR"));
    const actualDurationDays = Math.max(
      0,
      Math.trunc(input.actualDurationDays ?? cycle.actualDurationDays ?? cycle.expectedDurationDays),
    );
    const requiredAttacksByDay = normalizeRequiredAttacksByDay(
      input.requiredAttacksByDay ?? cycle.requiredAttacksByDay,
      actualDurationDays,
    );

    const entity: LabyrinthCycleEntity = {
      id: `${currentState?.guildId ?? cycle.guildId ?? "unknown"}:${cycle.cycleStartDate}`,
      createdAt: cycle.updatedAt,
      updatedAt: now.toISOString(),
      guildId: currentState?.guildId ?? cycle.guildId,
      guildName: currentState?.guildName ?? cycle.guildName,
      cycleStartDate: cycle.cycleStartDate,
      expectedDurationDays: LABYRINTH_ACTIVE_DAYS,
      requiredAttacksByDayJson: JSON.stringify(requiredAttacksByDay),
      actualDurationDays,
      isConcluded: cycle.isConcluded,
      concludedAt: cycle.concludedAt,
      concludedBy: cycle.concludedBy,
      updatedBy: input.updatedBy,
      entriesJson: JSON.stringify(nextEntries),
    };

    await this.repository.saveLabyrinthCycle(entity);

    return {
      guildId: entity.guildId,
      guildName: entity.guildName,
      cycleStartDate: entity.cycleStartDate,
      expectedDurationDays: entity.expectedDurationDays,
      requiredAttacksByDay,
      actualDurationDays: entity.actualDurationDays,
      isConcluded: entity.isConcluded,
      concludedAt: entity.concludedAt,
      concludedBy: entity.concludedBy,
      updatedAt: entity.updatedAt,
      updatedBy: entity.updatedBy,
      entries: nextEntries,
    };
  }

  async concludeCurrentLabyrinthCycle(
    input: UpsertCurrentLabyrinthCycleInput,
    now = new Date(),
  ): Promise<LabyrinthCycleDto> {
    const savedCycle = await this.saveCurrentLabyrinthCycle(input, now);

    const entity: LabyrinthCycleEntity = {
      id: `${savedCycle.guildId ?? "unknown"}:${savedCycle.cycleStartDate}`,
      createdAt: savedCycle.updatedAt,
      updatedAt: now.toISOString(),
      guildId: savedCycle.guildId,
      guildName: savedCycle.guildName,
      cycleStartDate: savedCycle.cycleStartDate,
      expectedDurationDays: savedCycle.expectedDurationDays,
      requiredAttacksByDayJson: JSON.stringify(savedCycle.requiredAttacksByDay),
      actualDurationDays: savedCycle.actualDurationDays,
      isConcluded: true,
      concludedAt: now.toISOString(),
      concludedBy: input.updatedBy,
      updatedBy: input.updatedBy,
      entriesJson: JSON.stringify(savedCycle.entries),
    };

    await this.repository.saveLabyrinthCycle(entity);

    return {
      ...savedCycle,
      isConcluded: true,
      concludedAt: entity.concludedAt,
      concludedBy: entity.concludedBy,
      updatedAt: entity.updatedAt,
      updatedBy: entity.updatedBy,
    };
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

  private async buildParticipationPunishmentEntities(
    currentState: GuildCurrentStateDto,
    week: WeekRange,
    evaluatedAt: string,
    recentPunishments: GuildWeeklyPunishmentDto[],
    existing: GuildWeeklyPunishmentDto[],
  ): Promise<GuildWeeklyPunishmentEntity[]> {
    return Promise.all(currentState.members.map(async (member) => {
      const existingPunishment = existing.find((entry) => entry.wizardId === member.wizardId);
      const { cooldownActive, nextEligiblePenaltyAt } = this.resolveCooldown(
        member,
        evaluatedAt,
        recentPunishments,
        existingPunishment,
      );

      const incomingAssessments = await this.buildParticipationAssessments(
        member,
        week,
        cooldownActive,
        nextEligiblePenaltyAt,
        member.member.joinedAt,
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
    }));
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
        week,
        member.member.joinedAt,
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
      cooldownActive,
      mergedAssessments,
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

  private async buildParticipationAssessments(
    member: GuildCurrentMemberStateDto,
    week: WeekRange,
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
    joinedAt?: string,
  ): Promise<WeeklyPunishmentEventAssessmentDto[]> {
    const entryRules = getMemberWeekEntryRules(joinedAt, week);
    const guildWarAssigned =
      !entryRules.exemptGuildWarAndSiege && memberWasAssignedToGuildWar(member);
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

    const siegeAssigned =
      !entryRules.exemptGuildWarAndSiege && memberWasAssignedToSiege(member);
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

    const subjugationCompleted = memberDidSubjugation(member) ? 1 : 0;
    const subjugationRequired = entryRules.subjugationRequired;
    const subjugationWouldPunish = subjugationRequired && subjugationCompleted < 1;

    const cooldownReason = cooldownActive
      ? `Isento nesta semana por puni\u00e7\u00e3o anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indispon\u00edvel"}.`
      : undefined;
    const labyrinthAssessment = await this.buildLabyrinthAssessmentForWeek(
      member,
      week,
      cooldownActive,
      nextEligiblePenaltyAt,
      joinedAt,
    );

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
            ? entryRules.exemptGuildWarAndSiege
              ? "Membro entrou entre segunda e sexta-feira; GW n\u00e3o entra na avalia\u00e7\u00e3o punitiva desta semana."
              : "Sem escala\u00e7\u00e3o registrada em GW no snapshot usado para avalia\u00e7\u00e3o."
            : guildWarWouldPunish
              ? buildReason(
                  "GW obrigat\u00f3ria n\u00e3o conclu\u00edda",
                  guildWarCompleted,
                  guildWarExpected,
                  `GW 1: ${guildWarEntriesOne}/2 entradas, GW 2: ${guildWarEntriesTwo}/2 entradas`,
                )
              : buildReason(
                  "GW conclu\u00edda",
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
            ? entryRules.exemptGuildWarAndSiege
              ? "Membro entrou entre segunda e sexta-feira; Siege n\u00e3o entra na avalia\u00e7\u00e3o punitiva desta semana."
              : "Sem participa\u00e7\u00e3o eleg\u00edvel registrada em siege no snapshot usado para avalia\u00e7\u00e3o."
            : siegeWouldPunish
              ? buildReason(
                  "Assalto obrigat\u00f3rio n\u00e3o conclu\u00eddo",
                  siegeCompleted,
                  siegeExpected,
                  `Siege 1: ${siegeOne}/30 ataques, Siege 2: ${siegeTwo}/30 ataques`,
                )
              : buildReason(
                  "Assalto conclu\u00eddo",
                  siegeCompleted,
                  siegeExpected,
                  `Siege 1: ${siegeOne}/30 ataques, Siege 2: ${siegeTwo}/30 ataques`,
                )),
      ),
      labyrinthAssessment,
      createAssessment(
        "subjugation",
        "Subjuga\u00e7\u00e3o",
        subjugationRequired,
        subjugationCompleted,
        subjugationRequired ? 1 : 0,
        subjugationWouldPunish && !cooldownActive,
        cooldownReason ??
          (!subjugationRequired
            ? "Membro entrou ap\u00f3s quarta-feira; subjuga\u00e7\u00e3o n\u00e3o entra na avalia\u00e7\u00e3o punitiva desta semana."
            : subjugationCompleted > 0
              ? "Participa\u00e7\u00e3o registrada na subjuga\u00e7\u00e3o da semana."
              : "Sem participa\u00e7\u00e3o registrada na subjuga\u00e7\u00e3o obrigat\u00f3ria da semana."),
      ),
    ];
  }
  private async buildLabyrinthAssessmentForWeek(
    member: GuildCurrentMemberStateDto,
    week: WeekRange,
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
    joinedAt?: string,
  ): Promise<WeeklyPunishmentEventAssessmentDto> {
    const entryRules = getMemberWeekEntryRules(joinedAt, week);
    const cooldownReason = cooldownActive
      ? `Isento nesta semana por punição anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indisponível"}.`
      : undefined;
    const cycleStarts = listLabyrinthCycleStartsForWeek(week.weekStart, week.weekEnd);

    if (cycleStarts.length === 0) {
      return createAssessment(
        "labyrinth",
        "Labirinto",
        false,
        0,
        0,
        false,
        cooldownReason ?? "Labirinto não esteve ativo nesta semana.",
      );
    }

    const cycleStartDate = formatBrazilDate(cycleStarts[0]);
    const cycle = await this.repository.findLabyrinthCycleByStartDate({
      guildId: member.guildId,
      cycleStartDate,
    });

    if (!cycle) {
      return createAssessment(
        "labyrinth",
        "Labirinto",
        false,
        0,
        0,
        false,
        cooldownReason ??
          `Labirinto do ciclo ${cycleStartDate} ainda não foi fechado pela liderança; sem punição automática.`,
      );
    }

    const actualDurationDays = Math.max(
      0,
      Math.trunc(cycle.actualDurationDays ?? cycle.expectedDurationDays),
    );
    const joinedDate = joinedAt
      ? createUtcDate(getBrazilCalendarDate(new Date(joinedAt)))
      : undefined;
    const cycleStart = createUtcDate(
      getBrazilCalendarDate(new Date(`${cycle.cycleStartDate}T00:00:00Z`)),
    );
    const exemptBecauseJoinedAfterCycleStart =
      entryRules.joinedThisWeek &&
      entryRules.exemptGuildWarAndSiege &&
      joinedDate !== undefined &&
      joinedDate > cycleStart;
    const requiredAttacksByDay = normalizeRequiredAttacksByDay(
      cycle.requiredAttacksByDay,
      actualDurationDays,
    );
    const validAttacks =
      cycle.entries.find((entry) => entry.wizardId === member.wizardId)?.validAttacks ?? 0;
    const minimumRequiredAttacks = requiredAttacksByDay.reduce((sum, value) => sum + value, 0);
    const required =
      cycle.isConcluded && minimumRequiredAttacks > 0 && !exemptBecauseJoinedAfterCycleStart;
    const wouldPunish = required && validAttacks < minimumRequiredAttacks;
    const details = `Ciclo ${cycle.cycleStartDate} • válidos ${validAttacks}/${minimumRequiredAttacks} • dias ${requiredAttacksByDay.join("/") || "0"}`;

    return createAssessment(
      "labyrinth",
      "Labirinto",
      required,
      validAttacks,
      required ? minimumRequiredAttacks : 0,
      wouldPunish && !cooldownActive,
      cooldownReason ??
        (!cycle.isConcluded
          ? `Labirinto do ciclo ${cycle.cycleStartDate} ainda está em edição pela liderança.`
          : wouldPunish
            ? buildReason("Labirinto abaixo do mínimo", validAttacks, minimumRequiredAttacks, details)
            : buildReason("Labirinto validado", validAttacks, minimumRequiredAttacks, details)),
    );
  }

  private buildDefenseSetupAssessments(
    member: GuildCurrentMemberStateDto,
    cooldownActive: boolean,
    nextEligiblePenaltyAt?: string,
    week?: WeekRange,
    joinedAt?: string,
  ): WeeklyPunishmentEventAssessmentDto[] {
    const entryRules = week
      ? getMemberWeekEntryRules(joinedAt, week)
      : { exemptGuildWarAndSiege: false };
    const guildWarAssigned =
      !entryRules.exemptGuildWarAndSiege && memberWasAssignedToGuildWar(member);
    const guildWarDefenseCount = member.guildWar.defenses.length;
    const guildWarWouldPunish =
      guildWarAssigned && guildWarDefenseCount < GUILD_WAR_REQUIRED_DEFENSES;

    const siegeAssigned =
      !entryRules.exemptGuildWarAndSiege && memberWasAssignedToSiege(member);
    const siegeDefenseCount = member.siege.defenses.length;
    const siegeWouldPunish = siegeAssigned && siegeDefenseCount < SIEGE_REQUIRED_DEFENSES;

    const cooldownReason = cooldownActive
      ? `Isento nesta semana por puni\u00e7\u00e3o anterior. Nova elegibilidade em ${nextEligiblePenaltyAt ? formatBrazilDateTime(nextEligiblePenaltyAt) : "data indispon\u00edvel"}.`
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
            ? entryRules.exemptGuildWarAndSiege
              ? "Membro entrou entre segunda e sexta-feira; setup de GW n\u00e3o entra na avalia\u00e7\u00e3o punitiva desta semana."
              : "Sem escala\u00e7\u00e3o registrada em GW para exigir defesa nesta semana."
            : guildWarWouldPunish
              ? buildReason(
                  "GW sem todas as defesas obrigat\u00f3rias",
                  guildWarDefenseCount,
                  GUILD_WAR_REQUIRED_DEFENSES,
                  "M\u00ednimo exigido at\u00e9 segunda-feira 12:00 de Bras\u00edlia",
                )
              : buildReason(
                  "GW com defesas completas",
                  guildWarDefenseCount,
                  GUILD_WAR_REQUIRED_DEFENSES,
                  "M\u00ednimo exigido at\u00e9 segunda-feira 12:00 de Bras\u00edlia",
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
            ? entryRules.exemptGuildWarAndSiege
              ? "Membro entrou entre segunda e sexta-feira; setup de Siege n\u00e3o entra na avalia\u00e7\u00e3o punitiva desta semana."
              : "Sem participa\u00e7\u00e3o eleg\u00edvel registrada em siege para exigir defesa nesta semana."
            : siegeWouldPunish
              ? buildReason(
                  "Siege abaixo do m\u00ednimo de defesas",
                  siegeDefenseCount,
                  SIEGE_REQUIRED_DEFENSES,
                  "M\u00ednimo exigido at\u00e9 segunda-feira 12:00 de Bras\u00edlia",
                )
              : buildReason(
                  "Siege com defesas suficientes",
                  siegeDefenseCount,
                  SIEGE_REQUIRED_DEFENSES,
                  "M\u00ednimo exigido at\u00e9 segunda-feira 12:00 de Bras\u00edlia",
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
