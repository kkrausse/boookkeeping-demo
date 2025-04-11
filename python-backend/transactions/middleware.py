import time
import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class RequestTimingMiddleware(MiddlewareMixin):
    """
    Middleware that logs the time taken to process a request.
    """
    def process_request(self, request):
        request.start_time = time.time()

    def process_response(self, request, response):
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time
            path = request.path
            method = request.method
            
            # Log more details for API endpoints
            if path.startswith('/api/'):
                status_code = response.status_code
                query_params = dict(request.GET.items())
                content_length = response.get('Content-Length', '-')
                
                logger.info(
                    f"Request: {method} {path} | Status: {status_code} | "
                    f"Duration: {duration:.3f}s | Params: {query_params} | "
                    f"Response size: {content_length} bytes"
                )
            else:
                # Simpler log for non-API requests
                logger.info(f"Request: {method} {path} | Duration: {duration:.3f}s")
                
        return response