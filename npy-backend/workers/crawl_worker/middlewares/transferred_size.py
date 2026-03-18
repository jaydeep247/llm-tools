"""
Transferred Size Middleware
Captures the raw (compressed / on-the-wire) body length *before*
Scrapy's HttpCompressionMiddleware decompresses it.

The value is stored in ``response.meta['transferred_size']`` so the
spider can report an accurate "Transferred (bytes)" metric that
matches Screaming Frog's field.

Must be configured with a priority **higher** than
``HttpCompressionMiddleware`` (590) so that its ``process_response``
runs first in the reverse-order response chain.  A value of 591 works.
"""

from scrapy.http import Request, Response


class TransferredSizeMiddleware:
    """Store the pre-decompression body length in response.meta."""

    def process_response(self, request: Request, response: Response, spider) -> Response:
        # At this point response.body is still the raw bytes from the wire
        # (gzip/br/deflate compressed if the server applied encoding).
        # Guard: response.meta proxies to response.request.meta — if
        # the response has no associated request the attribute is unavailable.
        if response.request is not None:
            response.meta['transferred_size'] = len(response.body)
        return response
