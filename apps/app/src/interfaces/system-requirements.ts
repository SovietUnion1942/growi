/**
 * OS keys for the system-requirements notice. The per-OS min / recommended
 * text lives in i18n (`system_requirements.os.<key>.{min,rec}`) so it stays
 * translatable; this module just enumerates the keys and maps a parsed UA OS
 * to one of them.
 *
 * Source figures: project_system-requirements-ui memory.
 */
export const SYSREQ_OS_KEYS = [
  'windows',
  'macos',
  'linux',
  'android',
  'ios',
] as const;
export type SysreqOsKey = (typeof SYSREQ_OS_KEYS)[number];

export const isSysreqOsKey = (v: string): v is SysreqOsKey =>
  (SYSREQ_OS_KEYS as readonly string[]).includes(v);
