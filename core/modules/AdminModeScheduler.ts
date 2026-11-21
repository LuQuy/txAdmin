const modulename = 'AdminModeScheduler';
import consoleFactory from '@lib/console';
import type { UpdateConfigKeySet } from './ConfigStore/utils';
const console = consoleFactory(modulename);


type ScheduleConfig = {
    enabled: boolean;
    frequency: 'daily' | 'nextDay';
    time: string;
    date: string;
};

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

export const getScheduleMinuteFloorTs = (config: ScheduleConfig, now: Date) => {
    const [hours, minutes] = config.time.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return false;

    if (config.frequency === 'daily') {
        const thisMinuteTs = new Date(now).setSeconds(0, 0);
        const scheduledDate = new Date(now);
        let scheduledMinuteFloorTs = scheduledDate.setHours(hours, minutes, 0, 0);
        if (scheduledMinuteFloorTs < thisMinuteTs) {
            scheduledDate.setDate(scheduledDate.getDate() + 1);
            scheduledMinuteFloorTs = scheduledDate.getTime();
        }
        return scheduledMinuteFloorTs;
    }

    const dateParts = config.date.split('-').map(Number);
    if (dateParts.length !== 3 || dateParts.some(part => !Number.isInteger(part))) return false;
    const [year, month, day] = dateParts;
    const scheduledAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (
        scheduledAt.getFullYear() !== year
        || scheduledAt.getMonth() !== month - 1
        || scheduledAt.getDate() !== day
    ) {
        return false;
    }
    return scheduledAt.getTime();
};

export const getDueScheduleWarning = (
    config: ScheduleConfig,
    warningMinutes: number[],
    now: Date,
) => {
    if (!config.enabled) return false;
    const scheduledMinuteFloorTs = getScheduleMinuteFloorTs(config, now);
    if (scheduledMinuteFloorTs === false) return false;

    const thisMinuteTs = new Date(now).setSeconds(0, 0);
    const minutesRemaining = Math.floor((scheduledMinuteFloorTs - thisMinuteTs) / 60_000);
    if (!warningMinutes.includes(minutesRemaining)) return false;
    return { scheduledMinuteFloorTs, minutesRemaining };
};

export const shouldTriggerSchedule = (
    config: ScheduleConfig,
    now: Date,
    lastDailyTriggerDate: string | null,
) => {
    if (!config.enabled) return false;

    const scheduledMinuteFloorTs = getScheduleMinuteFloorTs(config, now);
    if (scheduledMinuteFloorTs === false) return false;

    if (config.frequency === 'daily') {
        const today = formatLocalDate(now);
        return lastDailyTriggerDate !== today
            && new Date(now).setSeconds(0, 0) === scheduledMinuteFloorTs;
    }

    return now.getTime() >= scheduledMinuteFloorTs;
};

export const shouldTriggerAdminMode = (
    config: Pick<
        TxConfigs['whitelist'],
        | 'scheduledAdminModeEnabled'
        | 'scheduledAdminModeFrequency'
        | 'scheduledAdminModeTime'
        | 'scheduledAdminModeDate'
    >,
    now: Date,
    lastDailyTriggerDate: string | null,
) => shouldTriggerSchedule({
    enabled: config.scheduledAdminModeEnabled,
    frequency: config.scheduledAdminModeFrequency,
    time: config.scheduledAdminModeTime,
    date: config.scheduledAdminModeDate,
}, now, lastDailyTriggerDate);

export const shouldTriggerKickAll = (
    config: Pick<
        TxConfigs['whitelist'],
        | 'scheduledKickAllEnabled'
        | 'scheduledKickAllFrequency'
        | 'scheduledKickAllTime'
        | 'scheduledKickAllDate'
    >,
    now: Date,
    lastDailyTriggerDate: string | null,
) => shouldTriggerSchedule({
    enabled: config.scheduledKickAllEnabled,
    frequency: config.scheduledKickAllFrequency,
    time: config.scheduledKickAllTime,
    date: config.scheduledKickAllDate,
}, now, lastDailyTriggerDate);


/** Handles the scheduled Admin-only switch and scheduled kick-all action. */
export default class AdminModeScheduler {
    static readonly configKeysWatched = [
        'whitelist.scheduledAdminModeEnabled',
        'whitelist.scheduledAdminModeFrequency',
        'whitelist.scheduledAdminModeTime',
        'whitelist.scheduledAdminModeDate',
        'whitelist.scheduledKickAllEnabled',
        'whitelist.scheduledKickAllFrequency',
        'whitelist.scheduledKickAllTime',
        'whitelist.scheduledKickAllDate',
        'whitelist.scheduledKickAllWarnings',
    ];

    private readonly checkInterval: ReturnType<typeof setInterval>;
    private lastDailyTriggerDate: string | null = null;
    private lastDailyKickAllTriggerDate: string | null = null;
    private kickAllWarningOccurrenceTs: number | false = false;
    private readonly sentKickAllWarnings = new Set<number>();

    constructor() {
        setImmediate(() => this.checkSchedule());
        this.checkInterval = setInterval(() => this.checkSchedule(), 30_000);
    }

    handleConfigUpdate(updatedConfigs: UpdateConfigKeySet) {
        if (updatedConfigs.hasMatch([
            'whitelist.scheduledAdminModeEnabled',
            'whitelist.scheduledAdminModeFrequency',
            'whitelist.scheduledAdminModeTime',
            'whitelist.scheduledAdminModeDate',
        ])) {
            this.lastDailyTriggerDate = null;
        }
        if (updatedConfigs.hasMatch([
            'whitelist.scheduledKickAllEnabled',
            'whitelist.scheduledKickAllFrequency',
            'whitelist.scheduledKickAllTime',
            'whitelist.scheduledKickAllDate',
            'whitelist.scheduledKickAllWarnings',
        ])) {
            this.lastDailyKickAllTriggerDate = null;
            this.kickAllWarningOccurrenceTs = false;
            this.sentKickAllWarnings.clear();
        }
        this.checkSchedule();
    }

    handleShutdown() {
        clearInterval(this.checkInterval);
    }

    checkSchedule(now = new Date()) {
        const schedule = txConfig.whitelist;
        this.checkKickAllWarning(now);
        if (shouldTriggerAdminMode(schedule, now, this.lastDailyTriggerDate)) {
            this.triggerAdminModeSchedule(now);
        }
        if (shouldTriggerKickAll(schedule, now, this.lastDailyKickAllTriggerDate)) {
            this.triggerKickAllSchedule(now);
        }
    }

    private checkKickAllWarning(now: Date) {
        const schedule = txConfig.whitelist;
        const dueWarning = getDueScheduleWarning({
            enabled: schedule.scheduledKickAllEnabled,
            frequency: schedule.scheduledKickAllFrequency,
            time: schedule.scheduledKickAllTime,
            date: schedule.scheduledKickAllDate,
        }, schedule.scheduledKickAllWarnings, now);

        if (!dueWarning) return;
        if (this.kickAllWarningOccurrenceTs !== dueWarning.scheduledMinuteFloorTs) {
            this.kickAllWarningOccurrenceTs = dueWarning.scheduledMinuteFloorTs;
            this.sentKickAllWarnings.clear();
        }
        if (this.sentKickAllWarnings.has(dueWarning.minutesRemaining)) return;
        this.sentKickAllWarnings.add(dueWarning.minutesRemaining);

        const message = schedule.scheduledKickAllWarningMessage
            .trim()
            .replaceAll('{minutes}', String(dueWarning.minutesRemaining));
        console.log(`Announcing scheduled kick-all warning for ${dueWarning.minutesRemaining} minutes remaining.`);
        const eventSent = txCore.fxRunner.sendEvent('announcement', {
            author: 'txAdmin',
            message,
        });
        if (!eventSent) {
            console.warn('Unable to send the scheduled kick-all warning because the server is not running.');
        }
    }

    private triggerAdminModeSchedule(now: Date) {
        const schedule = txConfig.whitelist;

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

    private triggerKickAllSchedule(now: Date) {
        const schedule = txConfig.whitelist;
        if (schedule.scheduledKickAllFrequency === 'daily') {
            this.lastDailyKickAllTriggerDate = formatLocalDate(now);
        }

        const isOneTime = schedule.scheduledKickAllFrequency === 'nextDay';
        const mustChangeMode = schedule.mode !== 'adminOnly';
        if (mustChangeMode || isOneTime) {
            txCore.configStore.saveConfigs({
                whitelist: {
                    mode: 'adminOnly',
                    ...(isOneTime ? {
                        scheduledKickAllEnabled: false,
                        scheduledKickAllDate: '',
                    } : {}),
                },
            }, 'SCHEDULER');
            txCore.webServer.webSocket.pushRefresh('status');
        }

        const kickMessage = schedule.scheduledKickAllMessage.trim();
        console.log(`Kicking all players from the ${isOneTime ? 'one-time' : 'daily'} schedule.`);
        txCore.logger.admin.write('SCHEDULER', `Kicking all players: ${kickMessage}`);
        const eventSent = txCore.fxRunner.sendEvent('playerKicked', {
            target: -1,
            author: 'SCHEDULER',
            reason: kickMessage,
            dropMessage: kickMessage,
        });
        if (!eventSent) {
            console.warn('Unable to send the scheduled kick-all event because the server is not running.');
        }
    }
}
