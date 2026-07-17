import asyncio
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Any

import boto3  # type: ignore[import-untyped]
from botocore.exceptions import BotoCoreError, ClientError  # type: ignore[import-untyped]

from app.core.config import Settings, get_settings


class StorageError(RuntimeError):
    pass


class StorageService(ABC):
    @abstractmethod
    async def ensure_bucket(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def download(self, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, key: str) -> None:
        raise NotImplementedError


class S3StorageService(StorageService):
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.s3_bucket
        self._region = settings.s3_region
        self._client: Any = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    async def ensure_bucket(self) -> None:
        try:
            await asyncio.to_thread(self._ensure_bucket_sync)
        except (BotoCoreError, ClientError, OSError) as exc:
            raise StorageError("Object storage is unavailable") from exc

    def _ensure_bucket_sync(self) -> None:
        buckets = self._client.list_buckets().get("Buckets", [])
        if any(bucket.get("Name") == self._bucket for bucket in buckets):
            return

        parameters: dict[str, Any] = {"Bucket": self._bucket}
        if self._region != "us-east-1":
            parameters["CreateBucketConfiguration"] = {"LocationConstraint": self._region}
        self._client.create_bucket(**parameters)

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        try:
            await asyncio.to_thread(
                self._client.put_object,
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        except (BotoCoreError, ClientError, OSError) as exc:
            raise StorageError("Could not store document") from exc

    async def delete(self, key: str) -> None:
        try:
            await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError, OSError) as exc:
            raise StorageError("Could not delete stored document") from exc

    async def download(self, key: str) -> bytes:
        try:
            response = await asyncio.to_thread(
                self._client.get_object, Bucket=self._bucket, Key=key
            )
            return await asyncio.to_thread(response["Body"].read)
        except (BotoCoreError, ClientError, OSError, KeyError) as exc:
            raise StorageError("Could not read stored document") from exc


@lru_cache
def get_storage_service() -> StorageService:
    return S3StorageService(get_settings())


async def ensure_storage_ready() -> None:
    await get_storage_service().ensure_bucket()
