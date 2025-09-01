from django.core.exceptions import TooManyFilesSent
from django.http import JsonResponse

class UploadLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except TooManyFilesSent as e:
            return JsonResponse(
                {
                    "ok": False,
                    "code": "LIMIT_NUM_FILES_EXCEEDED",
                    "message": "Quantidade de arquivos por envio excedida.",
                },
                status=413,
            )
