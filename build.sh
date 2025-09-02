#!/usr/bin/env bash
set -o errexit

# Instala dependências
pip install -r requirements.txt

# Coleta estáticos e aplica migrações
python manage.py collectstatic --no-input
python manage.py migrate
