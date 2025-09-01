from django.urls import path
from . import views

app_name = "images"

urlpatterns = [
    path("", views.images_converter, name="images_converter"),
    path("processar/", views.process, name="process"),
]
