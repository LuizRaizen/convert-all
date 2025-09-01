# tools/images/forms.py
from django import forms
from django.forms.widgets import ClearableFileInput
from .models import ImageFormat


class MultiFileInput(ClearableFileInput):
    """Widget de arquivo com suporte a multiple."""
    allow_multiple_selected = True  # habilita <input multiple>


NAME_STYLE_CHOICES = (("suffix", "suffix"), ("prefix", "prefix"))
TIFF_COMP_CHOICES = (
    ("tiff_lzw", "TIFF LZW"),
    ("tiff_deflate", "TIFF Deflate"),
    ("tiff_adobe_deflate", "TIFF Adobe Deflate"),
)


class ImageConvertForm(forms.Form):
    # IMPORTANTE: required=False. A view valida presença via request.FILES.getlist("arquivos").
    # Manter required=True aqui causaria 400 antes de lermos os arquivos corretamente.
    arquivos = forms.FileField(
        widget=MultiFileInput,
        required=False,
    )

    # Carregado dinamicamente no __init__ a partir de ImageFormat
    out_ext = forms.ChoiceField(choices=(), required=True)

    jpeg_quality = forms.IntegerField(min_value=1, max_value=95, required=False, initial=85)
    jpeg_progressive = forms.BooleanField(required=False, initial=True)
    webp_quality = forms.IntegerField(min_value=0, max_value=100, required=False, initial=85)
    png_compress_level = forms.IntegerField(min_value=0, max_value=9, required=False, initial=6)
    tiff_compression = forms.ChoiceField(choices=TIFF_COMP_CHOICES, required=False)

    background_hex = forms.RegexField(regex=r"^#[A-Fa-f0-9]{6}$", required=False, initial="#FFFFFF")
    brand_tag = forms.CharField(required=False, initial="ConverteTudo")
    name_style = forms.ChoiceField(choices=NAME_STYLE_CHOICES, required=False, initial="suffix")
    overwrite = forms.BooleanField(required=False, initial=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Carrega formatos a partir do banco (mesmo comportamento que você já tinha)
        qs = ImageFormat.objects.all().only("acronym").order_by("acronym")
        self.fields["out_ext"].choices = [(f.acronym.lower(), f.acronym.upper()) for f in qs]
