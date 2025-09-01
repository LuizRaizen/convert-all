from django.apps import AppConfig


class ImagesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tools.images'   # caminho REAL do pacote do app
    label = "images"        # label do app (mantém compatibilidade das migrações)
    verbose_name = "Conversor de Imagens"
