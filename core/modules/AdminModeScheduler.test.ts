import { describe, expect, it } from 'vitest';
import { formatLocalDate, getNextDayDate, shouldTriggerAdminMode } from './AdminModeScheduler';

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
});
