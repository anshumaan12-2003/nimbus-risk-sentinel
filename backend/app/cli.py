"""
Admin CLI — the safest way to create the first admin on a server nobody else can reach yet.

    python -m app.cli create-user --email you@example.com --name "Your Name" --role admin
    python -m app.cli list-users
    python -m app.cli set-role --email someone@example.com --role approver
"""
import argparse
import getpass
import sys

import app.models  # noqa: F401
from app.auth.security import hash_password, password_problem
from app.database import SessionLocal
from app.models.user import Role, User


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-user")
    c.add_argument("--email", required=True)
    c.add_argument("--name", required=True)
    c.add_argument("--role", choices=[r.value for r in Role], default="viewer")
    c.add_argument("--password", help="omit to be prompted (keeps it out of shell history)")
    sub.add_parser("list-users")
    r = sub.add_parser("set-role")
    r.add_argument("--email", required=True)
    r.add_argument("--role", choices=[r.value for r in Role], required=True)
    a = p.parse_args(argv)

    db = SessionLocal()
    try:
        if a.cmd == "create-user":
            email = a.email.strip().lower()
            if db.query(User).filter(User.email == email).first():
                sys.exit(f"{email} already exists")
            pw = a.password or getpass.getpass("Password: ")
            if problem := password_problem(pw):
                sys.exit(problem)
            db.add(User(email=email, name=a.name, role=Role(a.role), password_hash=hash_password(pw)))
            db.commit()
            print(f"created {email} ({a.role})")
        elif a.cmd == "list-users":
            for u in db.query(User).order_by(User.email):
                print(f"{u.email:40} {u.role.value:9} {'active' if u.is_active else 'disabled'}")
        elif a.cmd == "set-role":
            u = db.query(User).filter(User.email == a.email.strip().lower()).first()
            if not u:
                sys.exit("no such user")
            u.role, u.token_version = Role(a.role), u.token_version + 1
            db.commit()
            print(f"{u.email} is now {a.role}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
