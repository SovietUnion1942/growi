import nodeCron from 'node-cron';

import loggerFactory from '~/utils/logger';

import {
  sendAttendanceReminders,
  sendMonthlyVotingReminders,
} from './attendance-reminder';

const logger = loggerFactory('growi:service:attendance-reminder-cron');

export class AttendanceReminderCronService {
  cronJob: nodeCron.ScheduledTask | undefined;

  // 既定: 毎日 08:00 JST (== 23:00 UTC)
  attendanceReminderCronExpression =
    process.env.ATTENDANCE_REMINDER_CRON_EXPRESSION ?? '0 23 * * *';

  startCron(): void {
    this.cronJob?.stop();
    this.cronJob = nodeCron.schedule(
      this.attendanceReminderCronExpression,
      async () => {
        try {
          const result = await sendAttendanceReminders();
          logger.info(
            `Attendance reminder job done: ${result.eventCount} upcoming event(s), ${result.remindedUserCount} user(s) reminded`,
          );
        } catch (e) {
          logger.error('Attendance reminder job failed:', e);
        }
      },
    );
    this.cronJob.start();
    logger.info(
      `Attendance reminder cron started (schedule: ${this.attendanceReminderCronExpression})`,
    );
  }

  stopCron(): void {
    this.cronJob?.stop();
    this.cronJob = undefined;
  }
}

export class MonthlyVotingReminderCronService {
  cronJob: nodeCron.ScheduledTask | undefined;

  // 既定: 毎週月曜 08:00 JST (== 日曜 23:00 UTC)
  monthlyVotingReminderCronExpression =
    process.env.ATTENDANCE_VOTING_REMINDER_CRON_EXPRESSION ?? '0 23 * * 0';

  startCron(): void {
    this.cronJob?.stop();
    this.cronJob = nodeCron.schedule(
      this.monthlyVotingReminderCronExpression,
      async () => {
        try {
          const result = await sendMonthlyVotingReminders();
          logger.info(
            `Monthly voting reminder job done: ${result.remindedUserCount} user(s) reminded`,
          );
        } catch (e) {
          logger.error('Monthly voting reminder job failed:', e);
        }
      },
    );
    this.cronJob.start();
    logger.info(
      `Monthly voting reminder cron started (schedule: ${this.monthlyVotingReminderCronExpression})`,
    );
  }

  stopCron(): void {
    this.cronJob?.stop();
    this.cronJob = undefined;
  }
}

export const startCron = (): void => {
  new AttendanceReminderCronService().startCron();
  new MonthlyVotingReminderCronService().startCron();
};
