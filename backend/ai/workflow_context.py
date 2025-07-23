"""
Workflow Context Manager
Provides a centralized way to manage and inject functions into workflow execution contexts.
"""

from typing import Dict, Any, Optional
from sqlmodel import Session
from pydantic_ai import RunContext


class WorkflowRunContext:
    """Mock RunContext for workflow functions"""
    def __init__(self, session: Session = None, user_id: str = None):
        self.deps = type('deps', (), {})()
        self.deps.session = session
        self.deps.user_id = user_id

def get_workflow_context(workflow_id: str = None, session: Session = None) -> Dict[str, Any]:
    """
    Get the execution context for workflows with injected functions.
    
    Args:
        workflow_id: The ID of the workflow being executed
        session: Database session (optional)
    
    Returns:
        Dictionary containing all functions and variables available in workflow context
    """
    
    # Base context with workflow metadata
    context = {
        'workflow_id': workflow_id,
    }
    
    # Add database session if provided
    if session:
        context['session'] = session
    
    # Try to import and add Graph API functions
    try:
        from ai.assistant_functions.graph import graph_api_request_no_ctx
        
        # Create a default_api class to match the expected structure
        class DefaultApi:
            def __init__(self):
                self.graph_api_request = graph_api_request_no_ctx
        
        context.update({
            'graph_api_request_no_ctx': graph_api_request_no_ctx,
            'graph_api_request': graph_api_request_no_ctx,  # Alias for convenience
            'default_api': DefaultApi(),  # Create instance of DefaultApi
        })
    except ImportError:
        pass
    
    # Add more utility functions here as needed
    
    # Add common imports that workflows might need
    import datetime
    import time
    import json
    import os
    import sys
    import re
    import uuid
    import hashlib
    import base64
    from urllib.parse import urlparse, urlencode
    
    context.update({
        # Common modules
        'datetime': datetime,
        'time': time,
        'json': json,
        'os': os,
        'sys': sys,
        're': re,
        'uuid': uuid,
        'hashlib': hashlib,
        'base64': base64,
        'urlparse': urlparse,
        'urlencode': urlencode,
        
        # Utility functions
        'print': print,  # Explicitly include print
        'len': len,
        'str': str,
        'int': int,
        'float': float,
        'bool': bool,
        'list': list,
        'dict': dict,
        'set': set,
        'tuple': tuple,
    })
    
    # Add data science libraries if available
    try:
        import pandas as pd
        import numpy as np
        import xlsxwriter
        context.update({
            'pd': pd,
            'pandas': pd,
            'np': np,
            'numpy': np,
            'xlsxwriter': xlsxwriter,
        })
    except ImportError:
        # If pandas/numpy/xlsxwriter not available, continue without them
        pass
    
    return context

def add_custom_function(name: str, func: Any, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Add a custom function to the workflow context.
    
    Args:
        name: Name of the function in the context
        func: Function to add
        context: Existing context to modify (or None to create new)
    
    Returns:
        Updated context dictionary
    """
    if context is None:
        context = get_workflow_context()
    
    context[name] = func
    return context

# Example custom functions that could be useful in workflows

def workflow_log(message: str, level: str = "INFO"):
    """Custom logging function for workflows"""
    import datetime
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {level}: {message}")

def workflow_sleep(seconds: float):
    """Sleep function with logging"""
    import time
    workflow_log(f"Sleeping for {seconds} seconds...")
    time.sleep(seconds)
    workflow_log("Sleep completed")

def workflow_request(method: str, url: str, **kwargs):
    """HTTP request function for workflows"""
    import requests
    workflow_log(f"Making {method} request to {url}")
    response = requests.request(method, url, **kwargs)
    workflow_log(f"Response: {response.status_code}")
    return response

# Pre-defined context with additional workflow utilities
def get_enhanced_workflow_context(workflow_id: str = None, session: Session = None) -> Dict[str, Any]:
    """
    Get an enhanced workflow context with additional utility functions.
    """
    context = get_workflow_context(workflow_id, session)
    
    # Add workflow-specific utilities
    context.update({
        'workflow_log': workflow_log,
        'workflow_sleep': workflow_sleep,
        'workflow_request': workflow_request,
    })
    
    return context

# Enhanced context for assistant with workflow management capabilities
def get_assistant_workflow_context(workflow_id: str = None, session: Session = None) -> Dict[str, Any]:
    """
    Get workflow context specifically enhanced for AI assistant with workflow management functions.
    This includes all the standard workflow utilities plus assistant-specific functions.
    """
    context = get_enhanced_workflow_context(workflow_id, session)
    
    # Try to import and add workflow management functions
    try:
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
            execute_shell_command,
            create_shareable_file_link
        )
        
        # Create wrapper functions that automatically provide RunContext
        def create_workflow_wrapper(title: str, code: str, description: str = None, user_id: str = None):
            ctx = WorkflowRunContext(session, user_id)
            return create_workflow(ctx, title, code, description, user_id)
        
        def update_workflow_wrapper(workflow_id: str, title: str = None, code: str = None, description: str = None, status: str = None):
            ctx = WorkflowRunContext(session)
            return update_workflow(ctx, workflow_id, title, code, description, status)
        
        def get_workflow_wrapper(workflow_id: str):
            ctx = WorkflowRunContext(session)
            return get_workflow(ctx, workflow_id)
        
        def list_workflows_wrapper(email: str = None, user_id: str = None, limit: int = 50):
            ctx = WorkflowRunContext(session, user_id)
            return list_workflows(ctx, email, user_id, limit)
        
        def add_workflow_schedule_wrapper(workflow_id: str, cron_expression: str, timezone: str = "UTC", is_active: bool = True):
            ctx = WorkflowRunContext(session)
            return add_workflow_schedule(ctx, workflow_id, cron_expression, timezone, is_active)
        
        def run_workflow_wrapper(workflow_id: str = None, email: str = None, title: str = None):
            ctx = WorkflowRunContext(session)
            return run_workflow(ctx, workflow_id, email, title)
        
        def read_file_wrapper(file_path: str, start_line: int = None, end_line: int = None):
            ctx = WorkflowRunContext(session)
            return read_file_content(ctx, file_path, start_line, end_line)
        
        def search_file_wrapper(file_path: str, pattern: str, case_sensitive: bool = False, max_results: int = 50):
            ctx = WorkflowRunContext(session)
            return search_in_file(ctx, file_path, pattern, case_sensitive, max_results)
        
        def list_dir_wrapper(directory_path: str, show_hidden: bool = False, file_extensions: list = None):
            ctx = WorkflowRunContext(session)
            return list_directory(ctx, directory_path, show_hidden, file_extensions)
        
        def write_file_wrapper(file_path: str, content: str, mode: str = 'w'):
            ctx = WorkflowRunContext(session)
            return write_file_content(ctx, file_path, content, mode)
        
        def shell_command_wrapper(command: str, timeout: int = 30, working_directory: str = None):
            ctx = WorkflowRunContext(session)
            return execute_shell_command(ctx, command, timeout, working_directory)
        
        def create_shareable_file_link_wrapper(content: str, filename: str, content_type: str = "text/plain"):
            ctx = WorkflowRunContext(session)
            return create_shareable_file_link(ctx, content, filename, content_type)
        


        # Add wrapped functions to context
        context.update({
            # Workflow CRUD operations
            'create_workflow': create_workflow_wrapper,
            'update_workflow': update_workflow_wrapper,
            'get_workflow': get_workflow_wrapper,
            'list_workflows': list_workflows_wrapper,
            'add_workflow_schedule': add_workflow_schedule_wrapper,
            'run_workflow': run_workflow_wrapper,
            
            # File operations
            'read_file': read_file_wrapper,
            'search_file': search_file_wrapper,
            'list_dir': list_dir_wrapper,
            'write_file': write_file_wrapper,
            'create_shareable_file_link': create_shareable_file_link_wrapper,
            
            # System operations
            'shell_command': shell_command_wrapper,
        })
        
        workflow_log("Assistant workflow functions loaded successfully")
        
    except ImportError as e:
        workflow_log(f"Could not import workflow functions: {e}", "WARNING")
    
    return context 