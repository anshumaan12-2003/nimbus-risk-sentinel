from datetime import datetime, timezone


def utcnow_naive() -> datetime:
    """Naive UTC "now" for the scan/finding/resource columns, which store naive UTC (datetime.utcnow is deprecated)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
