from django.urls import path
from . import views

app_name = 'bgremove'

urlpatterns = [
    # URLs da ferramenta de remoção de fundo
    path('background-remover/', views.background_remover, name="background_remover"),
]
