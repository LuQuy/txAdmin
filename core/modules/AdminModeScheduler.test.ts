import { describe, expect, it, vi } from 'vitest';
import AdminModeScheduler, {
    formatLocalDate,
    getDueScheduleWarning,
    getNextDayDate,
    shouldTriggerAdminMode,
    shouldTriggerKickAll,
} from './AdminModeScheduler';

const config = {
    scheduledAdminModeEnabled: true,
    scheduledAdminModeFrequency: 'daily' as const,
    scheduledAdminModeTime: '17:45',
    scheduledAdminModeDate: '',
};

describe('AdminModeScheduler', () => {
    it('triggers a daily schedule only in the configured minute', () => {
        const now = new Date(2026, 10, 17, 17, 45, 30);
        expect(shouldTriggerAdminMode(config, now, null)).toBe(true);
        expect(shouldTriggerAdminMode(config, now, formatLocalDate(now))).toBe(false);
        expect(shouldTriggerAdminMode(config, new Date(2026, 10, 17, 17, 46), null)).toBe(false);
    });

    it('triggers an overdue one-time schedule after a restart', () => {
        const oneTime = {
            ...config,
            scheduledAdminModeFrequency: 'nextDay' as const,
            scheduledAdminModeDate: '2026-11-18',
        };
        expect(shouldTriggerAdminMode(oneTime, new Date(2026, 10, 18, 17, 44), null)).toBe(false);
        expect(shouldTriggerAdminMode(oneTime, new Date(2026, 10, 18, 17, 45), null)).toBe(true);
        expect(shouldTriggerAdminMode(oneTime, new Date(2026, 10, 19, 9, 0), null)).toBe(true);
    });

    it('calculates tomorrow using the server-local calendar', () => {
        expect(getNextDayDate(new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01');
    });

    it('uses the same schedule behavior for kick all', () => {
        const kickConfig = {
            scheduledKickAllEnabled: true,
            scheduledKickAllFrequency: 'daily' as const,
            scheduledKickAllTime: '17:45',
            scheduledKickAllDate: '',
        };
        expect(shouldTriggerKickAll(kickConfig, new Date(2026, 10, 18, 17, 45), null)).toBe(true);
        expect(shouldTriggerKickAll(kickConfig, new Date(2026, 10, 18, 17, 46), null)).toBe(false);
    });

    it('detects warning offsets for daily schedules, including across midnight', () => {
        const dailySchedule = {
            enabled: true,
            frequency: 'daily' as const,
            time: '17:45',
            date: '',
        };
        expect(getDueScheduleWarning(dailySchedule, [15, 5], new Date(2026, 10, 18, 17, 30, 20)))
            .toMatchObject({ minutesRemaining: 15 });
        expect(getDueScheduleWarning(dailySchedule, [15, 5], new Date(2026, 10, 18, 17, 40, 50)))
            .toMatchObject({ minutesRemaining: 5 });
        expect(getDueScheduleWarning(dailySchedule, [], new Date(2026, 10, 18, 17, 40, 50)))
            .toBe(false);

        const midnightSchedule = { ...dailySchedule, time: '00:05' };
        expect(getDueScheduleWarning(midnightSchedule, [15], new Date(2026, 10, 18, 23, 50, 10)))
            .toMatchObject({ minutesRemaining: 15 });

        const oneTimeSchedule = {
            ...dailySchedule,
            frequency: 'nextDay' as const,
            date: '2026-11-19',
        };
        expect(getDueScheduleWarning(oneTimeSchedule, [15], new Date(2026, 10, 19, 17, 30, 10)))
            .toMatchObject({ minutesRemaining: 15 });
    });

    it('announces each warning once with the remaining-minute placeholder replaced', () => {
        vi.useFakeTimers();
        const announcements: string[] = [];
        const previousTxConfig = (globalThis as any).txConfig;
        const previousTxCore = (globalThis as any).txCore;
        (globalThis as any).txConfig = {
            whitelist: {
                mode: 'disabled',
                scheduledAdminModeEnabled: false,
                scheduledAdminModeFrequency: 'daily',
                scheduledAdminModeTime: '17:45',
                scheduledAdminModeDate: '',
                scheduledKickAllEnabled: true,
                scheduledKickAllFrequency: 'daily',
                scheduledKickAllTime: '17:45',
                scheduledKickAllDate: '',
                scheduledKickAllMessage: 'Scheduled maintenance.',
                scheduledKickAllWarnings: [15, 5],
                scheduledKickAllWarningMessage: 'Maintenance starts in {minutes} minutes.',
            },
        };
        (globalThis as any).txCore = {
            fxRunner: {
                sendEvent: (event: string, data: any) => {
                    if (event === 'announcement') announcements.push(data.message);
                    return true;
                },
            },
        };

        const scheduler = new AdminModeScheduler();
        scheduler.checkSchedule(new Date(2026, 10, 18, 17, 30, 5));
        scheduler.checkSchedule(new Date(2026, 10, 18, 17, 30, 35));
        scheduler.checkSchedule(new Date(2026, 10, 18, 17, 40, 5));
        scheduler.handleShutdown();
        (globalThis as any).txConfig = previousTxConfig;
        (globalThis as any).txCore = previousTxCore;
        vi.useRealTimers();

        expect(announcements).toEqual([
            'Maintenance starts in 15 minutes.',
            'Maintenance starts in 5 minutes.',
        ]);
    });

    it('sets Admin-only mode before kicking everyone with the configured message', () => {
        vi.useFakeTimers();
        const operations: string[] = [];
        const previousTxConfig = (globalThis as any).txConfig;
        const previousTxCore = (globalThis as any).txCore;
        (globalThis as any).txConfig = {
            whitelist: {
                mode: 'disabled',
                scheduledAdminModeEnabled: false,
                scheduledAdminModeFrequency: 'daily',
                scheduledAdminModeTime: '17:45',
                scheduledAdminModeDate: '',
                scheduledKickAllEnabled: true,
                scheduledKickAllFrequency: 'nextDay',
                scheduledKickAllTime: '17:45',
                scheduledKickAllDate: '2026-11-18',
                scheduledKickAllMessage: 'Scheduled maintenance.',
                scheduledKickAllWarnings: [15, 5],
                scheduledKickAllWarningMessage: 'Maintenance starts in {minutes} minutes.',
            },
        };
        (globalThis as any).txCore = {
            configStore: {
                saveConfigs: (changes: any) => {
                    operations.push(`save:${changes.whitelist.mode}`);
                },
            },
            webServer: { webSocket: { pushRefresh: () => undefined } },
            logger: { admin: { write: () => undefined } },
            fxRunner: {
                sendEvent: (_event: string, data: any) => {
                    operations.push(`kick:${data.target}:${data.dropMessage}`);
                    return true;
                },
            },
        };

        const scheduler = new AdminModeScheduler();
        scheduler.checkSchedule(new Date(2026, 10, 18, 17, 45));
        scheduler.handleShutdown();
        (globalThis as any).txConfig = previousTxConfig;
        (globalThis as any).txCore = previousTxCore;
        vi.useRealTimers();

        expect(operations).toEqual([
            'save:adminOnly',
            'kick:-1:Scheduled maintenance.',
        ]);
    });
});
