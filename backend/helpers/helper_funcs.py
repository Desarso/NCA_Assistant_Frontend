from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider
from pydantic_ai import Agent
from pydantic_ai.messages import UserContent
import os

async def gemini(prompt: str) -> str:
    """
    Simple function that takes a prompt and returns a Gemini response.

    Args:
        prompt: The text prompt to send to Gemini

    Returns:
        The text response from Gemini
    """
    model = GeminiModel(
        "gemini-2.0-flash-lite",
        provider=GoogleGLAProvider(api_key=os.getenv("GEMINI_API_KEY")),
    )

    agent = Agent(
        model=model,
        system_prompt="Based on the user's prompt, generate a title for the conversation. The title should be a single sentence that captures the essence of the conversation. The title should be no more than 10 words.",
    )
    response = await agent.run(prompt)
    # print(response, "\n")
    return response.data

async def geminiParts(content: list[UserContent]) -> str:
    """
    Function that takes a list of mixed content (text, images, audio) and returns a Gemini response.
    Used for generating conversation titles from mixed content.

    Args:
        content: List of UserContent that can include text, image URLs, or audio URLs

    Returns:
        The text response from Gemini
    """
    model = GeminiModel(
        "gemini-2.0-flash",
        provider=GoogleGLAProvider(api_key=os.getenv("GEMINI_API_KEY")),
    )

    agent = Agent(
        model=model,
        system_prompt="Summarize in less than 3 words what the conversation is about.",
    )
    response = await agent.run(content)
    return response.data


