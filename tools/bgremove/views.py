from django.shortcuts import render

def background_remover(request):
    return render(request, 'background-remover.html')
