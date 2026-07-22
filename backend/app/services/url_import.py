from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

Resolver = Callable[[str, int], Awaitable[list[str]]]


class UrlImportError(ValueError):
    pass


@dataclass(frozen=True)
class FetchedUrl:
    data: bytes
    final_url: str
    content_type: str


def _is_public_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


async def resolve_host(host: str, port: int) -> list[str]:
    try:
        records = await asyncio.to_thread(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UrlImportError("URL host could not be resolved") from exc
    return sorted({str(record[4][0]) for record in records})


async def validate_remote_url(url: str, resolver: Resolver = resolve_host) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"}:
        raise UrlImportError("Only HTTP and HTTPS URLs are supported")
    if parsed.username or parsed.password:
        raise UrlImportError("URL credentials are not allowed")
    host = parsed.hostname
    if not host or host.casefold() == "localhost" or host.casefold().endswith(".localhost"):
        raise UrlImportError("URL host is not allowed")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in {80, 443}:
        raise UrlImportError("Only standard HTTP and HTTPS ports are allowed")
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = await resolver(host, port)
    if not addresses or any(not _is_public_address(address) for address in addresses):
        raise UrlImportError("URL resolves to a private or unsafe address")


def _validate_peer(response: httpx.Response) -> None:
    stream = response.extensions.get("network_stream")
    if stream is None or not hasattr(stream, "get_extra_info"):
        return
    peer = stream.get_extra_info("server_addr")
    if isinstance(peer, tuple) and peer and not _is_public_address(str(peer[0])):
        raise UrlImportError("URL connected to a private or unsafe address")


async def fetch_url(
    url: str,
    *,
    max_bytes: int,
    timeout_seconds: float,
    max_redirects: int,
    resolver: Resolver = resolve_host,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FetchedUrl:
    current_url = url.strip()
    timeout = httpx.Timeout(timeout_seconds)
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        transport=transport,
        headers={
            "User-Agent": "NexaRead-Importer/1.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    ) as client:
        for redirect_count in range(max_redirects + 1):
            await validate_remote_url(current_url, resolver)
            try:
                async with client.stream("GET", current_url) as response:
                    _validate_peer(response)
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location or redirect_count >= max_redirects:
                            raise UrlImportError("URL redirect limit exceeded")
                        current_url = urljoin(current_url, location)
                        continue
                    if response.status_code < 200 or response.status_code >= 300:
                        raise UrlImportError("URL returned an unsuccessful response")
                    content_type = (
                        response.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
                    )
                    if content_type not in {"text/html", "application/xhtml+xml"}:
                        raise UrlImportError("URL content type is not supported")
                    content_length = response.headers.get("content-length")
                    if content_length and int(content_length) > max_bytes:
                        raise UrlImportError("URL content exceeds the configured size limit")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > max_bytes:
                            raise UrlImportError("URL content exceeds the configured size limit")
                    if not data:
                        raise UrlImportError("URL content is empty")
                    return FetchedUrl(bytes(data), str(response.url), content_type)
            except UrlImportError:
                raise
            except (httpx.HTTPError, TimeoutError) as exc:
                raise UrlImportError("URL could not be fetched safely") from exc
    raise UrlImportError("URL redirect limit exceeded")
