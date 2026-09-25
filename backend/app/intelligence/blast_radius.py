"""
Breachpath Cloud Recon — Blast Radius & Attack Graph Traversal Engine
Builds directed dependency graphs (V, E) across cloud infrastructure to compute
multi-hop exploit chains and blast radius reachability to crown jewel data assets.
"""

from typing import Dict, List, Set, Any, Optional
from collections import deque


class CloudNodeType:
    ATTACKER = "attacker"
    PERIMETER = "perimeter"
    COMPUTE = "compute"
    IDENTITY = "identity"
    CROWN_JEWEL = "crown_jewel"


class CloudNode:
    def __init__(self, node_id: str, label: str, node_type: str, service: str, resource_id: str, data_sensitivity: str = "LOW"):
        self.node_id = node_id
        self.label = label
        self.node_type = node_type
        self.service = service
        self.resource_id = resource_id
        self.data_sensitivity = data_sensitivity  # "CRITICAL", "HIGH", "MEDIUM", "LOW"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.node_id,
            "label": self.label,
            "name": f"{self.service.upper()}: {self.label}",
            "threat_level": self.data_sensitivity,
            "type": self.node_type,
            "service": self.service,
            "resource_id": self.resource_id,
            "data_sensitivity": self.data_sensitivity,
        }


class DirectedCloudGraph:
    """Directed graph representation of cloud assets and permission/network relationships."""

    def __init__(self):
        self.nodes: Dict[str, CloudNode] = {}
        self.adjacency: Dict[str, List[Dict[str, Any]]] = {}

    def add_node(self, node: CloudNode):
        self.nodes[node.node_id] = node
        if node.node_id not in self.adjacency:
            self.adjacency[node.node_id] = []

    def add_edge(self, from_id: str, to_id: str, relation: str, risk_hop: int = 1):
        if from_id in self.nodes and to_id in self.nodes:
            self.adjacency[from_id].append({
                "target": to_id,
                "relation": relation,
                "risk_hop": risk_hop,
            })

    def bfs_reachable(self, start_node_id: str) -> List[Dict[str, Any]]:
        """Traverses graph from start_node to find all reachable downstream nodes."""
        if start_node_id not in self.nodes:
            return []

        # mark on enqueue (not on pop) so each node is reported once, at its shortest hop
        visited = {start_node_id}
        queue = deque([(start_node_id, 0, [start_node_id])])
        reachable = []

        while queue:
            current_id, depth, path = queue.popleft()

            if current_id != start_node_id:
                reachable.append({
                    "node": self.nodes[current_id].to_dict(),
                    "hop_distance": depth,
                    "attack_path": path,
                })

            for edge in self.adjacency.get(current_id, []):
                target = edge["target"]
                if target not in visited:
                    visited.add(target)
                    queue.append((target, depth + 1, path + [target]))

        return reachable

    def compute_blast_radius(self, exposed_node_id: str) -> Dict[str, Any]:
        """
        Calculates numerical blast radius score (0-100) based on reachable
        crown jewels and asset sensitivities.
        """
        reachable_entries = self.bfs_reachable(exposed_node_id)
        
        base_score = 30
        crown_jewels_hit = 0
        identities_compromised = 0

        for entry in reachable_entries:
            node = entry["node"]
            if node["type"] == CloudNodeType.CROWN_JEWEL:
                crown_jewels_hit += 1
                base_score += 35
            elif node["type"] == CloudNodeType.IDENTITY:
                identities_compromised += 1
                base_score += 15
            elif node["data_sensitivity"] == "HIGH":
                base_score += 10

        composite_score = min(100, base_score)
        severity = "CRITICAL" if composite_score >= 80 else "HIGH" if composite_score >= 60 else "MEDIUM"

        return {
            "exposed_node_id": exposed_node_id,
            "blast_radius_score": composite_score,
            "severity": severity,
            "reachable_nodes_count": len(reachable_entries),
            "crown_jewels_at_risk": crown_jewels_hit,
            "identities_compromised": identities_compromised,
            "reachable_assets": reachable_entries,
        }

    def to_dict(self) -> Dict[str, Any]:
        edges = []
        for from_id, targets in self.adjacency.items():
            for t in targets:
                edges.append({
                    "from": from_id,
                    "to": t["target"],
                    "relation": t["relation"],
                })

        return {
            "nodes": [n.to_dict() for n in self.nodes.values()],
            "edges": edges,
        }


def build_default_enterprise_graph() -> DirectedCloudGraph:
    """Instantiates sample enterprise multi-cloud topology."""
    g = DirectedCloudGraph()

    # Nodes
    attacker = CloudNode("node-internet", "Adversary (Public Internet)", CloudNodeType.ATTACKER, "external", "0.0.0.0/0")
    s3_bucket = CloudNode("node-s3", "S3: customer-finance-records", CloudNodeType.PERIMETER, "s3", "arn:aws:s3:::customer-finance-records-2026", "CRITICAL")
    ec2_bastion = CloudNode("node-ec2", "EC2: api-worker-node-03", CloudNodeType.COMPUTE, "ec2", "i-08249bf57a0129c", "HIGH")
    iam_role = CloudNode("node-iam", "IAM: DataOpsPipelineEngine", CloudNodeType.IDENTITY, "iam", "arn:aws:iam::982344120914:role/DataOpsPipelineEngine", "HIGH")
    rds_aurora = CloudNode("node-rds", "RDS: prod-financial-aurora", CloudNodeType.CROWN_JEWEL, "rds", "arn:aws:rds:us-east-1:982344120914:db:prod-financial-aurora", "CRITICAL")

    for node in [attacker, s3_bucket, ec2_bastion, iam_role, rds_aurora]:
        g.add_node(node)

    # Directed Exploit Edges
    g.add_edge("node-internet", "node-s3", "Anonymous Public Bucket Enumeration")
    g.add_edge("node-s3", "node-ec2", "Stolen Pipeline Configuration")
    g.add_edge("node-ec2", "node-iam", "IMDSv1 Instance Profile Credential Theft")
    g.add_edge("node-iam", "node-rds", "Direct Crown Jewel Database Exfiltration")

    return g
