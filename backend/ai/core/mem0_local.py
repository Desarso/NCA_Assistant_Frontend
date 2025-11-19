import os
from mem0 import Memory
import requests
from requests.exceptions import RequestException
import logging

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

#Set up logging
# logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)



def verify_qdrant_connection(url: str, api_key: str) -> bool:
    try:
        headers = {"api-key": api_key}
        response = requests.get(url, headers=headers, timeout=5)
        logger.debug(f"Qdrant health check response: {response.status_code}")
        return response.status_code == 200
    except RequestException as e:
        logger.error(f"Qdrant connection error: {str(e)}")
        return False

qdrant_api_key = os.getenv("QDRANT_API_KEY")

# Debug: Check OpenAI API key
openai_api_key = os.getenv("OPENAI_API_KEY")
print(f"DEBUG: OpenAI API Key present: {bool(openai_api_key)}")
print(f"DEBUG: OpenAI API Key suffix: {openai_api_key[-10:] if openai_api_key else 'None'}")

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "qdrant.whagons.com",
            "port": 443,
            "api_key": qdrant_api_key
        }
    },
    "llm": {
        "provider": "litellm",
        "config": {
            "api_key": os.getenv("GEMINI_API_KEY"),
            "model": "gemini/gemini-2.0-flash-lite"
        }
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "api_key": os.getenv("OPENAI_API_KEY"),
            "model": "text-embedding-3-small"
        }
    },
    "history_db_path": "db/history.db",
    "version": "v1.1",
}

# Only add graph_store if Neo4j credentials are provided
neo4j_url = os.getenv("NEO4J_URL")
neo4j_username = os.getenv("NEO4J_USERNAME")
neo4j_password = os.getenv("NEO4J_PASSWORD")

if neo4j_url and neo4j_username and neo4j_password:
    config["graph_store"] = {
        "provider": "neo4j",
        "config": {
            "url": neo4j_url,
            "username": neo4j_username,
            "password": neo4j_password
        }
    }
# m = Memory.from_config(config)


try:
    logger.debug(f"Attempting to connect to Qdrant at https://qdrant.whagons.com")
    if not verify_qdrant_connection("https://qdrant.whagons.com", qdrant_api_key):
        raise ConnectionError("Could not connect to Qdrant server")
    
    logger.debug("Initializing Memory client...")
    m = Memory.from_config(config)
    logger.debug("Memory client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Memory: {str(e)}", exc_info=True)
    m = None


