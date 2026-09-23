"""
Nimbus Risk Sentinel — Abstract Auto-Remediator Base
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple


class BaseRemediator(ABC):
    """Abstract base class for AWS cloud misconfiguration auto-remediators."""

    def __init__(self, resource_id: str, rule_id: str):
        self.resource_id = resource_id
        self.rule_id = rule_id

    @abstractmethod
    def dry_run(self) -> Dict[str, Any]:
        """
        Calculates exact before/after state diff and potential impacts
        without mutating any live cloud resources.
        """
        pass

    @abstractmethod
    def apply(self, actor: str = "secops-lead") -> Tuple[bool, str, Dict[str, Any]]:
        """
        Executes the cloud mutation safely, verifies post-state, and returns result.
        Returns: (success: bool, message: str, audit_entry: dict)
        """
        pass
