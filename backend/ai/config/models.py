"""
AI Model Configuration
Centralized configuration for all AI models used in the system.
"""

from pydantic_ai.models.groq import GroqModel
from pydantic_ai.providers.groq import GroqProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider
from pydantic_ai.models import cached_async_http_client
import os
import logging

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Create a custom HTTP client with 5-minute timeout
http_client = cached_async_http_client(timeout=300, connect=5)

# Get GEMINI_API_KEY and validate it's not empty
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key or gemini_api_key.strip() == "":
    logging.warning("GEMINI_API_KEY is not set or is empty. Gemini models will not be available.")
    gemini_api_key = None

# Helper function to create Gemini models only if API key is available
def _create_gemini_models():
    gemini_models = {}
    if gemini_api_key:
        try:
            gemini_provider = GoogleGLAProvider(api_key=gemini_api_key, http_client=http_client)
            gemini_models = {
                "gemini-2.5-flash": GeminiModel("gemini-2.5-flash", provider=gemini_provider),
                "gemini-2.0-flash": GeminiModel("gemini-2.0-flash", provider=gemini_provider),
                "gemini-2.5-flash-lite": GeminiModel("gemini-2.5-flash-lite", provider=gemini_provider),
            }
        except Exception as e:
            logging.error(f"Failed to initialize Gemini models: {e}")
    return gemini_models

# Define available models
models = {
    **_create_gemini_models(),
    # "deepseek-r1-distill-llama-70b": GroqModel(
    #     "deepseek-r1-distill-llama-70b",
    #     provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    #  "llama4-scout": GroqModel(
    #     "meta-llama/llama-4-scout-17b-16e-instruct",
    #     provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    "claude-sonnet-4": OpenAIModel(
        "anthropic/claude-sonnet-4",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
     "llama4-maverick": OpenAIModel(
        "meta-llama/llama-4-maverick",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "gpt-4o-mini": OpenAIModel(
    #     "gpt-4o-mini", provider=OpenAIProvider(api_key=os.getenv("OPENAI_API_KEY"))
    # ),
    "kimi": OpenAIModel(
        "moonshotai/kimi-k2",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "4.1": OpenAIModel(
    #     "openai/gpt-4.1",
    #     provider=OpenAIProvider(
    #         base_url="https://openrouter.ai/api/v1",
    #         api_key=os.getenv("OPENROUTER_API_KEY"),
    #     ),
    # ),
    "qwen3": OpenAIModel(
        "qwen/qwen3-235b-a22b-07-25",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "gpt-oss-120b-groq": GroqModel(
    #     "openai/gpt-oss-120b",
    #      provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    "gpt-oss-120b": OpenAIModel(
        "openai/gpt-oss-120b",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    "gpt-5-mini": OpenAIModel(
        "openai/gpt-5-mini",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    "grok-4-fast": OpenAIModel(
        "x-ai/grok-4-fast",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),

    # "gpt-5": OpenAIModel(
    #     "openai/gpt-5",
    #     provider=OpenAIProvider(
    #         base_url="https://openrouter.ai/api/v1",
    #         api_key=os.getenv("OPENROUTER_API_KEY"),
    #     ),
    # ),
}

# Set default model
DEFAULT_MODEL = "grok-4-fast"

def get_model(model_key: str = None):
    """Get a model by key, fallback to default if not found."""
    if model_key is None:
        model_key = DEFAULT_MODEL
    return models.get(model_key, models[DEFAULT_MODEL])

def get_available_models():
    """Get list of available model keys."""
    return list(models.keys())
