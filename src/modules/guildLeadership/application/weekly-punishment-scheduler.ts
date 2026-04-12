import type { FastifyBaseLogger } from "fastify";

import {
  WeeklyPunishmentService,
  getDefenseComplianceWarningSlotKey,
  isDefenseCompliancePunishmentWindow,
  isDefenseSetupWindow,
  isWeeklyParticipationWindow,
} from "./weekly-punishment-service";

export class WeeklyPunishmentScheduler {
  private timer: NodeJS.Timeout | null = null;

  private lastWeeklyParticipationWeekKey: string | null = null;

  private lastDefenseSetupWeekKey: string | null = null;

  private lastDefenseComplianceWarningSlotKey: string | null = null;

  private lastDefenseCompliancePunishmentWeekKey: string | null = null;

  constructor(
    private readonly service: WeeklyPunishmentService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);

    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (isWeeklyParticipationWindow()) {
      try {
        const result = await this.service.runForPreviousCompletedWeek();

        if (this.lastWeeklyParticipationWeekKey !== result.weekKey) {
          this.lastWeeklyParticipationWeekKey = result.weekKey;
          this.logger.info(
            {
              evaluationKind: result.evaluationKind,
              weekKey: result.weekKey,
              evaluatedAt: result.evaluatedAt,
              saved: result.saved,
              skipped: result.skipped,
              reason: result.reason,
            },
            "Weekly punishment evaluation processed",
          );
        }
      } catch (error) {
        this.logger.error({ err: error }, "Weekly punishment evaluation failed");
      }
    }

    if (isDefenseSetupWindow()) {
      try {
        const result = await this.service.runCurrentWeekDefenseSetupEvaluation();

        if (this.lastDefenseSetupWeekKey !== result.weekKey) {
          this.lastDefenseSetupWeekKey = result.weekKey;
          this.logger.info(
            {
              evaluationKind: result.evaluationKind,
              weekKey: result.weekKey,
              evaluatedAt: result.evaluatedAt,
              saved: result.saved,
              skipped: result.skipped,
              reason: result.reason,
            },
            "Defense setup punishment evaluation processed",
          );
        }
      } catch (error) {
        this.logger.error({ err: error }, "Defense setup punishment evaluation failed");
      }
    }

    const warningSlotKey = getDefenseComplianceWarningSlotKey();
    if (warningSlotKey && this.lastDefenseComplianceWarningSlotKey !== warningSlotKey) {
      try {
        const result = await this.service.runDefenseComplianceEvaluation();
        this.lastDefenseComplianceWarningSlotKey = warningSlotKey;
        this.logger.info(
          {
            evaluationKind: result.evaluationKind,
            weekKey: result.weekKey,
            evaluatedAt: result.evaluatedAt,
            saved: result.saved,
            skipped: result.skipped,
            reason: result.reason,
            slotKey: warningSlotKey,
          },
          "Defense compliance warning evaluation processed",
        );
      } catch (error) {
        this.logger.error({ err: error }, "Defense compliance warning evaluation failed");
      }
    }

    if (isDefenseCompliancePunishmentWindow()) {
      try {
        const result = await this.service.runDefenseComplianceEvaluation();

        if (this.lastDefenseCompliancePunishmentWeekKey !== result.weekKey) {
          this.lastDefenseCompliancePunishmentWeekKey = result.weekKey;
          this.logger.info(
            {
              evaluationKind: result.evaluationKind,
              weekKey: result.weekKey,
              evaluatedAt: result.evaluatedAt,
              saved: result.saved,
              skipped: result.skipped,
              reason: result.reason,
            },
            "Defense compliance punishment evaluation processed",
          );
        }
      } catch (error) {
        this.logger.error({ err: error }, "Defense compliance punishment evaluation failed");
      }
    }
  }
}
