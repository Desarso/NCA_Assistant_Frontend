from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
import os
import mimetypes
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import re

local_files_router = APIRouter()

# Base directory for agent-created files organized by chat ID
AGENT_FILES_BASE = "./agent_files"

# Allowed directories pattern for agent files
def is_agent_file_path(file_path: str) -> bool:
    """Check if path is within agent files structure: ./agent_files/{chat_id}/..."""
    normalized_path = os.path.normpath(file_path)
    return normalized_path.startswith("./agent_files/") or normalized_path.startswith("agent_files/")

def is_safe_path(file_path: str) -> bool:
    """
    Validate that the file path is safe and within agent files directory.
    Prevents path traversal attacks and limits access to agent-created files only.
    """
    try:
        # Normalize the path to resolve any .. or . components
        normalized_path = os.path.normpath(file_path)
        
        # Check if it's within the agent files structure
        if not is_agent_file_path(normalized_path):
            return False
        
        # Convert to absolute path for additional security checks
        abs_path = os.path.abspath(normalized_path)
        agent_files_abs = os.path.abspath(AGENT_FILES_BASE)
        
        # Ensure the absolute path is within the agent files directory
        try:
            return abs_path.startswith(agent_files_abs + os.sep) or abs_path == agent_files_abs
        except (OSError, ValueError):
            return False
        
    except (OSError, ValueError):
        return False

def get_content_type(file_path: str) -> str:
    """
    Determine the content type based on file extension.
    """
    content_type, _ = mimetypes.guess_type(file_path)
    if content_type:
        return content_type
    
    # Fallback for common file types
    extension = Path(file_path).suffix.lower()
    
    content_type_map = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.csv': 'text/csv',
        '.xml': 'application/xml',
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.zip': 'application/zip',
        '.py': 'text/x-python',
        '.yaml': 'application/x-yaml',
        '.yml': 'application/x-yaml',
    }
    
    return content_type_map.get(extension, 'application/octet-stream')

@local_files_router.get("/serve/{file_path:path}")
async def serve_local_file(file_path: str):
    """
    Serve a local file created by the agent for download.
    
    Args:
        file_path: Relative path to the file within allowed directories
    """
    try:
        # Security validation
        if not is_safe_path(file_path):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied: File path not allowed: {file_path}"
            )
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404, 
                detail=f"File not found: {file_path}"
            )
        
        # Additional security check - ensure it's actually a file
        if not os.path.isfile(file_path):
            raise HTTPException(
                status_code=400, 
                detail=f"Path is not a file: {file_path}"
            )
        
        # Get content type
        content_type = get_content_type(file_path)
        
        # Return file response with download headers
        return FileResponse(
            path=file_path,
            media_type=content_type,
            filename=os.path.basename(file_path),
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "SAMEORIGIN",
                "Content-Disposition": f"attachment; filename=\"{os.path.basename(file_path)}\""
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error serving file: {str(e)}"
        )

@local_files_router.get("/view/{file_path:path}")
async def view_local_file(file_path: str):
    """
    View a local file created by the agent directly in the browser (for HTML, images, etc.).
    
    Args:
        file_path: Relative path to the file within allowed directories
    """
    try:
        # Security validation
        if not is_safe_path(file_path):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied: File path not allowed: {file_path}"
            )
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404, 
                detail=f"File not found: {file_path}"
            )
        
        # Additional security check - ensure it's actually a file
        if not os.path.isfile(file_path):
            raise HTTPException(
                status_code=400, 
                detail=f"Path is not a file: {file_path}"
            )
        
        # Get content type
        content_type = get_content_type(file_path)
        
        # Determine if this is a viewable file type
        viewable_types = {
            'text/html', 'text/css', 'application/javascript', 'text/javascript',
            'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
            'text/plain', 'text/markdown', 'application/json', 'text/csv',
            'application/pdf'
        }
        
        if content_type not in viewable_types:
            # For non-viewable files, redirect to download endpoint
            raise HTTPException(
                status_code=400, 
                detail=f"File type {content_type} is not viewable in browser. Use the /serve/ endpoint to download."
            )
        
        # Return file response for inline viewing
        return FileResponse(
            path=file_path,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "SAMEORIGIN",
                # No Content-Disposition header = inline viewing
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error viewing file: {str(e)}"
        )

@local_files_router.get("/list/{directory_path:path}")
async def list_local_files(
    directory_path: str = "",
    include_hidden: bool = Query(False, description="Include hidden files"),  
    file_type: Optional[str] = Query(None, description="Filter by file extension (e.g., 'html', 'css')"),
):
    """
    List files in a local directory.
    
    Args:
        directory_path: Relative path to the directory within allowed directories
        include_hidden: Whether to include hidden files
        file_type: Filter by file extension
    """
    try:
        # Default to listing available chat IDs if no path provided
        if not directory_path:
            chat_dirs = []
            if os.path.exists(AGENT_FILES_BASE) and os.path.isdir(AGENT_FILES_BASE):
                for chat_id in os.listdir(AGENT_FILES_BASE):
                    chat_path = os.path.join(AGENT_FILES_BASE, chat_id)
                    if os.path.isdir(chat_path):
                        try:
                            stat_info = os.stat(chat_path)
                            chat_dirs.append({
                                "name": chat_id,
                                "path": f"agent_files/{chat_id}",
                                "type": "directory", 
                                "size": None,
                                "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                            })
                        except OSError:
                            continue
            
            return JSONResponse({
                "success": True,
                "items": chat_dirs,
                "directory_path": "agent_files/",
                "total_items": len(chat_dirs)
            })
        
        # Security validation
        if not is_safe_path(directory_path):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied: Directory path not allowed: {directory_path}"
            )
        
        # Check if directory exists
        if not os.path.exists(directory_path):
            raise HTTPException(
                status_code=404, 
                detail=f"Directory not found: {directory_path}"
            )
        
        if not os.path.isdir(directory_path):
            raise HTTPException(
                status_code=400, 
                detail=f"Path is not a directory: {directory_path}"
            )
        
        # List directory contents
        items = []
        for item_name in os.listdir(directory_path):
            # Skip hidden files unless requested
            if not include_hidden and item_name.startswith('.'):
                continue
            
            item_path = os.path.join(directory_path, item_name)
            is_dir = os.path.isdir(item_path)
            
            # Filter by file type if specified
            if file_type and not is_dir:
                if not item_name.lower().endswith(f'.{file_type.lower()}'):
                    continue
            
            try:
                stat_info = os.stat(item_path)
                
                if is_dir:
                    items.append({
                        "name": item_name,
                        "path": item_path,
                        "type": "directory",
                        "size": None,
                        "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                        "url": None,
                        "content_type": None
                    })
                else:
                    content_type = get_content_type(item_path)
                    
                    # Determine if viewable in browser
                    viewable_types = {
                        'text/html', 'text/css', 'application/javascript', 'text/javascript',
                        'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
                        'text/plain', 'text/markdown', 'application/json', 'text/csv',
                        'application/pdf'
                    }
                    is_viewable = content_type in viewable_types
                    
                    file_info = {
                        "name": item_name,
                        "path": item_path,
                        "type": "file",
                        "size": stat_info.st_size,
                        "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                        "download_url": f"/api/v1/local-files/serve/{item_path}",
                        "content_type": content_type,
                        "viewable_in_browser": is_viewable
                    }
                    
                    # Add view URL for viewable files
                    if is_viewable:
                        file_info["view_url"] = f"/api/v1/local-files/view/{item_path}"
                    
                    items.append(file_info)
                    
            except OSError:
                # Skip items that can't be accessed
                continue
        
        # Sort: directories first, then files
        items.sort(key=lambda x: (x["type"] == "file", x["name"].lower()))
        
        return JSONResponse({
            "success": True,
            "items": items,
            "directory_path": directory_path,
            "total_items": len(items)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error listing directory: {str(e)}"
        )

@local_files_router.get("/info/{file_path:path}")
async def get_local_file_info(file_path: str):
    """
    Get information about a local file.
    
    Args:
        file_path: Relative path to the file within allowed directories
    """
    try:
        # Security validation
        if not is_safe_path(file_path):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied: File path not allowed: {file_path}"
            )
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404, 
                detail=f"File not found: {file_path}"
            )
        
        is_dir = os.path.isdir(file_path)
        stat_info = os.stat(file_path)
        
        file_info = {
            "name": os.path.basename(file_path),
            "path": file_path,
            "type": "directory" if is_dir else "file",
            "size": None if is_dir else stat_info.st_size,
            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
            "created": datetime.fromtimestamp(stat_info.st_ctime).isoformat(),
            "url": f"/api/v1/local-files/serve/{file_path}" if not is_dir else None,
            "content_type": None if is_dir else get_content_type(file_path),
            "readable": os.access(file_path, os.R_OK),
            "writable": os.access(file_path, os.W_OK)
        }
        
        return JSONResponse({
            "success": True,
            "file_info": file_info
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error getting file info: {str(e)}"
        )

@local_files_router.delete("/{file_path:path}")
async def delete_local_file(file_path: str):
    """
    Delete a local file (with proper security checks).
    
    Args:
        file_path: Relative path to the file within allowed directories
    """
    try:
        # Security validation
        if not is_safe_path(file_path):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied: File path not allowed: {file_path}"
            )
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404, 
                detail=f"File not found: {file_path}"
            )
        
        # Only allow deletion of files, not directories (for safety)
        if os.path.isdir(file_path):
            raise HTTPException(
                status_code=400, 
                detail="Directory deletion not allowed for security reasons"
            )
        
        # Delete the file
        os.remove(file_path)
        
        return JSONResponse({
            "success": True,
            "message": f"File deleted successfully: {file_path}"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error deleting file: {str(e)}"
        ) 