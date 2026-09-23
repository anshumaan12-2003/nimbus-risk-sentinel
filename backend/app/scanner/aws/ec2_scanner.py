import logging
from botocore.exceptions import ClientError
from app.scanner.base_scanner import BaseScanner, ScanFinding
from app.models.finding import Severity
from app.utils.aws_client import get_aws_client

logger = logging.getLogger(__name__)


class EC2Scanner(BaseScanner):
    """
    Scans AWS EC2 instances and Security Groups.

    Rules:
      EC2-001: Security group allows SSH (22) from 0.0.0.0/0
      EC2-002: Security group allows RDP (3389) from 0.0.0.0/0
      EC2-003: EBS volumes not encrypted
      EC2-004: EC2 instance has public IP with unrestricted inbound
      EC2-005: Instance metadata service allows IMDSv1 (SSRF -> credential theft)
    """

    def __init__(self, region: str):
        super().__init__(region)
        self.ec2 = get_aws_client("ec2", region)

    def scan(self) -> list[ScanFinding]:
        logger.info(f"Starting EC2 scan in region {self.region}...")
        try:
            self._scan_security_groups()
            self._scan_ebs_volumes()
            self._scan_instances()
        except ClientError as e:
            logger.error(f"EC2 scan failed in {self.region}: {e}")

        logger.info(f"EC2 scan complete. Found {len(self.findings)} findings.")
        return self.findings

    def _scan_security_groups(self):
        paginator = self.ec2.get_paginator("describe_security_groups")
        for page in paginator.paginate():
            for sg in page["SecurityGroups"]:
                self._check_ssh_open(sg)
                self._check_rdp_open(sg)

    def _scan_ebs_volumes(self):
        paginator = self.ec2.get_paginator("describe_volumes")
        for page in paginator.paginate():
            for volume in page["Volumes"]:
                self._check_volume_encryption(volume)

    def _scan_instances(self):
        paginator = self.ec2.get_paginator("describe_instances")
        for page in paginator.paginate():
            for reservation in page["Reservations"]:
                for instance in reservation["Instances"]:
                    if instance["State"]["Name"] == "running":
                        self._check_public_instance(instance)
                        self._check_imdsv2(instance)

    def _get_sg_name(self, sg: dict) -> str:
        name = sg.get("GroupName", sg["GroupId"])
        tags = {t["Key"]: t["Value"] for t in sg.get("Tags", [])}
        return tags.get("Name", name)

    # ─── Rule: EC2-001 ────────────────────────────────────────────────────
    def _check_ssh_open(self, sg: dict):
        sg_id = sg["GroupId"]
        sg_name = self._get_sg_name(sg)
        for rule in sg.get("IpPermissions", []):
            if rule.get("FromPort") == 22 or rule.get("ToPort") == 22:
                for ip_range in rule.get("IpRanges", []):
                    if ip_range.get("CidrIp") == "0.0.0.0/0":
                        self.add_finding(ScanFinding(
                            rule_id="EC2-001",
                            title=f"Security Group '{sg_name}' Allows SSH from Anywhere",
                            description=(
                                f"Security Group '{sg_name}' ({sg_id}) allows inbound SSH (port 22) "
                                "from 0.0.0.0/0 (the entire internet). "
                                "This exposes instances to brute-force attacks and unauthorized access attempts."
                            ),
                            severity=Severity.CRITICAL,
                            service="ec2",
                            resource_id=sg_id,
                            resource_type="security_group",
                            resource_name=sg_name,
                            region=self.region,
                            recommendation=(
                                "Restrict SSH access to specific IP addresses (your office/VPN CIDR). "
                                "Consider using AWS Systems Manager Session Manager instead of SSH."
                            ),
                            remediation_cmd=(
                                f'aws ec2 revoke-security-group-ingress --group-id {sg_id} '
                                f'--protocol tcp --port 22 --cidr 0.0.0.0/0 --region {self.region}'
                            ),
                        ))
                for ipv6_range in rule.get("Ipv6Ranges", []):
                    if ipv6_range.get("CidrIpv6") == "::/0":
                        self.add_finding(ScanFinding(
                            rule_id="EC2-001",
                            title=f"Security Group '{sg_name}' Allows SSH from Anywhere (IPv6)",
                            description=(
                                f"Security Group '{sg_name}' ({sg_id}) allows inbound SSH (port 22) "
                                "from ::/0 (all IPv6 addresses)."
                            ),
                            severity=Severity.CRITICAL,
                            service="ec2",
                            resource_id=sg_id,
                            resource_type="security_group",
                            resource_name=sg_name,
                            region=self.region,
                            recommendation="Restrict SSH access to specific CIDR ranges.",
                            remediation_cmd=(
                                f'aws ec2 revoke-security-group-ingress --group-id {sg_id} '
                                f'--ip-permissions IpProtocol=tcp,FromPort=22,ToPort=22,'
                                f'Ipv6Ranges=[{{CidrIpv6=::/0}}] --region {self.region}'
                            ),
                        ))

    # ─── Rule: EC2-002 ────────────────────────────────────────────────────
    def _check_rdp_open(self, sg: dict):
        sg_id = sg["GroupId"]
        sg_name = self._get_sg_name(sg)
        for rule in sg.get("IpPermissions", []):
            if rule.get("FromPort") == 3389 or rule.get("ToPort") == 3389:
                for ip_range in rule.get("IpRanges", []):
                    if ip_range.get("CidrIp") == "0.0.0.0/0":
                        self.add_finding(ScanFinding(
                            rule_id="EC2-002",
                            title=f"Security Group '{sg_name}' Allows RDP from Anywhere",
                            description=(
                                f"Security Group '{sg_name}' ({sg_id}) allows inbound RDP (port 3389) "
                                "from 0.0.0.0/0 (the entire internet). "
                                "Open RDP is one of the most common entry points for ransomware attacks."
                            ),
                            severity=Severity.CRITICAL,
                            service="ec2",
                            resource_id=sg_id,
                            resource_type="security_group",
                            resource_name=sg_name,
                            region=self.region,
                            recommendation=(
                                "Restrict RDP access to specific corporate IP ranges. "
                                "Consider using AWS Systems Manager Fleet Manager for RDP-free access."
                            ),
                            remediation_cmd=(
                                f'aws ec2 revoke-security-group-ingress --group-id {sg_id} '
                                f'--protocol tcp --port 3389 --cidr 0.0.0.0/0 --region {self.region}'
                            ),
                        ))

    # ─── Rule: EC2-003 ────────────────────────────────────────────────────
    def _check_volume_encryption(self, volume: dict):
        if not volume.get("Encrypted", False):
            vol_id = volume["VolumeId"]
            vol_state = volume.get("State", "unknown")
            # Get instance it's attached to
            attachments = volume.get("Attachments", [])
            attached_to = attachments[0]["InstanceId"] if attachments else "unattached"
            tags = {t["Key"]: t["Value"] for t in volume.get("Tags", [])}
            vol_name = tags.get("Name", vol_id)

            self.add_finding(ScanFinding(
                rule_id="EC2-003",
                title=f"EBS Volume '{vol_name}' Is Not Encrypted",
                description=(
                    f"EBS volume '{vol_id}' (state: {vol_state}, attached to: {attached_to}) "
                    "is not encrypted. Unencrypted EBS volumes expose data if the underlying "
                    "hardware is physically compromised."
                ),
                severity=Severity.HIGH,
                service="ec2",
                resource_id=vol_id,
                resource_type="ebs_volume",
                resource_name=vol_name,
                region=self.region,
                recommendation=(
                    "Create an encrypted snapshot of the volume and restore it as an encrypted volume. "
                    "Enable default EBS encryption in account settings to encrypt all future volumes."
                ),
                remediation_cmd=(
                    f'# Step 1: Create snapshot\n'
                    f'aws ec2 create-snapshot --volume-id {vol_id} --region {self.region}\n'
                    f'# Step 2: Copy snapshot with encryption\n'
                    f'aws ec2 copy-snapshot --source-snapshot-id <snap-id> --encrypted --region {self.region}'
                ),
            ))

    # ─── Rule: EC2-004 ────────────────────────────────────────────────────
    # ─── Rule: EC2-005 ────────────────────────────────────────────────────
    def _check_imdsv2(self, instance: dict):
        if (instance.get("MetadataOptions") or {}).get("HttpTokens") == "required":
            return
        if not instance.get("IamInstanceProfile"):
            return  # no role credentials to steal -> not worth a finding
        instance_id = instance["InstanceId"]
        tags = {t["Key"]: t["Value"] for t in instance.get("Tags", [])}
        name = tags.get("Name", instance_id)
        self.add_finding(ScanFinding(
            rule_id="EC2-005",
            title=f"Instance '{name}' Allows IMDSv1",
            description=(
                f"EC2 instance '{name}' ({instance_id}) has an IAM instance profile and does not require "
                "IMDSv2 session tokens. Any SSRF bug in the workload lets an attacker read the role's "
                "temporary credentials from http://169.254.169.254 (the Capital One 2019 breach pattern)."
            ),
            severity=Severity.HIGH,
            service="ec2",
            resource_id=instance_id,
            resource_type="ec2_instance",
            resource_name=name,
            region=self.region,
            recommendation="Require IMDSv2 (HttpTokens=required) and set hop limit to 1 unless containers need 2.",
            remediation_cmd=(
                f"aws ec2 modify-instance-metadata-options --instance-id {instance_id} "
                f"--http-tokens required --http-endpoint enabled --region {self.region}"
            ),
        ))

    def _check_public_instance(self, instance: dict):
        instance_id = instance["InstanceId"]
        public_ip = instance.get("PublicIpAddress")
        if not public_ip:
            return

        tags = {t["Key"]: t["Value"] for t in instance.get("Tags", [])}
        name = tags.get("Name", instance_id)

        # Check if any SG attached allows all traffic
        for sg in instance.get("SecurityGroups", []):
            sg_id = sg["GroupId"]
            try:
                sg_detail = self.ec2.describe_security_groups(GroupIds=[sg_id])
                for rule in sg_detail["SecurityGroups"][0].get("IpPermissions", []):
                    for ip_range in rule.get("IpRanges", []):
                        if ip_range.get("CidrIp") == "0.0.0.0/0" and rule.get("IpProtocol") == "-1":
                            self.add_finding(ScanFinding(
                                rule_id="EC2-004",
                                title=f"Instance '{name}' Has Public IP and All-Traffic Inbound Rule",
                                description=(
                                    f"EC2 instance '{name}' ({instance_id}) has a public IP ({public_ip}) "
                                    f"and is associated with security group {sg_id} which allows "
                                    "ALL traffic (protocol: -1) from 0.0.0.0/0. "
                                    "This completely exposes the instance to the internet."
                                ),
                                severity=Severity.CRITICAL,
                                service="ec2",
                                resource_id=instance_id,
                                resource_type="ec2_instance",
                                resource_name=name,
                                region=self.region,
                                recommendation=(
                                    "Remove the all-traffic inbound rule. Only allow specific ports "
                                    "required for the application."
                                ),
                                remediation_cmd=(
                                    f'aws ec2 revoke-security-group-ingress --group-id {sg_id} '
                                    f'--protocol -1 --cidr 0.0.0.0/0 --region {self.region}'
                                ),
                            ))
                            return
            except ClientError:
                pass
