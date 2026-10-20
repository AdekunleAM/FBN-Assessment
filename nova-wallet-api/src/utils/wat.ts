const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

/**
 * Returns the current calendar date in West Africa Time (UTC+1) as
 * "YYYY-MM-DD", independent of the host server's own timezone/clock offset.
 */
export function watDateString(date: Date = new Date()): string {
  const watMs = date.getTime() + WAT_OFFSET_MS;
  const wat = new Date(watMs);
  const year = wat.getUTCFullYear();
  const month = String(wat.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wat.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
