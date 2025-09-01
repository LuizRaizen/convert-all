from django.conf import settings

def plan_limits(request):
    limits = getattr(settings, "UPLOAD_LIMITS", {})
    plan = getattr(settings, "CURRENT_PLAN", "free")

    # (gancho futuro) se usar flag por usuário:
    # if getattr(request.user, "is_authenticated", False) and getattr(request.user, "is_premium", False):
    #     plan = "premium"

    if plan == "premium":
        cur = limits.get("PREMIUM_MAX_TOTAL_UPLOAD_BYTES", 1024 * 1024 * 1024)
    else:
        cur = limits.get("FREE_MAX_TOTAL_UPLOAD_BYTES", 500 * 1024 * 1024)

    return {
        "UPLOAD_LIMIT_BYTES": int(cur),
        "CURRENT_PLAN": plan,
        "UPGRADE_URL": "/premium",  # troque por reverse quando criar a rota
    }
