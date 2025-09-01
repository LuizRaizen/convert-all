from django.apps import AppConfig


class BgremoveConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tools.bgremove'   # caminho REAL do pacote do app
    label = "bgremove"        # label do app (mantém compatibilidade das migrações)
    verbose_name = "Removedor de Fundo"
