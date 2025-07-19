from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import uuid
from typing import List, Optional
from datetime import datetime, timedelta

files_router = APIRouter()

# Digital Ocean Spaces configuration
DO_SPACES_ENDPOINT = "https://fra1.digitaloceanspaces.com"
DO_SPACES_BUCKET = "whagons5"
DO_SPACES_REGION = "fra1" 
CDN_ENDPOINT = "https://whagons5.fra1.cdn.digitaloceanspaces.com"

# Environment variables
DO_SPACES_ACCESS_KEY = os.getenv("DO_SPACES_ACCESS_KEY")
DO_SPACES_SECRET_KEY = os.getenv("DO_SPACES_SECRET_KEY")

def get_s3_client():
    """Create and return an S3 client configured for Digital Ocean Spaces"""
    if not DO_SPACES_ACCESS_KEY or not DO_SPACES_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Digital Ocean Spaces credentials not configured")
    
    return boto3.client(
        's3',
        endpoint_url=DO_SPACES_ENDPOINT,
        aws_access_key_id=DO_SPACES_ACCESS_KEY,
        aws_secret_access_key=DO_SPACES_SECRET_KEY,
        region_name=DO_SPACES_REGION
    )

@files_router.get("/list")
async def list_files():
    """List all files in the Digital Ocean Space"""
    try:
        s3_client = get_s3_client()
        
        response = s3_client.list_objects_v2(Bucket=DO_SPACES_BUCKET)
        
        files = []
        if 'Contents' in response:
            for obj in response['Contents']:
                file_info = {
                    "id": obj['Key'],
                    "name": obj['Key'].split('/')[-1],  # Get filename from key
                    "size": obj['Size'],
                    "last_modified": obj['LastModified'].isoformat(),
                    "url": f"{CDN_ENDPOINT}/{obj['Key']}"
                }
                files.append(file_info)
        
        return JSONResponse({"files": files})
        
    except ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Digital Ocean Spaces error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@files_router.get("/{file_id}")
async def get_file(file_id: str):
    """Get file information by ID (key)"""
    try:
        s3_client = get_s3_client()
        
        # Get object metadata
        response = s3_client.head_object(Bucket=DO_SPACES_BUCKET, Key=file_id)
        
        file_info = {
            "id": file_id,
            "name": file_id.split('/')[-1],
            "size": response['ContentLength'],
            "content_type": response.get('ContentType', 'application/octet-stream'),
            "last_modified": response['LastModified'].isoformat(),
            "url": f"{CDN_ENDPOINT}/{file_id}"
        }
        
        return JSONResponse(file_info)
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(
            status_code=500,
            detail=f"Digital Ocean Spaces error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@files_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to Digital Ocean Spaces"""
    try:
        s3_client = get_s3_client()
        
        # Generate unique file key with timestamp and UUID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else ''
        unique_id = str(uuid.uuid4())[:8]
        
        # Create file key with folder structure
        file_key = f"nca-assistant-files/{timestamp}_{unique_id}_{file.filename}"
        
        # Read file content
        file_content = await file.read()
        
        # Upload to Digital Ocean Spaces
        s3_client.put_object(
            Bucket=DO_SPACES_BUCKET,
            Key=file_key,
            Body=file_content,
            ContentType=file.content_type or 'application/octet-stream',
            ACL='public-read'  # Make file publicly accessible
        )
        
        # Return file information
        file_url = f"{CDN_ENDPOINT}/{file_key}"
        
        return JSONResponse({
            "id": file_key,
            "url": file_url,
            "name": file.filename,
            "size": len(file_content),
            "content_type": file.content_type
        })
        
    except ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Digital Ocean Spaces error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@files_router.delete("/{file_id}")
async def delete_file(file_id: str):
    """Delete a file from Digital Ocean Spaces"""
    try:
        s3_client = get_s3_client()
        
        # Check if file exists first
        try:
            s3_client.head_object(Bucket=DO_SPACES_BUCKET, Key=file_id)
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise HTTPException(status_code=404, detail="File not found")
            raise
        
        # Delete the file
        s3_client.delete_object(Bucket=DO_SPACES_BUCKET, Key=file_id)
        
        return JSONResponse({
            "message": "File deleted successfully",
            "id": file_id
        })
        
    except HTTPException:
        raise
    except ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Digital Ocean Spaces error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Optional: Add a presigned URL endpoint for direct client uploads
@files_router.post("/presigned-url")
async def get_presigned_upload_url(filename: str, content_type: str = "application/octet-stream"):
    """Generate a presigned URL for direct file upload from client"""
    try:
        s3_client = get_s3_client()
        
        # Generate unique file key
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        file_key = f"nca-assistant-files/{timestamp}_{unique_id}_{filename}"
        
        # Generate presigned URL for PUT operation
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': DO_SPACES_BUCKET,
                'Key': file_key,
                'ContentType': content_type,
                'ACL': 'public-read'
            },
            ExpiresIn=3600  # URL expires in 1 hour
        )
        
        return JSONResponse({
            "upload_url": presigned_url,
            "file_key": file_key,
            "public_url": f"{CDN_ENDPOINT}/{file_key}",
            "expires_in": 3600
        })
        
    except ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Digital Ocean Spaces error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
