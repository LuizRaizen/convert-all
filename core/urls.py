from django.urls import path
from tools.images.views import images_converter
from tools.bgremove.views import background_remover

app_name = "core"

urlpatterns = [
    path('', images_converter, name="images_converter"),
    path('background-remove/', background_remover, name="background_remover"),
]