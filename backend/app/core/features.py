"""The canonical list of platform modules a Package can grant access to.

A workspace's effective access = the modules on its owner's Package. Accounts
with no package (everything that predates this) are grandfathered to `["*"]`.
The frontend nav mirrors these keys (see components/om/shell/nav.ts).
"""

MODULES: dict[str, str] = {
    "publishing": "Composer, Calendar & Published",
    "engage": "Social Media Inbox",
    "call_center": "Call Center",
    "whatsapp": "WhatsApp",
    "sms": "Bulk SMS & Phone Book",
    "email": "Bulk Email",
    "analytics": "Analytics & Media Intelligence",
    "leads": "Lead Generator",
    "crm": "CRM",
    "automations": "Automations",
    "video": "AI Video",
    "content_studio": "Content Studio",
    "geo": "Geo Targeting",
    "audience": "Audience",
    "campaigns": "Campaigns",
}

ALL_MODULES: list[str] = list(MODULES)


def normalize_modules(mods: list[str] | None) -> list[str]:
    if not mods:
        return []
    if "*" in mods:
        return ["*"]
    return [m for m in mods if m in MODULES]


# Seeded on startup if the packages table is empty (see db.base.seed_packages).
DEFAULT_PACKAGES = [
    {
        "name": "Starter",
        "description": "Publishing, inbox and CRM for a single brand.",
        "price_amount": 4900, "price_currency": "KES", "price_interval": "month",
        "modules": ["publishing", "engage", "crm", "content_studio", "analytics"],
        "limits": {"seats": 2, "video_budget_usd": 0, "images_daily": 20, "videos_daily": 0, "sms_monthly": 0, "call_minutes_monthly": 0},
        "is_default": True, "sort_order": 1,
    },
    {
        "name": "Growth",
        "description": "Adds messaging, lead generation, automations and the call centre.",
        "price_amount": 14900, "price_currency": "KES", "price_interval": "month",
        "modules": [
            "publishing", "engage", "crm", "content_studio", "analytics", "leads",
            "campaigns", "automations", "sms", "whatsapp", "email", "call_center", "audience",
        ],
        "limits": {"seats": 8, "video_budget_usd": 25, "images_daily": 100, "videos_daily": 10, "sms_monthly": 5000, "call_minutes_monthly": 2000},
        "is_default": False, "sort_order": 2,
    },
    {
        "name": "Enterprise",
        "description": "Everything, with room to grow.",
        "price_amount": 0, "price_currency": "KES", "price_interval": "month",
        "modules": ["*"],
        "limits": {"seats": 50, "video_budget_usd": 250, "sms_monthly": 100000, "call_minutes_monthly": 50000},
        "is_default": False, "sort_order": 3,
    },
]
