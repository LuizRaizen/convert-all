from django.contrib import admin
from .models import ImageFormat

@admin.register(ImageFormat)
class ImageFormatAdmin(admin.ModelAdmin):
    """Configurações do modelo ImageFormat no site admin."""
    list_display = ('acronym', 'file_extension', 'format_name', 'description',)
    search_fields = ('acronym', 'file_extension', 'format_name',)
    list_filter = ('acronym',)