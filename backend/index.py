from __future__ import annotations
import os
import sys
# Ensure import path includes backend root when running in containers
try:
    cwd = os.path.dirname(os.path.abspath(__file__))
    backend_root = cwd
    project_root = os.path.dirname(backend_root)
    for p in [project_root, backend_root]:
        if p not in sys.path:
            sys.path.append(p)
except Exception:
    pass
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi import Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    OAuth2PasswordBearer,
)
from fastapi.openapi.docs import get_swagger_ui_html
import fastapi
import firebase_admin
from firebase_admin import credentials
from routes.chats_router import chats_router, ws_chats_router
from routes.conversations_router import conversations_router
from routes.user_routes import user_router
from routes.files_router import files_router
from routes.local_files_router import local_files_router
from routes.workflows_router import router as workflows_router
from contextlib import asynccontextmanager
import os
import asyncio

from helpers.Firebase_helpers import FirebaseUser, get_current_user, role_based_access
from database.models import (
    create_db_and_tables,
)
from ai.workflows.workflow_scheduler import run_scheduler_background

# Load .env file only in development (not in production where Coolify exports env vars)
is_production = (
    os.getenv("ENVIRONMENT", "").lower() == "production" or
    os.getenv("ENV", "").lower() == "production" or
    os.getenv("PRODUCTION", "").lower() == "true" or
    os.getenv("NODE_ENV", "").lower() == "production"
)

if not is_production:
    from dotenv import load_dotenv
    load_dotenv()

# Configure streaming logger when STREAM_DEBUG=1
import logging
import os as _os
if _os.getenv("STREAM_DEBUG", "0") == "1":
    _stream_logger = logging.getLogger("chat.stream")
    _stream_logger.setLevel(logging.INFO)
    if not _stream_logger.handlers:
        _handler = logging.StreamHandler()
        _handler.setLevel(logging.INFO)
        _formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        _handler.setFormatter(_formatter)
        _stream_logger.addHandler(_handler)
    _stream_logger.propagate = False


THIS_DIR = Path(__file__).parent
# Create an instance of your tools

PRISM_COMPONENTS_DIR = Path("./prismjs/components")  # Relative
# Validate that the directory exists when the app starts.  Important!
if not PRISM_COMPONENTS_DIR.is_dir():
    raise ValueError(f"Prism components directory not found: {PRISM_COMPONENTS_DIR}")




@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    # Initialize database on startup
    create_db_and_tables()

    # Seed default permissions and roles
    try:
        from database.seed_permissions import seed_permissions_and_roles
        seed_permissions_and_roles()
    except Exception as e:
        logging.error(f"Failed to seed permissions and roles: {e}", exc_info=True)
        # Don't fail startup, but log the error

    # Initialize Firebase Admin SDK if not already initialized
    if not firebase_admin._apps:
        from firebase.firebase_credentials import get_firebase_credentials
        cred = credentials.Certificate(get_firebase_credentials())
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
        })

    # Start the workflow scheduler in the background
    scheduler_task = asyncio.create_task(run_scheduler_background())

    yield
    
    # Clean up resources
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass


app = fastapi.FastAPI(
    lifespan=lifespan,
    title="Microsoft API Backend",
    description="API for Microsoft AI Services with Firebase authentication",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL"),
        "http://localhost:3000",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4173",
        "https://nca-assistant.gabrielmalek.com",
        "https://nca-assistant.development.gabrielmalek.com",
        "https://nca-assistant.whagons.com",
        ],  # Get frontend URL from env
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"],  # Expose all headers
)

# Firebase auth bearer for API endpoints

# OAuth2 password bearer for Swagger UI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")



# This are an example we can discuss as a group

#####################################################
# Chats Router Configuration
#####################################################
chat_routes = APIRouter(prefix="/api/v1", tags=["chat"])
# Add Firebase authentication dependency - all authenticated NCA users can access
chat_routes.dependencies.append(Depends(get_current_user))
chat_routes.include_router(chats_router)

# WebSocket routes cannot use HTTP dependency injection; expose under same prefix without auth dependency
ws_chat_routes = APIRouter(prefix="/api/v1", tags=["chat-ws"])
ws_chat_routes.include_router(ws_chats_router)

#####################################################
# Conversations Router Configuration
#####################################################
conversations_routes = APIRouter(prefix="/api/v1", tags=["conversations"])
# Add Firebase authentication dependency - all authenticated NCA users can access
conversations_routes.dependencies.append(Depends(get_current_user))
conversations_routes.include_router(conversations_router)

#####################################################


#####################################################
# Files Router Configuration
#####################################################
files_routes = APIRouter(prefix="/api/v1/files", tags=["files"])
# Add Firebase authentication dependency - all authenticated NCA users can access
files_routes.dependencies.append(Depends(get_current_user))
files_routes.include_router(files_router)

#####################################################


#####################################################
# Users Router Configuration 
#####################################################
user_routes = APIRouter(prefix="/api/v1", tags=["user"])
# Add Firebase authentication dependency - all authenticated NCA users can access
user_routes.dependencies.append(Depends(get_current_user))
user_routes.include_router(user_router)

#####################################################


#####################################################
# Workflows Router Configuration
#####################################################
workflow_routes = APIRouter(prefix="/api/v1", tags=["workflows"])
# Add Firebase authentication dependency - all authenticated NCA users can access
workflow_routes.dependencies.append(Depends(get_current_user))
workflow_routes.include_router(workflows_router)

#####################################################


#####################################################
# Local Files Router Configuration
#####################################################
local_files_routes = APIRouter(prefix="/api/v1/local-files", tags=["local-files"])  
# No authentication needed for agent-created local files
local_files_routes.include_router(local_files_router)

#####################################################






@app.get("/api/prism-language/")
async def get_prism_language(
    name: str = Query(
        ...,
        title="Language Name",
        description="The name of the Prism.js language component to retrieve.",
    ),
    current_user: FirebaseUser = Depends(get_current_user),
):
    """
    Serves Prism.js language components.  Only serves minified .min.js files
    from a specified directory, preventing path traversal vulnerabilities.
    Expects the language name as a query parameter (e.g., ?name=python).
    """

    # Sanitize the language name:  prevent path traversal attacks
    safe_language_name = name.replace("..", "")  # Remove ".."
    safe_language_name = safe_language_name.strip("/")

    # print("hi there", safe_language_name)  # Remove leading/trailing slashes

    filename = f"prism-{safe_language_name}.min.js"
    filepath = PRISM_COMPONENTS_DIR / filename

    # Security check: Verify the file exists *and* is within the allowed directory
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail=f"Language '{name}' not found")

    # Double check (more robust)
    try:
        filepath = filepath.resolve(
            strict=True
        )  # Raise error if the file doesn't exist or is a broken symlink
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Language '{name}' not found")

    if not str(filepath).startswith(
        str(PRISM_COMPONENTS_DIR.resolve())
    ):  # More robust check
        raise HTTPException(
            status_code=403, detail="Access denied:  File is outside allowed directory"
        )

    # Serve the file
    return FileResponse(
        filepath, media_type="application/javascript"
    )  # Correct media ty




# Custom Swagger UI routes
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css",
    )





#include routers in main
app.include_router(chat_routes)
app.include_router(ws_chat_routes)
app.include_router(conversations_routes)
app.include_router(user_routes)
app.include_router(files_routes)
app.include_router(local_files_routes)
app.include_router(workflow_routes)
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True, proxy_headers=True, forwarded_allow_ips="*")
