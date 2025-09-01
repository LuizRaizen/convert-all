from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tools.documents'   # caminho REAL do pacote do app
    label = "documents"        # label do app (mantém compatibilidade das migrações)
    verbose_name = "Conversor de Documentos"
