from __future__ import annotations
import os, uuid
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseNotAllowed
from django.urls import reverse
from django.shortcuts import render

from .forms import ImageConvertForm
from .converter import ImagesConverter
from .models import ImageFormat


# ================== Helpers de FS / URLs ==================

def _job_dirs() -> tuple[Path, Path]:
    job_id = uuid.uuid4().hex
    base = Path(settings.MEDIA_ROOT) / "tmp_uploads" / job_id
    src_dir = base / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    return base, src_dir

def _save_uploads(files, dst_dir: Path) -> list[Path]:
    paths = []
    for f in files:
        safe = f.name.replace("/", "_").replace("\\", "_")
        p = dst_dir / safe
        with open(p, "wb") as out:
            for chunk in f.chunks():
                out.write(chunk)
        paths.append(p)
    return paths

def _public_url(abs_path: Path) -> str:
    rel = Path(abs_path).resolve().relative_to(Path(settings.MEDIA_ROOT).resolve())
    return settings.MEDIA_URL.rstrip("/") + "/" + str(rel).replace("\\", "/")


# ================== Helpers de plano/limites ==================

def _upgrade_url() -> str:
    try:
        return reverse("core:premium")
    except Exception:
        return "/premium"

def _current_plan(request) -> str:
    # Gancho para futura checagem por usuário logado:
    # if getattr(request.user, "is_authenticated", False) and getattr(request.user, "is_premium", False):
    #     return "premium"
    return getattr(settings, "CURRENT_PLAN", "free")

def _current_upload_limit_bytes(request) -> int:
    limits = getattr(settings, "UPLOAD_LIMITS", {})
    plan = _current_plan(request)
    if plan == "premium":
        return int(limits.get("PREMIUM_MAX_TOTAL_UPLOAD_BYTES", 1024 * 1024 * 1024))
    return int(limits.get("FREE_MAX_TOTAL_UPLOAD_BYTES", 500 * 1024 * 1024))

def _current_upload_limit_files(request) -> int:
    limits = getattr(settings, "UPLOAD_LIMITS", {})
    plan = _current_plan(request)
    if plan == "premium":
        return int(limits.get("PREMIUM_MAX_FILES", 2000))
    return int(limits.get("FREE_MAX_FILES", 300))


# ================== Views ==================

def images_converter(request):
    # Carrega formatos permitidos do banco
    image_formats = ImageFormat.objects.all().order_by("acronym")

    # Expõe limites ao template (o JS lê estas globals)
    context = {
        "demo_mode": True,
        "image_formats": image_formats,
        "UPLOAD_LIMIT_BYTES": _current_upload_limit_bytes(request),
        "UPLOAD_LIMIT_FILES": _current_upload_limit_files(request),
        "UPGRADE_URL": _upgrade_url(),
        "CURRENT_PLAN": _current_plan(request),
    }
    return render(request, "tools/images/images-converter.html", context)


def process(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    # Valida campos não-arquivo
    form = ImageConvertForm(request.POST)
    if not form.is_valid():
        return JsonResponse({"ok": False, "errors": form.errors}, status=400)

    # Aceita 'arquivos' e 'arquivos[]'
    files = request.FILES.getlist("arquivos")
    if not files:
        files = request.FILES.getlist("arquivos[]")
    if not files:
        return JsonResponse(
            {"ok": False, "errors": {"arquivos": ["Nenhum arquivo enviado."]}},
            status=400,
        )

    # Limites por plano
    limit_files = _current_upload_limit_files(request)
    if limit_files and len(files) > limit_files:
        return JsonResponse(
            {
                "ok": False,
                "code": "TOO_MANY_FILES",
                "attempted_files": len(files),
                "allowed_files": int(limit_files),
                "upgrade_url": _upgrade_url(),
                "message": "Quantidade de arquivos excede o limite do plano atual.",
            },
            status=413,  # para o XHR tratar como “bloqueio de limite”
        )

    total_size = sum(int(getattr(f, "size", 0)) for f in files)
    limit_bytes = _current_upload_limit_bytes(request)
    if limit_bytes and total_size > limit_bytes:
        return JsonResponse(
            {
                "ok": False,
                "code": "LIMIT_EXCEEDED",
                "total_bytes": int(total_size),
                "allowed_bytes": int(limit_bytes),
                "upgrade_url": _upgrade_url(),
                "message": "Limite de tamanho de upload atingido para o plano atual.",
            },
            status=413,
        )

    # 'out_ext' do form ou alias 'format' do <select>
    out_ext = (form.cleaned_data.get("out_ext") or request.POST.get("format") or "").strip().lower()
    if not out_ext:
        return JsonResponse(
            {"ok": False, "errors": {"out_ext": ["Formato de saída é obrigatório."]}},
            status=400,
        )

    # Demais parâmetros
    jpeg_quality       = form.cleaned_data.get("jpeg_quality") or 85
    jpeg_progressive   = bool(form.cleaned_data.get("jpeg_progressive"))
    webp_quality       = form.cleaned_data.get("webp_quality") or 85
    png_compress_level = form.cleaned_data.get("png_compress_level") or 6
    tiff_compression   = form.cleaned_data.get("tiff_compression") or None
    background_hex     = (form.cleaned_data.get("background_hex") or "#FFFFFF").upper()
    bg_rgb = tuple(int(background_hex[i:i+2], 16) for i in (1, 3, 5))
    brand_tag   = form.cleaned_data.get("brand_tag") or "ConverteTudo"
    name_style  = form.cleaned_data.get("name_style") or "suffix"
    overwrite   = bool(form.cleaned_data.get("overwrite"))

    # 1) Salva uploads
    job_base, src_dir = _job_dirs()
    src_paths = _save_uploads(files, src_dir)

    # 2) Converte e zipa
    conv = ImagesConverter(
        brand_tag=brand_tag,
        name_style=name_style,
        background_rgb=bg_rgb,
        overwrite=overwrite,
        jpeg_quality=jpeg_quality,
        webp_quality=webp_quality,
        jpeg_progressive=jpeg_progressive,
        png_compress_level=png_compress_level,
        tiff_compression=tiff_compression,
    )

    def on_progress(pct: int, label: str) -> None:
        # Hook para SSE/WebSocket futuramente
        pass

    batch = conv.convert_batch_to_zip(
        src_files=src_paths,
        out_ext=out_ext,
        work_dir=job_base,
        progress=on_progress,
        keep_outputs=False,  # mantemos só o ZIP final
    )

    if not batch.ok or not batch.zip_path:
        return JsonResponse(
            {
                "ok": False,
                "errors": (
                    [{"src": str(e.src), "reason": e.reason} for e in getattr(batch, "errors", [])]
                    or [{"reason": "Falha ao converter"}]
                ),
            },
            status=400,
        )

    return JsonResponse(
        {
            "ok": True,
            "zip_url": _public_url(batch.zip_path),
            "zip_name": os.path.basename(str(batch.zip_path)),
            "converted": int(getattr(batch, "converted", 0)),
            "fallback_count": int(getattr(batch, "fallback_count", 0)),
            "errors": [{"src": str(e.src), "reason": e.reason} for e in getattr(batch, "errors", [])],
        }
    )


# ================== Handler 400 custom (TooManyFilesSent) ==================

def bad_request(request, exception):
    """
    Handler 400 que retorna JSON amigável para requisições AJAX e
    converte TooManyFilesSent em um payload tratável pelo front.
    """
    # Import tardio
    try:
        from django.core.exceptions import TooManyFilesSent
        is_too_many = isinstance(exception, TooManyFilesSent)
    except Exception:
        is_too_many = False

    wants_json = (
        request.headers.get("x-requested-with", "").lower() == "xmlhttprequest"
        or "application/json" in request.headers.get("Accept", "")
        or request.path.endswith("/processar/")  # nosso endpoint
    )

    if wants_json and is_too_many:
        return JsonResponse(
            {
                "ok": False,
                "code": "TOO_MANY_FILES",
                "allowed_files": int(getattr(settings, "DATA_UPLOAD_MAX_NUMBER_FILES", 1000)),
                "upgrade_url": _upgrade_url(),
                "message": "Você tentou enviar mais arquivos do que o permitido.",
            },
            status=413,  # tratar como limite no front
        )

    if wants_json:
        return JsonResponse(
            {"ok": False, "code": "BAD_REQUEST", "message": "Requisição inválida."},
            status=400,
        )

    return HttpResponseBadRequest("Bad Request")
