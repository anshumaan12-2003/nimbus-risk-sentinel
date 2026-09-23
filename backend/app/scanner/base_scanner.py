from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
from app.models.finding import Severity


@dataclass
class ScanFinding:
    """Intermediate representation of a finding during scanning."""
    rule_id: str
    title: str
    description: str
    severity: Severity
    service: str
    resource_id: str
    resource_type: str
    resource_name: str
    region: Optional[str]
    recommendation: str
    remediation_cmd: Optional[str] = None
    tags: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)


class BaseScanner(ABC):
    """Abstract base class for all AWS resource scanners."""

    def __init__(self, region: str):
        self.region = region
        self.findings: list[ScanFinding] = []

    @abstractmethod
    def scan(self) -> list[ScanFinding]:
        """Run the scanner and return a list of findings."""
        pass

    def add_finding(self, finding: ScanFinding):
        self.findings.append(finding)
