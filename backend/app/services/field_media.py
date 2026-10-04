"""Private Neon S3-compatible image evidence; no public bucket ACLs."""
from io import BytesIO
import uuid
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
import boto3
from botocore.config import Config
from backend.app.core.config import settings

MAX_UPLOAD = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000


def storage_client():
    if not all((settings.AWS_ACCESS_KEY_ID, settings.AWS_SECRET_ACCESS_KEY, settings.AWS_ENDPOINT_URL_S3)):
        raise HTTPException(503, "Private image storage is not configured. You can submit a text report.")
    return boto3.client("s3", endpoint_url=settings.AWS_ENDPOINT_URL_S3,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID, aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION, config=Config(signature_version="s3v4", s3={"addressing_style":"path"},
            connect_timeout=5, read_timeout=15, retries={"max_attempts":2}))


def require_owned_key(key, reporter):
    if not key.startswith(f"field/{reporter}/") or ".." in key or not key.endswith(".jpg"):
        raise HTTPException(403, "Evidence access belongs to the reporting device.")


def save_image(content, reporter):
    if len(content) > MAX_UPLOAD: raise HTTPException(413, "Use an image smaller than 5 MB.")
    try:
        image = Image.open(BytesIO(content))
        if image.format not in {"JPEG", "PNG", "WEBP"}: raise ValueError("unsupported image")
        image.load()
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1600,1600))
        output=BytesIO()
        # Re-encoding omits EXIF/GPS, file names and other identifying metadata.
        image.save(output,format="JPEG",quality=82)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Upload a valid JPEG, PNG or WebP image.")
    key=f"field/{reporter}/{uuid.uuid4().hex}.jpg"
    try:
        storage_client().put_object(Bucket=settings.NEON_UPLOADS_BUCKET, Key=key, Body=output.getvalue(), ContentType="image/jpeg")
    except HTTPException: raise
    except Exception: raise HTTPException(503, "Image was not saved. Submit text or retry later.")
    return {"key":key,"content_type":"image/jpeg","size_bytes":len(output.getvalue()),"access":"private"}


def validate_media_keys(keys, reporter):
    for key in keys:
        require_owned_key(key,reporter)
        try:
            metadata=storage_client().head_object(Bucket=settings.NEON_UPLOADS_BUCKET,Key=key)
            if metadata.get("ContentType")!="image/jpeg" or metadata.get("ContentLength",0)>MAX_UPLOAD:
                raise HTTPException(422,"Invalid image evidence.")
        except HTTPException: raise
        except Exception: raise HTTPException(422,"Image evidence is unavailable or was not uploaded.")


def download_url(key, reporter):
    validate_media_keys([key],reporter)
    return {"url":storage_client().generate_presigned_url("get_object",Params={"Bucket":settings.NEON_UPLOADS_BUCKET,"Key":key},ExpiresIn=60),"expires_in_seconds":60}
