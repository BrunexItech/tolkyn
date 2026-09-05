"""One-off cleanup: remove every throwaway test account created while
building/testing this session's features, keeping only real accounts.
Deletes all workspace-scoped rows for each test user, then the user row."""
import asyncio
from sqlalchemy import text
from app.db.base import engine

REAL_EMAILS = {"brunosharif89@gmail.com"}

WORKSPACE_TABLES = [
    "audience_segments", "automation_runs", "automations", "broadcasts",
    "call_agents", "calls", "campaigns", "customers", "email_accounts",
    "email_sends", "generated_assets", "inbox_threads", "leads",
    "media_watches", "posts", "provider_profiles", "social_connections",
    "social_leads", "target_areas", "team_members", "uploads",
    "activity_logs",
]


async def main():
    async with engine.begin() as conn:
        rows = (await conn.execute(text("select id, email from users"))).all()
        to_delete = [(r[0], r[1]) for r in rows if r[1] not in REAL_EMAILS]
        print(f"total users: {len(rows)}, deleting: {len(to_delete)}, keeping: {len(rows) - len(to_delete)}")

        for uid, email in to_delete:
            for table in WORKSPACE_TABLES:
                await conn.execute(text(f"DELETE FROM {table} WHERE workspace_id = :uid"), {"uid": uid})
            await conn.execute(text("DELETE FROM subsidiaries WHERE workspace_id = :uid"), {"uid": uid})
            await conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})
        print(f"deleted {len(to_delete)} test accounts and their data")

    async with engine.connect() as conn:
        remaining = (await conn.execute(text("select email from users"))).all()
        print("remaining users:", [r[0] for r in remaining])

asyncio.run(main())
