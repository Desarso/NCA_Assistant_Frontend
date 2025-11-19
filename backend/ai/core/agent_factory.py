"""
AI Agent Factory
Handles the creation and configuration of AI agents with proper model selection and tool setup.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional
import logging

from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.common_tools.tavily import tavily_search_tool

from ai.assistant_functions.graph import graph_api_request
from ai.assistant_functions.python_interpreter import python
from ai.assistant_functions.memory_functions import add_memory, get_memory
from ai.assistant_functions.workflow_functions import (
    create_workflow,
    update_workflow,
    get_workflow,
    list_workflows,
    add_workflow_schedule,
    run_workflow,
    read_file_content,
    search_in_file,
    list_directory,
    write_file_content,
    create_shareable_file_link,
    get_local_file_url,
    get_local_file_view_url,
    execute_shell_command,
)
from ai.core.prompts import get_system_prompt
from ai.config.models import models, DEFAULT_MODEL, get_model
from helpers.Firebase_helpers import FirebaseUser

import os

# Environment variables
tavily_api_key = os.getenv("TAVILY_API_KEY")


@dataclass
class MyDeps:
    """Dependencies for the AI agent."""
    user_object: FirebaseUser
    user_rejection_flags: Dict[str, bool] = field(default_factory=dict)
    conversation_id: Optional[str] = None  # Add conversation ID for file organization
    use_delegated_permissions: bool = True  # If True, use user's delegated Microsoft tokens; if False, use application permissions (super_admin only)


async def create_agent(
    user_object: FirebaseUser, 
    memory: str, 
    has_pdfs: bool = False, 
    model_key: Optional[str] = None,
    use_delegated_permissions: Optional[bool] = None  # None = auto-detect based on role
) -> Agent:
    """
    Create and configure an AI agent with appropriate model and tools.

    Args:
        user_object: Firebase user object
        memory: User's memory context
        has_pdfs: Whether the conversation contains PDF content
        model_key: Optional model key to use
        use_delegated_permissions: If None, auto-detects based on role (delegated by default, 
                                   application only for super_admin). If True/False, uses that value.

    Returns:
        Configured Agent instance
    """
    # Initialize MCP servers list
    mcp_servers = []

    # Check if GitHub server is enabled for the user and they have a token
    github_server_enabled = any(
        server.get("server_id") == "github" and server.get("enabled", False)
        for server in user_object.mcp_servers
    )

    if github_server_enabled and user_object.github_token:
        github_server = MCPServerStdio(
            command="npx",
            args=["-y", "@modelcontextprotocol/server-github"],
            env={"GITHUB_PERSONAL_ACCESS_TOKEN": user_object.github_token},
        )
        mcp_servers.append(github_server)

    # Smart model selection
    if has_pdfs:
        # Force Gemini when PDFs are present (OpenAI doesn't support PDFs)
        preferred_model_key = "gemini-2.5-flash"
        selected_model = models.get(preferred_model_key, models[DEFAULT_MODEL])
        model_name = getattr(selected_model, 'model_name', preferred_model_key)
        print(f"🤖 MODEL SELECTION: Using {model_name} due to PDF content")
        logging.info(f"Using Gemini model due to PDF content: {model_name}")
    else:
        # Use passed-in model key if provided; otherwise use user's preferred or default
        preferred_model_key = model_key or getattr(user_object, 'prefered_model', None) or DEFAULT_MODEL
        selected_model = models.get(preferred_model_key, models[DEFAULT_MODEL])

        # Resolve a friendly model name for logs before logging
        model_name = getattr(selected_model, 'model_name', preferred_model_key)

        print(
            f"🤖 MODEL SELECTION: Using {model_name} (user preference: {getattr(user_object, 'prefered_model', None) or 'default'})"
        )
        logging.info(f"Using model '{model_name}' (key: {preferred_model_key})")

    # Determine permission mode: default to delegated, only use application for super_admin
    if use_delegated_permissions is None:
        # Auto-detect: use delegated by default, application only if user has super_admin role
        user_roles = getattr(user_object, 'roles', []) or []
        use_delegated_permissions = 'super_admin' not in user_roles
        logging.info(f"Auto-detected permission mode for user {user_object.email}: {'delegated' if use_delegated_permissions else 'application'} (roles: {user_roles})")
    else:
        # Explicitly set - but warn if non-super_admin tries to use application permissions
        if not use_delegated_permissions:
            user_roles = getattr(user_object, 'roles', []) or []
            if 'super_admin' not in user_roles:
                logging.warning(f"User {user_object.email} attempted to use application permissions without super_admin role. Falling back to delegated.")
                use_delegated_permissions = True

    # Create dependencies with permission mode
    # deps = MyDeps(
    #     user_object=user_object,
    #     use_delegated_permissions=use_delegated_permissions
    # )
    
    return Agent(
        model=selected_model,
        system_prompt=get_system_prompt(user_object, memory),
        deps_type=MyDeps,
        # deps=deps,  # Pass the configured dependencies  <-- REMOVE THIS
        # mcp_servers=mcp_servers,
        tools=[
            tavily_search_tool(tavily_api_key),
            graph_api_request,
            python,
            add_memory,
            get_memory,
            # Workflow management tools
            create_workflow,
            update_workflow,
            get_workflow,
            list_workflows,
            add_workflow_schedule,
            run_workflow,
            # File operation tools
            read_file_content,
            search_in_file,
            list_directory,
            write_file_content,
            create_shareable_file_link,
            get_local_file_url,
            get_local_file_view_url,
            execute_shell_command,
        ],
    )
