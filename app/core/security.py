import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.core.config import get_settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(api_key: Annotated[str | None, Depends(api_key_header)]):
    expected = get_settings().api_key
    if not expected:
        return
    # compare_digest takes the same time wherever the strings differ, so response
    # timing can't be used to guess the key character by character.
    if not api_key or not secrets.compare_digest(api_key, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing API key")
