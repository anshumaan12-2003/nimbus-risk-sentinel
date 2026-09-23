"""
Topology & attack paths built from the latest scan's real inventory.
  GET /topology/graph               -> {nodes, edges}           (Topology page, Dashboard)
  GET /topology/environment         -> {layers, nodes, edges}   (Attack Simulator)
  GET /topology/blast-radius/{id}   -> reachability report
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import latest_completed_scan
from app.database import get_db
from app.intelligence.graph_builder import AttackGraph, build_attack_graph
from app.models.finding import Finding, FindingStatus
from app.models.inventory import InventorySnapshot

router = APIRouter(prefix="/topology", tags=["Graph & Blast Radius"])

_cache: dict[str, AttackGraph] = {}   # scan_id -> graph (inventory is immutable per scan)


def _graph(db: Session, pruned: bool = True) -> AttackGraph | None:
    scan = latest_completed_scan(db)
    if not scan:
        return None
    key = f"{scan.id}:{pruned}"
    if key not in _cache:
        snap = db.query(InventorySnapshot).filter(InventorySnapshot.scan_id == scan.id).first()
        if not snap:
            return None
        rows = (db.query(Finding).options(joinedload(Finding.resource))
                .filter(Finding.scan_id == scan.id, Finding.status != FindingStatus.RESOLVED).all())
        findings = [{"id": str(f.id), "rule_id": f.rule_id, "aws_resource_id": f.resource.resource_id} for f in rows]
        g = build_attack_graph(snap.data, findings)
        _cache.clear()
        _cache[key] = g.pruned() if pruned else g
    return _cache[key]


EMPTY = {"nodes": [], "edges": [], "message": "No completed scan with inventory yet — run a scan."}


@router.get("/graph")
def get_topology_graph(full: bool = Query(False), db: Session = Depends(get_db)):
    g = _graph(db, pruned=not full)
    return g.to_directed_graph().to_dict() if g else EMPTY


@router.get("/environment")
def get_environment(db: Session = Depends(get_db)):
    g = _graph(db)
    return g.to_environment() if g else {**EMPTY, "layers": ["Internet", "Edge", "Compute", "Identity", "Data"]}


@router.get("/blast-radius/{exposed_node_id:path}")
def get_blast_radius(exposed_node_id: str, db: Session = Depends(get_db)):
    g = _graph(db)
    if not g:
        return {"exposed_node_id": exposed_node_id, "blast_radius_score": 0, "severity": "LOW",
                "reachable_nodes_count": 0, "crown_jewels_at_risk": 0, "identities_compromised": 0,
                "reachable_assets": []}
    dg = g.to_directed_graph()
    if exposed_node_id not in dg.nodes:
        exposed_node_id = "internet"
    return dg.compute_blast_radius(exposed_node_id)
