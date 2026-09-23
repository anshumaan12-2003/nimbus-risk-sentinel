#!/usr/bin/env python3
import argparse
import sys
import os
import json
from rich.console import Console
from rich.table import Table

# Add backend to path so we can import the scanner directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))
from app.scanner.iac.terraform_scanner import TerraformScanner

console = Console()

def scan_iac(directory: str):
    if not os.path.isdir(directory):
        console.print(f"[bold red]Error:[/bold red] Directory '{directory}' does not exist.")
        sys.exit(1)

    console.print(f"[bold cyan]🌩️  Nimbus Sentinel CLI[/bold cyan] — Scanning Terraform in [bold]{directory}[/bold]...")
    
    scanner = TerraformScanner()
    results = scanner.scan_directory(directory)
    
    if not results.get("findings"):
        console.print("[bold green]✅ No security misconfigurations found![/bold green]")
        sys.exit(0)

    # Print summary table
    table = Table(title="Security Findings Summary")
    table.add_column("Severity", justify="left")
    table.add_column("Rule ID", style="cyan")
    table.add_column("Resource", style="magenta")
    table.add_column("Description")

    for f in results.get("findings", []):
        sev = f.get("severity", "INFO")
        sev_color = {
            "CRITICAL": "red",
            "HIGH": "orange3",
            "MEDIUM": "yellow",
            "LOW": "green"
        }.get(sev, "white")
        
        table.add_row(
            f"[{sev_color}]{sev}[/{sev_color}]",
            f.get("rule_id", ""),
            f.get("resource_name", ""),
            f.get("title", "")
        )

    console.print(table)
    
    # Check for Criticals
    criticals = results.get("severity_summary", {}).get("CRITICAL", 0)
    if criticals > 0:
        console.print(f"\n[bold red]❌ Scan Failed:[/bold red] {criticals} CRITICAL vulnerability(s) found. Please fix before deploying.")
        sys.exit(1)
    else:
        console.print("\n[bold green]✅ Scan Passed:[/bold green] No CRITICAL vulnerabilities found.")
        sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Nimbus Risk Sentinel CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Command: scan
    scan_parser = subparsers.add_parser("scan", help="Scan infrastructure")
    scan_subparsers = scan_parser.add_subparsers(dest="target", help="Scan target")

    # Command: scan iac
    iac_parser = scan_subparsers.add_parser("iac", help="Scan local Terraform directory")
    iac_parser.add_argument("directory", type=str, help="Path to the Terraform directory")

    args = parser.parse_args()

    if args.command == "scan":
        if args.target == "iac":
            scan_iac(args.directory)
        else:
            parser.print_help()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
