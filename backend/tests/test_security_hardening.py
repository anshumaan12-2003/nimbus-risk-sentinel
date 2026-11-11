"""Regression tests for the CodeQL findings fixed in 1.5.1 (SSRF, path injection, ReDoS, error leaks)."""
import time

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from app.scanner.iac.terraform_scanner import TerraformScanner
from app.utils.aws_client import aws_error_text
from app.utils.slack_notifier import SlackNotifier, slack_webhook_url
from tests.test_e2e_moto import client, login  # noqa: F401  (client is a fixture)


@pytest.mark.parametrize("url", [
    "http://hooks.slack.com/services/T/B/X",                 # not https
    "https://169.254.169.254/latest/meta-data",              # cloud metadata
    "https://hooks.slack.com.evil.example/services/T/B/X",   # look-alike host
    "https://hooks.slack.com@evil.example/services/T/B/X",   # userinfo trick: real host is evil.example
    "https://evil.example#@hooks.slack.com/services/T/B/X",
    "https://hooks.slack.com:8443/services/T/B/X",           # other port
    "https://hooks.slack.com/api/other",                     # not a webhook path
    "not a url",
])
def test_only_slack_webhooks_are_accepted(url):
    assert slack_webhook_url(url) is None
    ok, msg = SlackNotifier.send_webhook(url, {"text": "x"})
    assert not ok and "hooks.slack.com" in msg                # refused before any request is made


def test_slack_webhook_is_rebuilt_on_the_fixed_host():
    assert slack_webhook_url(" https://hooks.slack.com/services/T0/B1/abc?x=1 ") == "https://hooks.slack.com/services/T0/B1/abc"


def test_directory_scan_endpoint_is_gone(client):
    login(client, "admin")                                    # even the admin (public on the hosted demo)
    assert client.post("/api/v1/iac/scan/directory", json={"directory": "/etc"}).status_code in (404, 405)


def test_terraform_scanner_stays_fast_on_hostile_input():
    # Unclosed blocks repeated many times made the old patterns quadratic
    hostile = 'resource "aws_security_group" "x" {\n' + ("ingress {\n" + " " * 50) * 4000 + \
              ("cidr_blocks = [" + "a" * 50) * 2000 + ("root_block_device {" * 3000)
    start = time.perf_counter()
    TerraformScanner().scan_content(hostile, filename="hostile.tf")
    assert time.perf_counter() - start < 5


def test_terraform_scanner_still_finds_open_ssh():
    tf = '''resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}'''
    result = TerraformScanner().scan_content(tf, filename="sg.tf")
    assert result["total_findings"] >= 1


def test_aws_errors_show_a_code_not_internals():
    denied = ClientError({"Error": {"Code": "AccessDenied", "Message": "User arn:aws:iam::123456789012:user/x is not authorized"}}, "GetCallerIdentity")
    assert aws_error_text(denied) == "AWS refused: the scanner identity lacks permission for this call. (AccessDenied)"
    assert "123456789012" not in aws_error_text(denied)
    net = EndpointConnectionError(endpoint_url="https://sts.internal.example:4566")
    assert "internal.example" not in aws_error_text(net) and "EndpointConnectionError" in aws_error_text(net)
