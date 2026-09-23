"""
Attack-graph builder: turns an inventory snapshot + the scan's findings into a directed
graph of *exploitable* relationships.

Edges (attacker perspective):
  internet -> EC2        instance has a public IP AND an attached SG open to 0.0.0.0/0
  internet -> RDS        PubliclyAccessible AND SG open to the world
  internet -> S3         bucket policy status IsPublic, or an S3-005 finding
  internet -> Lambda     function URL with AuthType NONE
  internet -> IAM user   user flagged IAM-002 (no MFA) -> credential phishing / key leak
  EC2      -> role       instance profile (IMDS credential theft; IMDSv1 makes it trivial)
  Lambda   -> role       execution role (code-injection -> role creds)
  principal-> data store identity policy allows data actions on that resource
  principal-> role       sts:AssumeRole allowed AND target trust policy trusts the source
  secret   -> RDS        RDS-managed secret tagged with the DB instance ARN

Simplifications (documented, deliberate for v1): Deny statements, conditions, SCPs,
permission boundaries and resource policies (other than S3 public status) are ignored,
so paths are an upper bound ("could reach"), which is the right bias for prioritisation.
"""
from __future__ import annotations

import fnmatch
import hashlib
from collections import deque
from typing import Any, Iterable

from app.config import settings
from app.intelligence.blast_radius import CloudNode, CloudNodeType, DirectedCloudGraph

LAYERS = ["Internet", "Edge", "Compute", "Identity", "Data"]

DATA_ACTIONS = {
    "s3": ["s3:getobject", "s3:listbucket", "s3:putobject", "s3:deleteobject"],
    "rds": ["rds-db:connect", "rds:modifydbinstance", "rds:createdbsnapshot", "rds:restoredbinstancefromdbsnapshot"],
    "dynamodb": ["dynamodb:getitem", "dynamodb:scan", "dynamodb:query", "dynamodb:putitem"],
    "secret": ["secretsmanager:getsecretvalue"],
}


# ─── Policy evaluation (Allow-only, no conditions) ─────────────────────────
def _as_list(v) -> list:
    return v if isinstance(v, list) else ([v] if v is not None else [])


def allows(statements: Iterable[dict], actions: list[str], resource_arns: list[str]) -> bool:
    for st in statements:
        if st.get("Effect") != "Allow":
            continue
        st_actions = [a.lower() for a in _as_list(st.get("Action"))]
        if not st_actions:
            continue
        if not any(fnmatch.fnmatchcase(a, pat) for a in actions for pat in st_actions):
            continue
        st_res = _as_list(st.get("Resource")) or ["*"]
        if any(fnmatch.fnmatchcase(r, pat) for r in resource_arns for pat in st_res):
            return True
    return False


def is_admin(statements: Iterable[dict]) -> bool:
    return any(
        st.get("Effect") == "Allow" and "*" in _as_list(st.get("Action")) and "*" in _as_list(st.get("Resource"))
        for st in statements
    )


def trusts(trust_statements: Iterable[dict], principal_arn: str, account_id: str | None) -> bool:
    for st in trust_statements:
        if st.get("Effect") != "Allow":
            continue
        aws = _as_list((st.get("Principal") or {}).get("AWS")) if isinstance(st.get("Principal"), dict) else []
        if st.get("Principal") == "*":
            return True
        for p in aws:
            if p in (principal_arn, "*") or (account_id and p in (account_id, f"arn:aws:iam::{account_id}:root")):
                return True
    return False


# ─── Graph assembly ────────────────────────────────────────────────────────
class AttackGraph:
    def __init__(self):
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, dict] = {}

    def node(self, nid: str, **attrs):
        if nid not in self.nodes:
            self.nodes[nid] = {"id": nid, **attrs}
        return nid

    def edge(self, src: str, dst: str, technique: str, finding_id: str | None = None, fixable: bool = True):
        eid = "e-" + hashlib.sha1(f"{src}|{dst}".encode()).hexdigest()[:10]
        if eid in self.edges:
            if finding_id and not self.edges[eid].get("findingId"):
                self.edges[eid]["findingId"] = finding_id
            return
        e = {"id": eid, "from": src, "to": dst, "technique": technique, "fixable": fixable}
        if finding_id:
            e["findingId"] = finding_id
        self.edges[eid] = e

    # BFS used for pruning to "interesting" nodes
    def _reach(self, start: str, reverse: bool = False) -> set[str]:
        adj: dict[str, list[str]] = {}
        for e in self.edges.values():
            a, b = (e["to"], e["from"]) if reverse else (e["from"], e["to"])
            adj.setdefault(a, []).append(b)
        seen, q = {start}, deque([start])
        while q:
            for n in adj.get(q.popleft(), []):
                if n not in seen:
                    seen.add(n)
                    q.append(n)
        return seen

    def pruned(self, max_per_layer: int = 10) -> "AttackGraph":
        """Keep nodes that sit on an attack path (reachable from internet, or able to reach a crown jewel)."""
        from_internet = self._reach("internet")
        to_crown: set[str] = set()
        for n in self.nodes.values():
            if n.get("crown"):
                to_crown |= self._reach(n["id"], reverse=True)
        keep = from_internet | to_crown | {"internet"}
        keep |= {n["id"] for n in self.nodes.values() if n.get("crown")}

        # cap per layer: prefer internet-reachable, then crowns, then the rest
        by_layer: dict[int, list[str]] = {}
        for nid in keep:
            by_layer.setdefault(self.nodes[nid]["layer"], []).append(nid)
        final: set[str] = set()
        for layer, ids in by_layer.items():
            ids.sort(key=lambda i: (i not in from_internet, not self.nodes[i].get("crown"), self.nodes[i]["short"]))
            final |= set(ids[:max_per_layer])

        g = AttackGraph()
        g.nodes = {k: v for k, v in self.nodes.items() if k in final}
        g.edges = {k: e for k, e in self.edges.items() if e["from"] in final and e["to"] in final}
        return g

    # Shape consumed by frontend/src/pages/AttackSimulator.jsx
    def to_environment(self) -> dict:
        return {"layers": LAYERS, "nodes": list(self.nodes.values()), "edges": list(self.edges.values())}

    # Shape consumed by Topology/Dashboard + blast-radius engine
    def to_directed_graph(self) -> DirectedCloudGraph:
        g = DirectedCloudGraph()
        type_for_layer = {0: CloudNodeType.ATTACKER, 1: CloudNodeType.PERIMETER, 2: CloudNodeType.COMPUTE,
                          3: CloudNodeType.IDENTITY, 4: CloudNodeType.CROWN_JEWEL}
        for n in self.nodes.values():
            node_type = CloudNodeType.CROWN_JEWEL if n.get("crown") else type_for_layer[n["layer"]]
            g.add_node(CloudNode(n["id"], n["short"], node_type, n["service"], n.get("arn", n["id"]),
                                 "CRITICAL" if n.get("crown") else ("HIGH" if n["layer"] == 3 else "LOW")))
        for e in self.edges.values():
            g.add_edge(e["from"], e["to"], e["technique"])
        return g


def _is_crown(name: str, tags: dict) -> bool:
    keys = {k.lower() for k in settings.crown_tag_keys}
    for k, v in (tags or {}).items():
        if k.lower() in keys and str(v).lower() not in ("public", "low", "none", "false"):
            return True
    lname = name.lower()
    return any(h in lname for h in settings.crown_name_hints)


def build_attack_graph(inv: dict, findings: list[dict]) -> AttackGraph:
    """
    inv:      InventorySnapshot.data
    findings: [{"id", "rule_id", "aws_resource_id"}] for the same scan
    """
    g = AttackGraph()
    acct = inv.get("account_id")
    fidx: dict[tuple[str, str], str] = {}
    for f in findings:
        fidx.setdefault((f["rule_id"], f["aws_resource_id"]), f["id"])

    def find(rules: list[str], rid: str) -> str | None:
        for r in rules:
            if (r, rid) in fidx:
                return fidx[(r, rid)]
        return None

    g.node("internet", layer=0, short="Public Internet", kind="Attacker", icon="globe", service="internet")

    # ── Identity layer ──
    roles_by_arn = {r["arn"]: r for r in inv["iam"]["roles"]}
    role_by_profile = {ip: r for r in inv["iam"]["roles"] for ip in r["instance_profiles"]}
    for r in inv["iam"]["roles"]:
        g.node(r["arn"], layer=3, short=r["name"], kind="IAM Role", icon="key", service="iam", arn=r["arn"])
    for u in inv["iam"]["users"]:
        g.node(u["arn"], layer=3, short=u["name"], kind="IAM User", icon="key", service="iam", arn=u["arn"])
    for s in inv["secrets"]:
        g.node(s["arn"], layer=3, short=s["name"], kind="Secrets Mgr", icon="lock", service="secretsmanager", arn=s["arn"])

    # ── Data layer (crown jewels) ──
    # S3-001 (PAB not fully on) is a *hardening gap*, not proof of exposure; only a public
    # policy (AWS-evaluated IsPublic, or our S3-005 rule) makes the bucket internet-reachable.
    public_buckets = {b["arn"] for b in inv["s3"] if b["public_policy"] or find(["S3-005"], b["arn"])}
    for b in inv["s3"]:
        public = b["arn"] in public_buckets
        g.node(b["arn"], layer=1 if public else 4, short=b["name"], kind="S3 Bucket", icon="bucket",
               service="s3", arn=b["arn"], crown=(not public) and _is_crown(b["name"], b["tags"]))
    for db in inv["rds"]:
        g.node(db["arn"], layer=4, short=db["id"], kind=f"RDS {db.get('engine') or ''}".strip(), icon="database",
               service="rds", arn=db["arn"], crown=True)
    for t in inv["dynamodb"]:
        g.node(t["arn"], layer=4, short=t["name"], kind="DynamoDB", icon="database", service="dynamodb",
               arn=t["arn"], crown=True)

    # ── Compute layer ──
    sgs = inv["security_groups"]
    for i in inv["ec2"]:
        g.node(i["id"], layer=2, short=i["name"], kind="EC2", icon="server", service="ec2", arn=i["id"])
        open_sgs = [sg for sg in i["sg_ids"] if sgs.get(sg, {}).get("open_ports")]
        if i.get("public_ip") and open_sgs:
            ports = sorted({p for sg in open_sgs for p in sgs[sg]["open_ports"]})
            fid = find(["EC2-001", "EC2-002"], open_sgs[0]) or find(["EC2-004"], i["id"])
            g.edge("internet", i["id"], f"Ports {', '.join(ports)} open to 0.0.0.0/0 on public IP", fid)
        role = role_by_profile.get(i.get("instance_profile_arn") or "")
        if role:
            tech = "IMDSv1 credential theft (no token required)" if i.get("imds_v1") else "Instance-profile credentials via IMDSv2 (needs RCE/SSRF)"
            g.edge(i["id"], role["arn"], tech, find(["EC2-005"], i["id"]))
    for fn in inv["lambda"]:
        g.node(fn["arn"], layer=2, short=fn["name"], kind="Lambda", icon="zap", service="lambda", arn=fn["arn"])
        if fn.get("public_url"):
            g.edge("internet", fn["arn"], "Function URL with AuthType NONE")
        if fn.get("role_arn") in roles_by_arn:
            g.edge(fn["arn"], fn["role_arn"], "Execution role credentials (code injection)")

    # ── Internet exposure of data/identity ──
    for b in public_buckets:
        g.edge("internet", b, "Public bucket (policy/ACL allows anonymous access)", find(["S3-005", "S3-001"], b))
    for db in inv["rds"]:
        open_sg = any(sgs.get(sg, {}).get("open_ports") for sg in db["sg_ids"])
        if db["public"] and open_sg:
            g.edge("internet", db["arn"], "Publicly accessible DB endpoint, SG open to world", find(["RDS-001"], db["arn"]))
    for u in inv["iam"]["users"]:
        fid = find(["IAM-002"], u["arn"])
        if fid:
            g.edge("internet", u["arn"], "No MFA — phished password or leaked access key is enough", fid)

    # ── Principal -> resource / role ──
    principals = [(r["arn"], r["statements"]) for r in inv["iam"]["roles"]] + \
                 [(u["arn"], u["statements"]) for u in inv["iam"]["users"]]
    for arn, stmts in principals:
        admin = is_admin(stmts)
        admin_fid = find(["IAM-003"], arn)
        for b in inv["s3"]:
            if admin or allows(stmts, DATA_ACTIONS["s3"], [b["arn"], b["arn"] + "/*"]):
                g.edge(arn, b["arn"], "AdministratorAccess" if admin else "s3 read/write on bucket", admin_fid if admin else None)
        for db in inv["rds"]:
            if admin or allows(stmts, DATA_ACTIONS["rds"], [db["arn"], "*"]):
                g.edge(arn, db["arn"], "AdministratorAccess" if admin else "rds connect / snapshot / modify", admin_fid if admin else None)
        for t in inv["dynamodb"]:
            if admin or allows(stmts, DATA_ACTIONS["dynamodb"], [t["arn"]]):
                g.edge(arn, t["arn"], "AdministratorAccess" if admin else "dynamodb read/write on table", admin_fid if admin else None)
        for s in inv["secrets"]:
            if admin or allows(stmts, DATA_ACTIONS["secret"], [s["arn"]]):
                g.edge(arn, s["arn"], "secretsmanager:GetSecretValue")
        for target in inv["iam"]["roles"]:
            if target["arn"] != arn and (admin or allows(stmts, ["sts:assumerole"], [target["arn"]])) \
                    and trusts(target["trust"], arn, acct):
                g.edge(arn, target["arn"], "sts:AssumeRole (role chaining)")

    # ── Secret -> DB it unlocks ──
    rds_arns = {db["arn"] for db in inv["rds"]}
    for s in inv["secrets"]:
        target = s["tags"].get("aws:rds:primaryDBInstanceArn")
        if target in rds_arns:
            g.edge(s["arn"], target, "Master credentials stored in secret")

    return g
