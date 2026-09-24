"""Vesper: streamed answers, citations, saved conversations, ratings, and per-user privacy."""
import json

from tests.test_e2e_moto import _scan, client, login  # noqa: F401  (client is a fixture)


def ask(c, question, **extra):
    """POST /assistant/chat and parse the Server-Sent Events into (events, full_text)."""
    r = c.post("/api/v1/assistant/chat", json={"question": question, **extra})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")
    events = []
    for block in r.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    text = "".join(d["text"] for e, d in events if e == "delta")
    return events, text


def test_streams_a_grounded_answer_and_saves_the_conversation(client):
    events, text = ask(client, "hi")
    kinds = [e for e, _ in events]
    assert kinds[0] == "meta" and kinds[-1] == "done" and "delta" in kinds and "error" not in kinds
    assert "no completed scan" in text.lower()
    convo_id = events[0][1]["conversation_id"]

    _scan(client)
    events, text = ask(client, "What should I fix first?", conversation_id=convo_id,
                       context={"page": "overview"})
    done = events[-1][1]
    assert done["ai"] is False                              # no AI key in tests: factual fallback
    assert "Fix first" in text and "123456789012" in text
    assert done["citations"] and all(c.split("-")[0] in {"IAM", "S3", "EC2", "RDS"} for c in done["citations"])
    assert done["scan_completed_at"]

    convo = client.get(f"/api/v1/assistant/conversations/{convo_id}").json()
    assert [m["role"] for m in convo["messages"]] == ["user", "assistant", "user", "assistant"]
    assert convo["messages"][-1]["citations"] == done["citations"]
    assert convo["title"] == "hi"
    listed = client.get("/api/v1/assistant/conversations").json()
    assert listed[0]["id"] == convo_id and listed[0]["messages"] == 4


def test_page_context_with_an_open_finding(client):
    _scan(client)
    finding = client.get("/api/v1/findings").json()[0]
    events, text = ask(client, "Explain this", context={"page": "findings", "finding_id": finding["id"]})
    assert events[-1][0] == "done" and text


def test_rate_rename_delete(client):
    events, _ = ask(client, "Summarise my risk for a manager in three sentences please, keeping it short")
    convo_id, msg_id = events[0][1]["conversation_id"], events[-1][1]["message_id"]
    assert events[0][1]["title"].endswith("…") and len(events[0][1]["title"]) <= 60

    assert client.patch(f"/api/v1/assistant/messages/{msg_id}", json={"rating": 1}).json()["rating"] == 1
    assert client.patch(f"/api/v1/assistant/messages/{msg_id}", json={"rating": 0}).json()["rating"] is None
    assert client.patch(f"/api/v1/assistant/messages/{msg_id}", json={"rating": 5}).status_code == 422

    assert client.patch(f"/api/v1/assistant/conversations/{convo_id}", json={"title": "Manager summary"}).json()["title"] == "Manager summary"
    assert client.delete(f"/api/v1/assistant/conversations/{convo_id}").status_code == 204
    assert client.get(f"/api/v1/assistant/conversations/{convo_id}").status_code == 404
    assert client.get("/api/v1/assistant/conversations").json() == []


def test_conversations_are_private_to_their_owner(client):
    events, _ = ask(client, "admin's private question")
    convo_id, msg_id = events[0][1]["conversation_id"], events[-1][1]["message_id"]

    login(client, "viewer")   # any other user, whatever their role
    assert client.get("/api/v1/assistant/conversations").json() == []
    assert client.get(f"/api/v1/assistant/conversations/{convo_id}").status_code == 404
    assert client.patch(f"/api/v1/assistant/conversations/{convo_id}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/v1/assistant/conversations/{convo_id}").status_code == 404
    assert client.patch(f"/api/v1/assistant/messages/{msg_id}", json={"rating": -1}).status_code == 404
    r = client.post("/api/v1/assistant/chat", json={"question": "append to theirs", "conversation_id": convo_id})
    assert r.status_code == 404


def test_rejects_empty_questions_and_needs_a_session(client):
    assert client.post("/api/v1/assistant/chat", json={"question": ""}).status_code == 422
    assert client.post("/api/v1/assistant/chat", json={"question": "   "}).status_code == 422
    del client.headers["Authorization"]
    assert client.get("/api/v1/assistant/conversations").status_code == 401
