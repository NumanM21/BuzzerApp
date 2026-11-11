export interface ClockTimeOptions {
  /** A BCP 47 tag; the phone's own language when left out. Tests pass one so the answer doesn't depend on the machine. */
  locale?: string;
  /** An IANA zone such as `UTC`; the phone's own when left out. */
  timeZone?: string;
}

/**
 * The hour and minute of a moment the server gave as an ISO string ("2030-01-01T20:05:00Z"), in the viewer's own
 * time, for lists like "who changed what, when". Something that isn't a date reads as an empty string rather than
 * "Invalid Date".
 */
export function formatClockTime(iso: string, { locale, timeZone }: ClockTimeOptions = {}): string {
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(moment);
}
