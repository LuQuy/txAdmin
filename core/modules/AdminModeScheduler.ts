const modulename = 'AdminModeScheduler';
import consoleFactory from '@lib/console';
import type { UpdateConfigKeySet } from './ConfigStore/utils';
const console = consoleFactory(modulename);


type ScheduleConfig = Pick<
    TxConfigs['whitelist'],
    | 'scheduledAdminModeEnabled'
    | 'scheduledAdminModeFrequency'
    | 'scheduledAdminModeTime'
    | 'scheduledAdminModeDate'
>;

export const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getNextDayDate = (date = new Date()) => {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatLocalDate(tomorrow);
};

export const shouldTriggerAdminMode = (
    config: ScheduleConfig,
    now: Date,
    lastDailyTriggerDate: string | null,
) => {
    if (!config.scheduledAdminModeEnabled) return false;

    const [hours, minutes] = config.scheduledAdminModeTime.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return false;

    if (config.scheduledAdminModeFrequency === 'daily') {
        const today = formatLocalDate(now);
        return lastDailyTriggerDate !== today
            && now.getHours() === hours
            && now.getMinutes() === minutes;
    }

    const dateParts = config.scheduledAdminModeDate.split('-').map(Number);
    if (dateParts.length !== 3 || dateParts.some(part => !Number.isInteger(part))) return false;
    const [year, month, day] = dateParts;
    const scheduledAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return scheduledAt.getFullYear() === year
        && scheduledAt.getMonth() === month - 1
        && scheduledAt.getDate() === day
        && now.getTime() >= scheduledAt.getTime();
};


/** Switches the existing allowlist mode to Admin-only on a configured schedule. */
export default class AdminModeScheduler {
    static readonly configKeysWatched = [
        'whitelist.scheduledAdminModeEnabled',
        'whitelist.scheduledAdminModeFrequency',
        'whitelist.scheduledAdminModeTime',
        'whitelist.scheduledAdminModeDate',
    ];

    private readonly checkInterval: ReturnType<typeof setInterval>;
    private lastDailyTriggerDate: string | null = null;

    constructor() {
        setImmediate(() => this.checkSchedule());
        this.checkInterval = setInterval(() => this.checkSchedule(), 30_000);
    }

    handleConfigUpdate(_updatedConfigs: UpdateConfigKeySet) {
        this.lastDailyTriggerDate = null;
        this.checkSchedule();
    }

    handleShutdown() {
        clearInterval(this.checkInterval);
    }

    checkSchedule(now = new Date()) {
        const schedule = txConfig.whitelist;
        if (!shouldTriggerAdminMode(schedule, now, this.lastDailyTriggerDate)) return;

        if (schedule.scheduledAdminModeFrequency === 'daily') {
            this.lastDailyTriggerDate = formatLocalDate(now);
        }

        const isOneTime = schedule.scheduledAdminModeFrequency === 'nextDay';
        if (txConfig.whitelist.mode === 'adminOnly' && !isOneTime) return;

        console.log(`Activating Admin-only allowlist mode from the ${isOneTime ? 'one-time' : 'daily'} schedule.`);
        txCore.configStore.saveConfigs({
            whitelist: {
                mode: 'adminOnly',
                ...(isOneTime ? {
                    scheduledAdminModeEnabled: false,
                    scheduledAdminModeDate: '',
                } : {}),
            },
        }, 'SCHEDULER');
        txCore.webServer.webSocket.pushRefresh('status');
    }
}
