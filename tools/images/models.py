from django.db import models

class ImageFormat(models.Model):
    """Um formato de imagem para conversão."""
    acronym = models.CharField(max_length=20)
    file_extension = models.CharField(max_length=50)
    format_name = models.CharField(max_length=60)
    description = models.TextField()

    class Meta:
        verbose_name = "Formato de Imagem"
        verbose_name_plural = "Formatos de Imagem"


