"""
Django settings for convert_all project.
"""

from pathlib import Path
import os
import dj_database_url

# =========================================================
# Paths / Base
# =========================================================
BASE_DIR = Path(__file__).resolve().parent.parent

# =========================================================
# Core / Debug
# =========================================================
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "dev-inseguro-mm&ik)$wmcq-1a%w3mb*6jbi&=(zjfo1@ce@t&hovp4d9csk9(",
)

# Se a variável RENDER existir, DEBUG = False
DEBUG = not bool(os.environ.get("RENDER"))

ALLOWED_HOSTS: list[str] = ["127.0.0.1", "localhost"]
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
# quando conectar domínio:
# ALLOWED_HOSTS += ["converte-tudo-online.com.br", "www.converte-tudo-online.com.br"]

# =========================================================
# Apps
# =========================================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Meus Apps
    'core',
    'tools.images.apps.ImagesConfig',
    'tools.bgremove.apps.BgremoveConfig',
    'tools.documents.apps.DocumentsConfig',
]

# =========================================================
# Middleware
# =========================================================
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # estáticos em produção
    "core.middleware.UploadLimitMiddleware",       # aplica 413 p/ excesso de bytes (free/premium)
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "convert_all.urls"

# =========================================================
# Templates
# =========================================================
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],  # templates nos apps
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                # Exponde limites/URLs ao front
                "core.context_processors.plan_limits",
            ],
        },
    },
]

WSGI_APPLICATION = "convert_all.wsgi.application"
ASGI_APPLICATION = "convert_all.asgi.application"

# =========================================================
# Database (sqlite dev / Postgres prod)
# =========================================================
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        ssl_require=False,
    )
}

# =========================================================
# Password validators
# =========================================================
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# =========================================================
# i18n / tz
# =========================================================
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

# =========================================================
# Static / Media
# =========================================================
STATIC_URL = "/static/"
if not DEBUG:
    STATIC_ROOT = BASE_DIR / "staticfiles"
    STORAGES = {
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        }
    }

MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = "/media/"
FILE_UPLOAD_TEMP_DIR = str((MEDIA_ROOT / "_tmp_uploads").resolve())

MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
Path(FILE_UPLOAD_TEMP_DIR).mkdir(parents=True, exist_ok=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# =========================================================
# Segurança extra em produção
# =========================================================
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 7  # 1 semana
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False

    CSRF_TRUSTED_ORIGINS = []
    if RENDER_EXTERNAL_HOSTNAME:
        CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")
    # CSRF_TRUSTED_ORIGINS += [
    #     "https://converte-tudo-online.com.br",
    #     "https://www.converte-tudo-online.com.br",
    # ]

# =========================================================
# Uploads / Limites
# =========================================================
FILE_UPLOAD_MAX_MEMORY_SIZE = 0
FILE_UPLOAD_HANDLERS = ["django.core.files.uploadhandler.TemporaryFileUploadHandler"]
DATA_UPLOAD_MAX_NUMBER_FIELDS = 100_000
DATA_UPLOAD_MAX_MEMORY_SIZE = 1_024 * 1_024 * 1_024  # 1 GB

# =========================================================
# Planos / Limites
# =========================================================
UPLOAD_LIMITS = {
    "FREE_MAX_TOTAL_UPLOAD_BYTES": int(15 * 1024 * 1024),  # 15 MB
    "FREE_MAX_FILES": 25,
    "PREMIUM_MAX_TOTAL_UPLOAD_BYTES": int(1024 * 1024 * 1024),  # 1 GB
    "PREMIUM_MAX_FILES": 5000,
}

CURRENT_PLAN = "free"

if CURRENT_PLAN == "premium":
    ACTIVE_MAX_BYTES = UPLOAD_LIMITS["PREMIUM_MAX_TOTAL_UPLOAD_BYTES"]
    ACTIVE_MAX_FILES = UPLOAD_LIMITS["PREMIUM_MAX_FILES"]
else:
    ACTIVE_MAX_BYTES = UPLOAD_LIMITS["FREE_MAX_TOTAL_UPLOAD_BYTES"]
    ACTIVE_MAX_FILES = UPLOAD_LIMITS["FREE_MAX_FILES"]

DATA_UPLOAD_MAX_NUMBER_FILES = int(ACTIVE_MAX_FILES)
UPGRADE_URL = "/premium"

# =========================================================
# Logs básicos
# =========================================================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
