from django.shortcuts import render

def documents_converter(request):
    return render(request, 'documents-converter.html')
