# tools/images/converter.py
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Tuple, Dict, Any, List
from datetime import datetime
import zipfile
import os

from PIL import Image, ImageOps, UnidentifiedImageError

# ---------------------------------------------------------------------
# Extensões de saída suportadas -> Formato Pillow (apenas formatos com escrita estável)
# (evitamos incluir aqui formatos que o Pillow lê mas NÃO grava)
# ---------------------------------------------------------------------
EXT_TO_PIL: Dict[str, str] = {
    # Comuns
    "jpg": "JPEG", "jpeg": "JPEG", "jfif": "JPEG",
    "png": "PNG",
    "bmp": "BMP",
    "gif": "GIF",
    "tif": "TIFF", "tiff": "TIFF",
    "webp": "WEBP",
    "ico": "ICO",
    # Técnicos com escrita suportada
    "ppm": "PPM", "pgm": "PPM", "pbm": "PPM",  # plugin PPM decide PBM/PGM/PPM pelo modo (1/L/RGB)
    "pcx": "PCX",
    "eps": "EPS",
    "xbm": "XBM",
    "xpm": "XPM",
    "tga": "TGA",
    "sgi": "SGI",
    "im":  "IM",
    "cur": "CUR",
}

ProgressCB = Callable[[int, str], None]  # (percent, label)
RGB = Tuple[int, int, int]

@dataclass
class ConvertResult:
    src: Path
    ok: bool
    dst: Optional[Path]
    dst_format: Optional[str]
    fallback_used: bool
    reason: Optional[str] = None

@dataclass
class BatchResult:
    ok: bool
    zip_path: Optional[Path]
    converted: int
    fallback_count: int
    errors: List[ConvertResult]
    results: List[ConvertResult]

# ------------------------------ Helpers --------------------------------
def _kebab(s: str) -> str:
    return "-".join(s.strip().lower().split())

def _brand_name(stem: str, ext: str, brand_tag: str, name_style: str) -> str:
    ext = ext.lstrip(".").lower()
    tag = _kebab(brand_tag)
    if name_style == "prefix":
        return f"{tag}--{stem}.{ext}"
    return f"{stem}--{tag}.{ext}"

def _limit_sizes_for_icon(base_w: int, base_h: int) -> list[tuple[int, int]]:
    # Gera múltiplos tamanhos para ICO/CUR, sem ultrapassar o original
    candidates = [16, 24, 32, 48, 64, 128, 256]
    max_sz = min(max(base_w, base_h), 256)  # ICO/CUR até 256
    sizes = sorted({s for s in candidates if s <= max_sz})
    if not sizes:
        sizes = [min(max(base_w, base_h), 256)]
    return [(s, s) for s in sizes]

# ---------------------- Preparo de imagem por formato -------------------
def _prepare_image_for_format(
    im: Image.Image,
    pil_fmt: str,
    *,
    background_rgb: RGB,
    requested_ext: str | None = None,  # para PPM/PGM/PBM
) -> Image.Image:
    """
    Ajusta modo/canais e trata alpha conforme o formato de destino.
    """
    has_alpha = ("A" in im.getbands()) or ("transparency" in im.info)

    if pil_fmt == "JPEG":
        # JPEG não suporta alpha
        if has_alpha:
            bg = Image.new("RGB", im.size, background_rgb)
            im_rgba = im.convert("RGBA")
            bg.paste(im_rgba, mask=im_rgba.split()[-1])
            im = bg
        elif im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

    elif pil_fmt == "PNG":
        # OK com alpha; evitar "P" desnecessário
        if im.mode == "P":
            im = im.convert("RGBA" if has_alpha else "RGB")

    elif pil_fmt == "WEBP":
        # WEBP suporta alpha
        if im.mode == "P":
            im = im.convert("RGBA" if has_alpha else "RGB")

    elif pil_fmt == "GIF":
        # GIF: paleta até 256 cores; pode ter transparência 1-bit
        if im.mode not in ("P", "L"):
            # se tem alpha, comece em RGBA → Pillow tratará ao quantizar
            im = im.convert("RGBA" if has_alpha else "RGB")
        # quantize ajuda a reduzir cores para GIF
        im = im.convert("P", palette=Image.ADAPTIVE)

    elif pil_fmt == "TIFF":
        # TIFF aceita RGB/RGBA/L; evite CMYK por padrão (a não ser que deseje manter)
        if im.mode not in ("RGB", "RGBA", "L"):
            im = im.convert("RGBA" if has_alpha else "RGB")

    elif pil_fmt == "BMP":
        # BMP não suporta alpha: achatar
        if has_alpha:
            bg = Image.new("RGB", im.size, background_rgb)
            im_rgba = im.convert("RGBA")
            bg.paste(im_rgba, mask=im_rgba.split()[-1])
            im = bg
        elif im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

    elif pil_fmt in {"ICO", "CUR"}:
        # ICO/CUR suportam alpha; garanta RGBA para melhor resultado
        if im.mode not in ("RGBA", "RGB"):
            im = im.convert("RGBA" if has_alpha else "RGB")

    elif pil_fmt == "PPM":
        # PPM plugin escolhe PBM/PGM/PPM conforme o modo:
        #  - "1" -> PBM (monocromático 1-bit)
        #  - "L" -> PGM (tons de cinza)
        #  - "RGB" -> PPM (colorido)
        ext = (requested_ext or "").lower().lstrip(".")
        if ext == "pbm":
            if im.mode != "1":
                # converter para 1-bit (threshold simples)
                im = im.convert("1")
        elif ext == "pgm":
            if im.mode != "L":
                im = im.convert("L")
        else:  # "ppm"
            if im.mode not in ("RGB",):
                im = im.convert("RGB")

    elif pil_fmt == "PCX":
        # PCX não tem alpha; converta para RGB/L
        if has_alpha:
            bg = Image.new("RGB", im.size, background_rgb)
            im_rgba = im.convert("RGBA")
            bg.paste(im_rgba, mask=im_rgba.split()[-1])
            im = bg
        elif im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

    elif pil_fmt == "EPS":
        # EPS é vetor/PS, mas Pillow exporta raster como EPS encapsulado
        # Sem alpha; converta para RGB
        if im.mode != "RGB":
            im = im.convert("RGB")

    elif pil_fmt == "XBM":
        # XBM é 1-bit
        if im.mode != "1":
            im = im.convert("1")

    elif pil_fmt == "XPM":
        # XPM é paletizado
        if im.mode not in ("P", "L"):
            im = im.convert("RGB")
        im = im.convert("P", palette=Image.ADAPTIVE)

    elif pil_fmt == "TGA":
        # TGA suporta alpha
        if im.mode == "P":
            im = im.convert("RGBA" if has_alpha else "RGB")

    elif pil_fmt == "SGI":
        # SGI: use L ou RGB
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

    elif pil_fmt == "IM":
        # Formato nativo PIL; RGB é um bom denominador comum
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

    else:
        # fallback seguro genérico
        if has_alpha:
            im = im.convert("RGBA")
        elif im.mode not in ("RGB", "L", "1"):
            im = im.convert("RGB")

    return im

def _save_with_params(
    im: Image.Image,
    dst_path: Path,
    pil_fmt: str,
    *,
    exif_bytes: Optional[bytes],
    icc_profile: Optional[bytes],
    jpeg_quality: int,
    jpeg_progressive: bool,
    webp_quality: int,
    png_compress_level: int,
    tiff_compression: Optional[str],
    requested_ext: str | None = None,
) -> None:
    kwargs: Dict[str, Any] = {}

    if pil_fmt == "JPEG":
        kwargs.update(
            quality=jpeg_quality,
            optimize=True,
            progressive=jpeg_progressive,
            subsampling="4:2:0",
        )
        if exif_bytes: kwargs["exif"] = exif_bytes
        if icc_profile: kwargs["icc_profile"] = icc_profile

    elif pil_fmt == "PNG":
        kwargs.update(
            optimize=True,
            compress_level=max(0, min(9, int(png_compress_level))),
        )
        if icc_profile: kwargs["icc_profile"] = icc_profile

    elif pil_fmt == "WEBP":
        kwargs.update(
            quality=webp_quality,
            method=6,
        )
        if icc_profile: kwargs["icc_profile"] = icc_profile

    elif pil_fmt == "GIF":
        kwargs.update(
            optimize=True,
            save_all=False,  # não estamos tratando animações aqui
            # transparency: Pillow tenta inferir; manter simples
        )

    elif pil_fmt == "TIFF":
        if tiff_compression:
            kwargs["compression"] = tiff_compression
        if exif_bytes: kwargs["exif"] = exif_bytes
        if icc_profile: kwargs["icc_profile"] = icc_profile

    elif pil_fmt in {"ICO", "CUR"}:
        # Gerar múltiplos tamanhos automaticamente
        w, h = im.size
        sizes = _limit_sizes_for_icon(w, h)
        kwargs["sizes"] = sizes
        if pil_fmt == "CUR":
            # hotspot padrão (0,0) — pode ser parametrizado depois
            kwargs["hotspot"] = (0, 0)

    elif pil_fmt == "PPM":
        # PPM plugin decide PBM/PGM/PPM via modo (1/L/RGB)
        pass

    elif pil_fmt == "EPS":
        # Definir dpi ajuda certos viewers a não assumirem 72dpi
        kwargs["dpi"] = (300, 300)

    elif pil_fmt in {"XBM", "XPM", "PCX", "TGA", "SGI", "IM", "BMP"}:
        # Sem opções especiais aqui
        pass

    im.save(dst_path, pil_fmt, **kwargs)

# ------------------------------ Conversor --------------------------------
class ImagesConverter:
    """
    Converte N arquivos para um formato alvo, com fallback PNG apenas se o
    Pillow (neste ambiente) não suportar a gravação do formato escolhido.
    """
    def __init__(
        self,
        *,
        brand_tag: str = "converte-tudo",
        name_style: str = "suffix",
        background_rgb: RGB = (255, 255, 255),
        overwrite: bool = False,
        jpeg_quality: int = 85,
        webp_quality: int = 85,
        jpeg_progressive: bool = True,
        png_compress_level: int = 6,
        tiff_compression: Optional[str] = None,
    ) -> None:
        self.brand_tag = brand_tag
        self.name_style = name_style
        self.background_rgb = background_rgb
        self.overwrite = overwrite
        self.jpeg_quality = jpeg_quality
        self.webp_quality = webp_quality
        self.jpeg_progressive = jpeg_progressive
        self.png_compress_level = png_compress_level
        self.tiff_compression = tiff_compression

    def convert_one(self, src_path: Path, out_dir: Path, out_ext: str) -> ConvertResult:
        out_ext_norm = out_ext.lower().lstrip(".")
        pil_fmt = EXT_TO_PIL.get(out_ext_norm)
        src = Path(src_path)

        if not src.exists():
            return ConvertResult(src=src, ok=False, dst=None, dst_format=None, fallback_used=False, reason="Arquivo inexistente")

        try:
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im)
                exif_bytes = im.info.get("exif")
                icc_profile = im.info.get("icc_profile")

                # 1) Tenta formato alvo (se suportado)
                if pil_fmt:
                    im_tgt = _prepare_image_for_format(
                        im, pil_fmt,
                        background_rgb=self.background_rgb,
                        requested_ext=out_ext_norm
                    )
                    dst_name = _brand_name(src.stem, out_ext_norm, self.brand_tag, self.name_style)
                    dst_path = out_dir / dst_name

                    if not self.overwrite and dst_path.exists():
                        return ConvertResult(src=src, ok=True, dst=dst_path, dst_format=pil_fmt, fallback_used=False, reason="Já existia")

                    try:
                        _save_with_params(
                            im_tgt, dst_path, pil_fmt,
                            exif_bytes=exif_bytes, icc_profile=icc_profile,
                            jpeg_quality=self.jpeg_quality,
                            jpeg_progressive=self.jpeg_progressive,
                            webp_quality=self.webp_quality,
                            png_compress_level=self.png_compress_level,
                            tiff_compression=self.tiff_compression,
                            requested_ext=out_ext_norm,
                        )
                        return ConvertResult(src=src, ok=True, dst=dst_path, dst_format=pil_fmt, fallback_used=False)
                    except Exception as e:
                        fail_reason = f"Falha no formato alvo ({pil_fmt}): {e}"
                else:
                    fail_reason = f"Formato de saída não suportado: {out_ext}"

                # 2) Fallback → PNG (último recurso)
                im_png = _prepare_image_for_format(im, "PNG", background_rgb=self.background_rgb)
                png_name = _brand_name(src.stem, "png", self.brand_tag, self.name_style)
                png_path = out_dir / png_name

                if not self.overwrite and png_path.exists():
                    return ConvertResult(src=src, ok=True, dst=png_path, dst_format="PNG", fallback_used=True, reason=fail_reason)

                _save_with_params(
                    im_png, png_path, "PNG",
                    exif_bytes=exif_bytes, icc_profile=icc_profile,
                    jpeg_quality=self.jpeg_quality,
                    jpeg_progressive=self.jpeg_progressive,
                    webp_quality=self.webp_quality,
                    png_compress_level=self.png_compress_level,
                    tiff_compression=self.tiff_compression,
                    requested_ext="png",
                )
                return ConvertResult(src=src, ok=True, dst=png_path, dst_format="PNG", fallback_used=True, reason=fail_reason)

        except UnidentifiedImageError:
            return ConvertResult(src=src, ok=False, dst=None, dst_format=None, fallback_used=False, reason="Arquivo não reconhecido")
        except Exception as e:
            return ConvertResult(src=src, ok=False, dst=None, dst_format=None, fallback_used=False, reason=str(e))

    def convert_batch_to_zip(
        self,
        src_files: Iterable[Path],
        *,
        out_ext: str,
        work_dir: Path,
        progress: Optional[ProgressCB] = None,
        zip_basename: Optional[str] = None,
        keep_outputs: bool = False,
    ) -> BatchResult:

        work_dir = Path(work_dir)
        out_dir = work_dir / "out"
        out_dir.mkdir(parents=True, exist_ok=True)

        files = [Path(p) for p in src_files]
        total = len(files)
        if total == 0:
            return BatchResult(ok=False, zip_path=None, converted=0, fallback_count=0, errors=[], results=[])

        def emit(pct: int, label: str) -> None:
            if progress:
                progress(max(0, min(100, int(pct))), label)

        results: List[ConvertResult] = []
        errors: List[ConvertResult] = []
        fallback_count = 0

        for i, src in enumerate(files):
            emit(int((i / total) * 80), f"Convertendo: {src.name}")
            r = self.convert_one(src, out_dir, out_ext)
            results.append(r)
            if not r.ok:
                errors.append(r)
            if r.fallback_used:
                fallback_count += 1

        emit(80, "Compactando…")

        stamp = datetime.utcnow().isoformat().replace(":", "").replace(".", "")[:15]
        target_ext_for_name = out_ext.lower().lstrip(".") if out_ext.lower().lstrip(".") in EXT_TO_PIL else "png"
        base = zip_basename or f"imagens-{target_ext_for_name}-converte-tudo-{stamp}.zip"
        zip_path = work_dir / base

        out_files = [r.dst for r in results if r.ok and r.dst]
        if not out_files:
            return BatchResult(ok=False, zip_path=None, converted=0, fallback_count=fallback_count, errors=errors, results=results)

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            n = len(out_files)
            for j, f in enumerate(out_files):
                arcname = os.path.basename(str(f))
                zf.write(str(f), arcname=arcname)
                emit(80 + int(((j + 1) / n) * 20), "Compactando…")

        if not keep_outputs:
            for f in out_files:
                try: Path(f).unlink(missing_ok=True)
                except Exception: pass

        converted_ok = sum(1 for r in results if r.ok)
        return BatchResult(
            ok=True,
            zip_path=zip_path,
            converted=converted_ok,
            fallback_count=fallback_count,
            errors=errors,
            results=results,
        )
    