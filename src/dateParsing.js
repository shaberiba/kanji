import { DateTime } from 'luxon';
import { config } from './config.js';

const FORMATS = ['yyyy-MM-dd HH:mm', "yyyy-MM-dd'T'HH:mm"];

/**
 * Parses free-text date/time input against the configured default timezone
 * and returns an ISO-8601 string with offset, as required by the Graph API.
 * Accepts "2026-10-05 19:00", "2026-10-05T19:00", or a full ISO string.
 * Returns null if the input can't be parsed.
 */
export function parseLocalDateTime(input) {
  if (!input) return null;

  for (const format of FORMATS) {
    const parsed = DateTime.fromFormat(input.trim(), format, { zone: config.defaultTimezone });
    if (parsed.isValid) return parsed.toISO();
  }

  const isoParsed = DateTime.fromISO(input.trim(), { zone: config.defaultTimezone });
  if (isoParsed.isValid) return isoParsed.toISO();

  return null;
}
