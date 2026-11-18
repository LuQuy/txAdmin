import { z } from "zod";
import { discordSnowflakeSchema, typeDefinedConfig } from "./utils";
import { SYM_FIXER_DEFAULT } from "@lib/symbols";
import consts from "@shared/consts";
import { regexHoursMinutes } from "@lib/misc";


const mode = typeDefinedConfig({
    name: 'Allowlist Mode',
    default: 'disabled',
    validator: z.enum(['disabled', 'adminOnly', 'approvedLicense', 'discordMember', 'discordRoles', 'external']),
    fixer: SYM_FIXER_DEFAULT,
});

const rejectionMessage = typeDefinedConfig({
    name: 'Allowlist Instructions',
    default: 'Please join http://discord.gg/example and request to be allowlisted.',
    validator: z.string(),
    fixer: SYM_FIXER_DEFAULT,
});

export const polishDiscordRolesArray = (input: string[]) => {
    const unique = [...new Set(input)];
    unique.sort((a, b) => Number(a) - Number(b));
    return unique;
}

const discordRoles = typeDefinedConfig({
    name: 'Allowlisted Discord Roles',
    default: [],
    validator: discordSnowflakeSchema.array().transform(polishDiscordRolesArray),
    fixer: (input: any) => {
        if (!Array.isArray(input)) return [];
        const valid = input.filter(item => consts.regexDiscordSnowflake.test(item));
        return polishDiscordRolesArray(valid);
    },
});

const scheduledAdminModeEnabled = typeDefinedConfig({
    name: 'Scheduled Admin-mode Enabled',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledAdminModeFrequency = typeDefinedConfig({
    name: 'Scheduled Admin-mode Frequency',
    default: 'daily',
    validator: z.enum(['daily', 'nextDay']),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledAdminModeTime = typeDefinedConfig({
    name: 'Scheduled Admin-mode Time',
    default: '17:45',
    validator: z.string().regex(regexHoursMinutes),
    fixer: SYM_FIXER_DEFAULT,
});

// Internal target date used to keep a one-time schedule stable across restarts.
const scheduledAdminModeDate = typeDefinedConfig({
    name: 'Scheduled Admin-mode Date',
    default: '',
    validator: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledKickAllEnabled = typeDefinedConfig({
    name: 'Scheduled Kick All Members Enabled',
    default: false,
    validator: z.boolean(),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledKickAllFrequency = typeDefinedConfig({
    name: 'Scheduled Kick All Members Frequency',
    default: 'daily',
    validator: z.enum(['daily', 'nextDay']),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledKickAllTime = typeDefinedConfig({
    name: 'Scheduled Kick All Members Time',
    default: '17:45',
    validator: z.string().regex(regexHoursMinutes),
    fixer: SYM_FIXER_DEFAULT,
});

// Internal target date used to keep a one-time schedule stable across restarts.
const scheduledKickAllDate = typeDefinedConfig({
    name: 'Scheduled Kick All Members Date',
    default: '',
    validator: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    fixer: SYM_FIXER_DEFAULT,
});

const scheduledKickAllMessage = typeDefinedConfig({
    name: 'Scheduled Kick All Members Message',
    default: 'The server is entering Admin-only maintenance mode.',
    validator: z.string().trim().min(1).max(512),
    fixer: SYM_FIXER_DEFAULT,
});


export default {
    mode,
    rejectionMessage,
    discordRoles,
    scheduledAdminModeEnabled,
    scheduledAdminModeFrequency,
    scheduledAdminModeTime,
    scheduledAdminModeDate,
    scheduledKickAllEnabled,
    scheduledKickAllFrequency,
    scheduledKickAllTime,
    scheduledKickAllDate,
    scheduledKickAllMessage,
} as const;
