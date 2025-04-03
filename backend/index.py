from __future__ import annotations as _annotations
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
from routes.chats_router import chats_router
from routes.user_routes import user_router
from routes.files_router import files_router
from contextlib import asynccontextmanager
import os

from helpers.Firebase_helpers import FirebaseUser, get_current_user, role_based_access
from ai.models import (
    create_db_and_tables,
)
from dotenv import load_dotenv


load_dotenv()


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

    # Initialize Firebase Admin SDK if not already initialized
    if not firebase_admin._apps:
        from firebase.firebase_credentials import get_firebase_credentials
        cred = credentials.Certificate(get_firebase_credentials())
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
        })

    yield
    # Clean up resources if needed


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
        "https://nca-assistant.gabrielmalek.com",
        "https://nca-assistant.development.gabrielmalek.com",
        ],  # Get frontend URL from env
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Firebase auth bearer for API endpoints

# OAuth2 password bearer for Swagger UI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")



# This are an example we can discuss as a group

#####################################################
# Chats Router Configuration
#####################################################
chat_routes = APIRouter(prefix="/api/v1", tags=["chat"])
# Add Firebase authentication dependency to base router, needs base role
chat_routes.dependencies.append(Depends(role_based_access(["whitelisted"])))
chat_routes.include_router(chats_router)

#####################################################


#####################################################
# Files Router Configuration
#####################################################
files_routes = APIRouter(prefix="/api/v1/files", tags=["files"])
# Add Firebase authentication dependency to base router, needs base role
files_routes.dependencies.append(Depends(role_based_access(["whitelisted"])))
files_routes.include_router(files_router)

#####################################################


#####################################################
# Users Router Configuration 
#####################################################
user_routes = APIRouter(prefix="/api/v1", tags=["user"])
user_routes.dependencies.append(Depends(role_based_access(["whitelisted"])))
user_routes.include_router(user_router)

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
app.include_router(user_routes)
app.include_router(files_routes)
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True, proxy_headers=True, forwarded_allow_ips="*")
