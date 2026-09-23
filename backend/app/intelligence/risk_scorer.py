from app.models.finding import Severity


# Risk weights per severity
SEVERITY_WEIGHTS = {
    Severity.CRITICAL: 40,
    Severity.HIGH: 20,
    Severity.MEDIUM: 10,
    Severity.LOW: 3,
    Severity.INFO: 1,
}

# Business context multipliers based on resource name keywords
SENSITIVE_KEYWORDS = [
    "prod", "production", "live", "payment", "billing", "customer",
    "pii", "phi", "hipaa", "patient", "credit", "card", "ssn",
    "passport", "secret", "private", "sensitive", "finance", "hr",
    "salary", "payroll", "audit", "compliance", "legal",
]

LOW_RISK_KEYWORDS = [
    "dev", "development", "staging", "test", "testing", "sandbox",
    "demo", "sample", "example", "temp", "tmp", "local",
]

MAX_SCORE = 100


def compute_risk_score(findings: list) -> int:
    """
    Compute an overall risk score (0–100) for the entire account.
    
    Algorithm:
    1. Sum up weighted finding scores
    2. Apply business context multiplier
    3. Normalize to 0–100
    """
    if not findings:
        return 0

    raw_score = 0
    for finding in findings:
        base = SEVERITY_WEIGHTS.get(finding.severity, 0)
        multiplier = _get_business_multiplier(finding.resource_name or "")
        raw_score += base * multiplier

    # Normalize: a single CRITICAL finding = 40 * 1.5 = 60 → normalized
    # Use logarithmic normalization to prevent linear overflow
    import math
    normalized = min(100, int(100 * (1 - math.exp(-raw_score / 150))))
    return normalized


def compute_finding_risk_score(
    severity: Severity,
    resource_name: str = "",
    resource_type: str = "",
) -> int:
    """
    Compute individual finding risk score (0–100).
    Incorporates business context from resource name.
    """
    base = SEVERITY_WEIGHTS.get(severity, 0)
    multiplier = _get_business_multiplier(resource_name)
    raw = base * multiplier

    # Map to 0-100 scale
    score_map = {
        Severity.CRITICAL: 85,
        Severity.HIGH: 65,
        Severity.MEDIUM: 40,
        Severity.LOW: 20,
        Severity.INFO: 5,
    }
    base_score = score_map.get(severity, 10)

    # Adjust based on business context
    if multiplier > 1.0:
        adjusted = min(100, int(base_score * multiplier))
    elif multiplier < 1.0:
        adjusted = int(base_score * multiplier)
    else:
        adjusted = base_score

    return adjusted


def _get_business_multiplier(resource_name: str) -> float:
    """
    Returns a multiplier based on resource name sensitivity.
    - Production/sensitive resources: 1.5x
    - Dev/test resources: 0.6x
    - Unknown: 1.0x
    """
    name_lower = resource_name.lower()

    for keyword in SENSITIVE_KEYWORDS:
        if keyword in name_lower:
            return 1.5

    for keyword in LOW_RISK_KEYWORDS:
        if keyword in name_lower:
            return 0.6

    return 1.0
