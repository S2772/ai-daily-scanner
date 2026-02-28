# Reliability Checklist

- Verify every configured source has explicit success/failure logging.
- Do not report success when fetched item count is zero.
- Separate "fetched" from "saved" counts.
- Ensure "today" views query only today's generated analytics.
- Remove stale auto-generated records before recompute.
- Keep retry/backoff bounded to avoid long hangs.
