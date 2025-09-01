from django.urls import path
from . import views

app_name = 'documents'

urlpatterns = [
    # URLs do conversor de documentos
    path('documents-converter/', views.documents_converter, name='documents-converter'),
]