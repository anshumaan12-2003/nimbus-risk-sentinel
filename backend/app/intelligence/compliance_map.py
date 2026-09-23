"""
Rule -> control mapping. A control PASSES when none of its rules has an OPEN/IN_PROGRESS
finding in the latest scan; it is NOT_EVALUATED when the scanner for its service reported
an API warning (we cannot claim a pass for something we could not see).

Control ids follow CIS AWS Foundations Benchmark v3.0.0 numbering; verify against the
official PDF before quoting them in an audit (see roadmap).
"""
CONTROLS = [
    # id,        title,                                                         service, rules,               frameworks
    ("1.5",  "MFA enabled for the root user",                                  "iam", ["IAM-001"],            {"cis": "1.5",  "soc2": "CC6.1", "pci": "8.4.1",  "hipaa": "164.312(d)"}),
    ("1.10", "MFA enabled for all IAM users with console access",              "iam", ["IAM-002"],            {"cis": "1.10", "soc2": "CC6.1", "pci": "8.4.2",  "hipaa": "164.312(d)"}),
    ("1.12", "Credentials unused for 45+ days are disabled",                   "iam", ["IAM-005"],            {"cis": "1.12", "soc2": "CC6.2", "pci": "8.2.6",  "hipaa": "164.308(a)(3)"}),
    ("1.14", "Access keys rotated every 90 days or less",                      "iam", ["IAM-004"],            {"cis": "1.14", "soc2": "CC6.1", "pci": "8.3.9",  "hipaa": "164.308(a)(5)"}),
    ("1.16", "No IAM policies granting full *:* admin to users",               "iam", ["IAM-003"],            {"cis": "1.16", "soc2": "CC6.3", "pci": "7.2.1",  "hipaa": "164.312(a)(1)"}),
    ("2.1.x", "S3 default encryption at rest",                                 "s3",  ["S3-002"],             {"soc2": "CC6.7", "pci": "3.5.1",  "hipaa": "164.312(a)(2)(iv)"}),
    ("2.1.4", "S3 Block Public Access enabled / no public bucket policy",      "s3",  ["S3-001", "S3-005"],   {"cis": "2.1.4", "soc2": "CC6.6", "pci": "1.4.1", "hipaa": "164.312(a)(1)"}),
    ("S3-VER", "S3 versioning enabled (ransomware / deletion recovery)",        "s3",  ["S3-003"],             {"soc2": "A1.2", "hipaa": "164.308(a)(7)"}),
    ("S3-LOG", "S3 server access logging enabled",                             "s3",  ["S3-004"],             {"soc2": "CC7.2", "pci": "10.2.1", "hipaa": "164.312(b)"}),
    ("2.2.1", "EBS volumes encrypted",                                         "ec2", ["EC2-003"],            {"cis": "2.2.1", "soc2": "CC6.7", "pci": "3.5.1", "hipaa": "164.312(a)(2)(iv)"}),
    ("5.2",  "No security group allows admin ports from 0.0.0.0/0",            "ec2", ["EC2-001", "EC2-002"], {"cis": "5.2", "soc2": "CC6.6", "pci": "1.3.1", "hipaa": "164.312(e)(1)"}),
    ("EC2-PUB", "No public instance with all-traffic ingress",                 "ec2", ["EC2-004"],            {"soc2": "CC6.6", "pci": "1.3.1"}),
    ("5.6",  "EC2 metadata service requires IMDSv2",                           "ec2", ["EC2-005"],            {"cis": "5.6", "soc2": "CC6.1"}),
    ("2.3.1", "RDS storage encrypted",                                         "rds", ["RDS-002"],            {"cis": "2.3.1", "soc2": "CC6.7", "pci": "3.5.1", "hipaa": "164.312(a)(2)(iv)"}),
    ("2.3.3", "RDS instances not publicly accessible",                         "rds", ["RDS-001"],            {"cis": "2.3.3", "soc2": "CC6.6", "pci": "1.4.1", "hipaa": "164.312(e)(1)"}),
    ("RDS-BK", "RDS automated backups enabled",                                "rds", ["RDS-003"],            {"soc2": "A1.2", "hipaa": "164.308(a)(7)"}),
    ("RDS-USR", "RDS does not use default master username",                    "rds", ["RDS-004"],            {"soc2": "CC6.1", "pci": "2.2.2"}),
]

FRAMEWORKS = {
    "cis":   {"id": "cis-aws-3.0", "name": "CIS AWS Foundations Benchmark v3.0 (automated subset)", "category": "Foundational Baseline", "icon": "shield", "color": "#8b5cf6"},
    "soc2":  {"id": "soc2-type2",  "name": "SOC 2 Type II (Security, Availability)",               "category": "Trust Services Criteria", "icon": "file-check", "color": "#06b6d4"},
    "pci":   {"id": "pci-dss-4.0", "name": "PCI-DSS v4.0 (technical controls)",                    "category": "Payment Card Security", "icon": "credit-card", "color": "#f97316"},
    "hipaa": {"id": "hipaa-sec",   "name": "HIPAA Security Rule (technical safeguards)",           "category": "Healthcare Data Privacy", "icon": "activity", "color": "#10b981"},
}
