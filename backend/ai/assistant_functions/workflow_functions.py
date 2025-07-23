"""
Workflow Management Assistant Functions
Provides tools for AI assistant to create, edit, and manage workflows with file operations.
"""

from typing import Dict, Union, Optional, Any, List
from pydantic_ai import RunContext
from sqlmodel import Session
from ai.models import Workflow, WorkflowSchedule, User
from error_logger.error_logger import ErrorLogger
import logging
import json
import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from croniter import croniter
import pytz

# Initialize error logger
error_logger = ErrorLogger()

def create_workflow(
    ctx: RunContext,
    title: str,
    code: str,
    description: Optional[str] = None,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a new workflow for a user.
    
    Args:
        title: The title of the workflow
        code: Python code for the workflow
        description: Optional description of the workflow
        user_id: Optional user ID
        
    Returns:
        Dict containing success status and workflow data or error details
    """
    try:
        # Get session from context, or create a new one
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        # Get user ID from context if not provided
        if not user_id and hasattr(ctx, 'deps'):
            # Try to get user_id from the user_object in deps
            if hasattr(ctx.deps, 'user_object') and ctx.deps.user_object:
                user_id = ctx.deps.user_object.uid  # FirebaseUser uses 'uid', not 'id'
            else:
                user_id = getattr(ctx.deps, 'user_id', None)
        
        if not user_id:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": "User ID is required to create workflow"
            }
        
        # Verify user exists
        user = session.get(User, user_id)
        if not user:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": f"User with ID {user_id} not found"
            }
        
        # Create new workflow
        workflow_id = str(uuid.uuid4())
        workflow = Workflow(
            id=workflow_id,
            title=title,
            description=description,
            code=code,
            status="inactive",
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(workflow)
        session.commit()
        session.refresh(workflow)
        
        result = {
            "success": True,
            "workflow": {
                "id": workflow.id,
                "title": workflow.title,
                "description": workflow.description,
                "code": workflow.code,
                "status": workflow.status,
                "created_at": workflow.created_at.isoformat(),
                "updated_at": workflow.updated_at.isoformat()
            }
        }
        
        if should_close_session:
            session.close()
            
        return result
        
    except Exception as e:
        if should_close_session and session:
            session.close()
        error_msg = f"Error creating workflow: {str(e)}"
        import traceback
        error_params = {
            "title": title,
            "user_id": user_id,
            "code_length": len(code) if code else 0
        }
        error_logger.log_error(
            function_name="create_workflow",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def update_workflow(
    ctx: RunContext,
    workflow_id: str,
    title: Optional[str] = None,
    code: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None
) -> Dict[str, Any]:
    """
    Update an existing workflow.
    
    Args:
        workflow_id: ID of the workflow to update
        title: New title (optional)
        code: New code (optional)  
        description: New description (optional)
        status: New status (optional)
        
    Returns:
        Dict containing success status and updated workflow data or error details
    """
    try:
        # Get or create session
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        # Get workflow
        workflow = session.get(Workflow, workflow_id)
        if not workflow:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": f"Workflow with ID {workflow_id} not found"
            }
        
        # Update fields if provided
        if title is not None:
            workflow.title = title
        if code is not None:
            workflow.code = code
        if description is not None:
            workflow.description = description
        if status is not None:
            workflow.status = status
            
        workflow.updated_at = datetime.now(timezone.utc)
        
        session.add(workflow)
        session.commit()
        session.refresh(workflow)
        
        result = {
            "success": True,
            "workflow": {
                "id": workflow.id,
                "title": workflow.title,
                "description": workflow.description,
                "code": workflow.code,
                "status": workflow.status,
                "updated_at": workflow.updated_at.isoformat()
            }
        }
        
        if should_close_session:
            session.close()
        
        return result
        
    except Exception as e:
        error_msg = f"Error updating workflow: {str(e)}"
        import traceback
        error_params = {
            "workflow_id": workflow_id,
            "title": title,
            "status": status
        }
        error_logger.log_error(
            function_name="update_workflow",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        if should_close_session and session:
            session.close()
        return {
            "success": False,
            "error": error_msg
        }


def get_workflow(
    ctx: RunContext,
    workflow_id: str
) -> Dict[str, Any]:
    """
    Get a workflow by ID.
    
    Args:
        workflow_id: ID of the workflow to retrieve
        
    Returns:
        Dict containing workflow data or error details
    """
    try:
        # Get or create session
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        workflow = session.get(Workflow, workflow_id)
        if not workflow:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": f"Workflow with ID {workflow_id} not found"
            }
        
        result = {
            "success": True,
            "workflow": {
                "id": workflow.id,
                "title": workflow.title,
                "description": workflow.description,
                "code": workflow.code,
                "status": workflow.status,
                "last_run": workflow.last_run.isoformat() if workflow.last_run else None,
                "last_run_status": workflow.last_run_status,
                "created_at": workflow.created_at.isoformat(),
                "updated_at": workflow.updated_at.isoformat()
            }
        }
        
        if should_close_session:
            session.close()
        
        return result
        
    except Exception as e:
        error_msg = f"Error getting workflow: {str(e)}"
        import traceback
        error_params = {
            "workflow_id": workflow_id
        }
        error_logger.log_error(
            function_name="get_workflow",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        if should_close_session and session:
            session.close()
        return {
            "success": False,
            "error": error_msg
        }


def list_workflows(
    ctx: RunContext,
    email: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    List workflows for a user.
    
    Args:
        email: User email (primary identifier)
        user_id: Optional user ID (fallback if email not provided)
        limit: Maximum number of workflows to return
        
    Returns:
        Dict containing list of workflows or error details
    """
    try:
        # Get session from context, or create a new one
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        # Priority: email first, then user_id from context, then user_id parameter
        resolved_user_id = None
        
        # If email is provided, look up user by email (highest priority)
        if email:
            user = session.query(User).filter(User.email == email).first()
            if user:
                resolved_user_id = user.id
            else:
                if should_close_session:
                    session.close()
                return {
                    "success": False,
                    "error": f"User with email {email} not found"
                }
        
        # If no email or email lookup failed, try user_id from context
        if not resolved_user_id and hasattr(ctx, 'deps'):
            # Try to get user_id from the user_object in deps
            if hasattr(ctx.deps, 'user_object') and ctx.deps.user_object:
                resolved_user_id = ctx.deps.user_object.uid  # FirebaseUser uses 'uid', not 'id'
            else:
                resolved_user_id = getattr(ctx.deps, 'user_id', None)
        
        # If still no user_id, try the user_id parameter
        if not resolved_user_id:
            resolved_user_id = user_id
        
        if not resolved_user_id:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": "Email is required to list workflows"
            }
        
        # Query workflows
        workflows = session.query(Workflow).filter(
            Workflow.user_id == resolved_user_id
        ).limit(limit).all()
        
        workflow_list = []
        for workflow in workflows:
            workflow_list.append({
                "id": workflow.id,
                "title": workflow.title,
                "description": workflow.description,
                "status": workflow.status,
                "last_run": workflow.last_run.isoformat() if workflow.last_run else None,
                "last_run_status": workflow.last_run_status,
                "created_at": workflow.created_at.isoformat(),
                "updated_at": workflow.updated_at.isoformat()
            })
        
        result = {
            "success": True,
            "workflows": workflow_list,
            "count": len(workflow_list)
        }
        
        if should_close_session:
            session.close()
            
        return result
        
    except Exception as e:
        if should_close_session and session:
            session.close()
        error_msg = f"Error listing workflows: {str(e)}"
        import traceback
        error_params = {
            "user_id": resolved_user_id,
            "email": email,
            "limit": limit
        }
        error_logger.log_error(
            function_name="list_workflows",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def add_workflow_schedule(
    ctx: RunContext,
    workflow_id: str,
    cron_expression: str,
    timezone: str = "UTC",
    is_active: bool = True
) -> Dict[str, Any]:
    """
    Add a schedule to a workflow.
    
    Args:
        workflow_id: ID of the workflow
        cron_expression: Cron expression for scheduling
        timezone: Timezone for the schedule
        is_active: Whether the schedule is active
        
    Returns:
        Dict containing success status and schedule data or error details
    """
    try:
        # Get or create session
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        # Verify workflow exists
        workflow = session.get(Workflow, workflow_id)
        if not workflow:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": f"Workflow with ID {workflow_id} not found"
            }
        
        # Validate cron expression
        try:
            tz = pytz.timezone(timezone)
            now = datetime.now(tz)
            cron = croniter(cron_expression, now)
            next_run = cron.get_next(datetime)
        except Exception as cron_error:
            if should_close_session:
                session.close()
            return {
                "success": False,
                "error": f"Invalid cron expression or timezone: {str(cron_error)}"
            }
        
        # Create schedule
        schedule = WorkflowSchedule(
            cron_expression=cron_expression,
            timezone=timezone,
            is_active=is_active,
            next_run=next_run,
            workflow_id=workflow_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(schedule)
        session.commit()
        session.refresh(schedule)
        
        result = {
            "success": True,
            "schedule": {
                "id": schedule.id,
                "cron_expression": schedule.cron_expression,
                "timezone": schedule.timezone,
                "is_active": schedule.is_active,
                "next_run": schedule.next_run.isoformat() if schedule.next_run else None,
                "workflow_id": schedule.workflow_id
            }
        }
        
        if should_close_session:
            session.close()
        
        return result
        
    except Exception as e:
        error_msg = f"Error adding workflow schedule: {str(e)}"
        import traceback
        error_params = {
            "workflow_id": workflow_id,
            "cron_expression": cron_expression,
            "timezone": timezone,
            "is_active": is_active
        }
        error_logger.log_error(
            function_name="add_workflow_schedule",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        if should_close_session and session:
            session.close()
        return {
            "success": False,
            "error": error_msg
        }


def read_file_content(
    ctx: RunContext,
    file_path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> Dict[str, Any]:
    """
    Read content from a file with optional line range.
    
    Args:
        file_path: Path to the file to read
        start_line: Optional start line (1-indexed)
        end_line: Optional end line (1-indexed, inclusive)
        
    Returns:
        Dict containing file content or error details
    """
    try:
        # Security check - only allow reading from agent files directory or legacy directories for backward compatibility
        allowed_dirs = ['./agent_files/', '/tmp', './uploads', './data', './scripts', './']
        if not any(file_path.startswith(allowed_dir) for allowed_dir in allowed_dirs):
            # Allow relative paths within project
            if not (file_path.startswith('./') or file_path.startswith('../')):
                return {
                    "success": False,
                    "error": f"File access not allowed for path: {file_path}"
                }
        
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        with open(file_path, 'r', encoding='utf-8') as file:
            if start_line is not None or end_line is not None:
                lines = file.readlines()
                start_idx = (start_line - 1) if start_line is not None else 0
                end_idx = end_line if end_line is not None else len(lines)
                content = ''.join(lines[start_idx:end_idx])
            else:
                content = file.read()
        
        return {
            "success": True,
            "content": content,
            "file_path": file_path,
            "line_count": len(content.splitlines())
        }
        
    except Exception as e:
        error_msg = f"Error reading file {file_path}: {str(e)}"
        import traceback
        error_params = {
            "file_path": file_path,
            "start_line": start_line,
            "end_line": end_line
        }
        error_logger.log_error(
            function_name="read_file_content",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def search_in_file(
    ctx: RunContext,
    file_path: str,
    pattern: str,
    case_sensitive: bool = False,
    max_results: int = 50
) -> Dict[str, Any]:
    """
    Search for a pattern in a file (like grep).
    
    Args:
        file_path: Path to the file to search
        pattern: Regex pattern to search for
        case_sensitive: Whether search should be case sensitive
        max_results: Maximum number of results to return
        
    Returns:
        Dict containing search results or error details
    """
    try:
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        flags = 0 if case_sensitive else re.IGNORECASE
        compiled_pattern = re.compile(pattern, flags)
        
        results = []
        with open(file_path, 'r', encoding='utf-8') as file:
            for line_num, line in enumerate(file, 1):
                matches = compiled_pattern.finditer(line)
                for match in matches:
                    if len(results) >= max_results:
                        break
                    results.append({
                        "line_number": line_num,
                        "line_content": line.rstrip(),
                        "match_start": match.start(),
                        "match_end": match.end(),
                        "matched_text": match.group()
                    })
                if len(results) >= max_results:
                    break
        
        return {
            "success": True,
            "results": results,
            "file_path": file_path,
            "pattern": pattern,
            "total_matches": len(results)
        }
        
    except Exception as e:
        error_msg = f"Error searching in file {file_path}: {str(e)}"
        error_logger.log_error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }


def list_directory(
    ctx: RunContext,
    directory_path: str,
    show_hidden: bool = False,
    file_extensions: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    List contents of a directory with optional filtering.
    Automatically scopes to the current conversation's files when using relative paths.
    
    Args:
        directory_path: Path to the directory to list (can be relative or full path)
        show_hidden: Whether to include hidden files/directories
        file_extensions: Optional list of file extensions to filter by (e.g., ['.py', '.js'])
        
    Returns:
        Dict containing directory contents or error details
    """
    try:
        # If directory_path doesn't specify agent_files, auto-scope to current conversation
        if not directory_path.startswith('./agent_files/') and not directory_path.startswith('agent_files/'):
            # Auto-extract chat_id from context
            chat_id = None
            
            # Try to get the conversation ID from context
            if hasattr(ctx, 'deps') and ctx.deps:
                # Primary: Get conversation_id from MyDeps
                chat_id = getattr(ctx.deps, 'conversation_id', None)
            
            # Fallback to 'default' if no conversation context is available
            if not chat_id:
                chat_id = 'default'
                
            # Construct the full path within the conversation's directory
            if directory_path and directory_path != ".":
                directory_path = f"./agent_files/{chat_id}/{directory_path}"
            else:
                directory_path = f"./agent_files/{chat_id}"
        
        if not os.path.exists(directory_path):
            return {
                "success": False,
                "error": f"Directory not found: {directory_path}"
            }
        
        if not os.path.isdir(directory_path):
            return {
                "success": False,
                "error": f"Path is not a directory: {directory_path}"
            }
        
        items = []
        for item in os.listdir(directory_path):
            if not show_hidden and item.startswith('.'):
                continue
                
            item_path = os.path.join(directory_path, item)
            is_dir = os.path.isdir(item_path)
            
            # Filter by file extensions if specified
            if file_extensions and not is_dir:
                if not any(item.lower().endswith(ext.lower()) for ext in file_extensions):
                    continue
            
            try:
                stat_info = os.stat(item_path)
                items.append({
                    "name": item,
                    "path": item_path,
                    "is_directory": is_dir,
                    "size": stat_info.st_size if not is_dir else None,
                    "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                })
            except OSError:
                # Skip items that can't be accessed
                continue
        
        return {
            "success": True,
            "items": items,
            "directory_path": directory_path,
            "total_items": len(items)
        }
        
    except Exception as e:
        error_msg = f"Error listing directory {directory_path}: {str(e)}"
        error_logger.log_error(error_msg)
        return {
            "success": False,
            "error": error_msg
        }


def write_file_content(
    ctx: RunContext,
    file_path: str,
    content: str,
    mode: str = 'w'
) -> Dict[str, Any]:
    """
    Write content to a file in the agent files directory structure.
    Files are automatically organized by the conversation they were created in.
    
    Args:
        file_path: Path to the file to write (can be relative filename or full path)
        content: Content to write to the file
        mode: Write mode ('w' for overwrite, 'a' for append)
        
    Returns:
        Dict containing success status or error details
    """
    try:
        # If file_path doesn't start with agent_files, auto-organize it by conversation
        if not file_path.startswith('./agent_files/') and not file_path.startswith('agent_files/'):
            # Auto-extract chat_id from context
            chat_id = None
            
            # Try to get the conversation ID from context
            if hasattr(ctx, 'deps') and ctx.deps:
                # Primary: Get conversation_id from MyDeps
                chat_id = getattr(ctx.deps, 'conversation_id', None)
            
            # Fallback to 'default' if no conversation context is available
            if not chat_id:
                chat_id = 'default'
            
            # Clean the file_path (remove any leading paths) 
            filename = os.path.basename(file_path) if '/' in file_path else file_path
            file_path = f"./agent_files/{chat_id}/{filename}"
        
        # Security check - ensure we're writing to agent files directory
        allowed_dirs = ['./agent_files/', '/tmp', './uploads', './data', './scripts', './output']
        if not any(file_path.startswith(allowed_dir) for allowed_dir in allowed_dirs):
            return {
                "success": False,
                "error": f"File write not allowed for path: {file_path}. Files should be in agent_files directory."
            }
        
        # Create directory if it doesn't exist
        directory = os.path.dirname(file_path)
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
        
        with open(file_path, mode, encoding='utf-8') as file:
            file.write(content)
        
        return {
            "success": True,
            "file_path": file_path,
            "bytes_written": len(content.encode('utf-8')),
            "mode": mode,
            "conversation_id": chat_id
        }
        
    except Exception as e:
        error_msg = f"Error writing to file {file_path}: {str(e)}"
        import traceback
        error_params = {
            "file_path": file_path,
            "content_length": len(content) if content else 0,
            "mode": mode
        }
        error_logger.log_error(
            function_name="write_file_content",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def execute_shell_command(
    ctx: RunContext,
    command: str,
    timeout: int = 30,
    working_directory: Optional[str] = None
) -> Dict[str, Any]:
    """
    Execute a shell command safely.
    
    Args:
        command: Shell command to execute
        timeout: Timeout in seconds
        working_directory: Optional working directory
        
    Returns:
        Dict containing command output or error details
    """
    try:
        # Security check - block dangerous commands
        dangerous_patterns = [
            'rm -rf', 'format', 'del /s', 'shutdown', 'reboot',
            'sudo', 'su -', 'chmod 777', 'passwd', 'useradd',
            'dd if=', '> /dev/', 'curl.*|.*sh', 'wget.*|.*sh'
        ]
        
        if any(pattern in command.lower() for pattern in dangerous_patterns):
            return {
                "success": False,
                "error": f"Command blocked for security reasons: {command}"
            }
        
        # Execute command
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=working_directory
        )
        
        return {
            "success": True,
            "command": command,
            "return_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "working_directory": working_directory or os.getcwd()
        }
        
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Command timed out after {timeout} seconds: {command}"
        }
    except Exception as e:
        error_msg = f"Error executing command {command}: {str(e)}"
        error_logger.log_error(error_msg)
        return {
            "success": False,
            "error": error_msg
        } 


def run_workflow(
    ctx: RunContext,
    workflow_id: Optional[str] = None,
    email: Optional[str] = None,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Execute a workflow using the existing execution logic.
    
    Args:
        workflow_id: Optional workflow ID (if known)
        email: User email (required if workflow_id not provided)
        title: Workflow title (required if workflow_id not provided, used to find workflow by title)
        
    Returns:
        Dict containing execution results and status
    """
    try:
        # Get session from context, or create a new one
        session = getattr(ctx.deps, 'session', None) if hasattr(ctx, 'deps') else None
        should_close_session = False
        if not session:
            from ai.models import engine
            from sqlmodel import Session
            session = Session(engine)
            should_close_session = True
        
        # Priority: workflow_id first, then find by email + title
        resolved_workflow = None
        
        # If workflow_id is provided, get workflow directly
        if workflow_id:
            resolved_workflow = session.get(Workflow, workflow_id)
            if not resolved_workflow:
                if should_close_session:
                    session.close()
                return {
                    "success": False,
                    "error": f"Workflow with ID {workflow_id} not found"
                }
        else:
            # Need email and title to find workflow
            if not email or not title:
                if should_close_session:
                    session.close()
                return {
                    "success": False,
                    "error": "Either workflow_id or both email and title are required"
                }
            
            # Find user by email
            user = session.query(User).filter(User.email == email).first()
            if not user:
                if should_close_session:
                    session.close()
                return {
                    "success": False,
                    "error": f"User with email {email} not found"
                }
            
            # Find workflow by title for this user
            resolved_workflow = session.query(Workflow).filter(
                Workflow.user_id == user.id,
                Workflow.title == title
            ).first()
            
            if not resolved_workflow:
                if should_close_session:
                    session.close()
                return {
                    "success": False,
                    "error": f"Workflow '{title}' not found for user {email}"
                }
        
        # Create workflow run record
        from ai.models import WorkflowRun
        from datetime import datetime, timezone
        
        run_start = datetime.now(timezone.utc)
        workflow_run = WorkflowRun(
            workflow_id=resolved_workflow.id,
            status="pending",
            triggered_by="assistant",
            started_at=run_start
        )
        session.add(workflow_run)
        session.commit()
        session.refresh(workflow_run)
        
        # Execute the workflow code (synchronous version)
        import sys
        from io import StringIO
        import threading
        import queue
        
        # Get workflow context with injected functions
        from ai.workflow_context import get_assistant_workflow_context
        workflow_context = get_assistant_workflow_context(resolved_workflow.id, session)
        
        # Create a queue to store the result
        result_queue = queue.Queue()
        
        def run_code():
            try:
                # Capture stdout and stderr
                old_stdout = sys.stdout
                old_stderr = sys.stderr
                stdout_capture = StringIO()
                stderr_capture = StringIO()
                sys.stdout = stdout_capture
                sys.stderr = stderr_capture

                # Execute the code with the injected context
                exec(resolved_workflow.code, workflow_context)

                # Restore stdout and stderr
                sys.stdout = old_stdout
                sys.stderr = old_stderr

                # Get the captured output
                output = stdout_capture.getvalue()
                error_output = stderr_capture.getvalue()

                if error_output:
                    result_queue.put(("error", output, error_output))
                elif output.strip().startswith("Error:"):
                    result_queue.put(("error", output, "Workflow printed error message"))
                else:
                    result_queue.put(("success", output, ""))

            except Exception as e:
                # Restore stdout and stderr in case of exception
                sys.stdout = old_stdout
                sys.stderr = old_stderr
                result_queue.put(("error", "", f"Execution error: {str(e)}"))

        # Create and start the thread
        thread = threading.Thread(target=run_code)
        thread.daemon = True
        thread.start()

        try:
            # Wait for the result with timeout (10 minutes for workflows)
            status, output, error = result_queue.get(timeout=600)
        except queue.Empty:
            # Timeout occurred
            status, output, error = "timeout", "", "Workflow execution timed out after 10 minutes"
        
        # Update run with results
        run_end = datetime.now(timezone.utc)
        workflow_run.status = status
        workflow_run.completed_at = run_end
        workflow_run.output = output
        workflow_run.error = error
        workflow_run.duration_seconds = (run_end - run_start).total_seconds()
        
        # Update workflow last run info
        resolved_workflow.last_run = run_end
        resolved_workflow.last_run_status = status
        resolved_workflow.last_run_output = output
        resolved_workflow.last_run_error = error
        
        session.add(workflow_run)
        session.add(resolved_workflow)
        session.commit()
        
        result = {
            "success": True,
            "workflow": {
                "id": resolved_workflow.id,
                "title": resolved_workflow.title,
                "status": status
            },
            "run": {
                "id": workflow_run.id,
                "status": status,
                "output": output,
                "error": error,
                "duration_seconds": workflow_run.duration_seconds,
                "started_at": run_start.isoformat(),
                "completed_at": workflow_run.completed_at.isoformat() if workflow_run.completed_at else None
            }
        }
        
        if should_close_session:
            session.close()
            
        return result
        
    except Exception as e:
        if should_close_session and session:
            session.close()
        error_msg = f"Error running workflow: {str(e)}"
        import traceback
        error_params = {
            "workflow_id": workflow_id,
            "email": email,
            "title": title
        }
        error_logger.log_error(
            function_name="run_workflow",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        } 


def get_local_file_url(
    ctx: RunContext,
    file_path: str
) -> Dict[str, Any]:
    """
    Get the local file URLs for a file created by the agent.
    This provides both download and view URLs for web access.
    
    Args:
        file_path: Path to the local file
        
    Returns:
        Dict containing the local file URLs and information
    """
    try:
        # Security check - prioritize agent files directory, allow legacy directories for backward compatibility
        allowed_dirs = ['./agent_files/', '/tmp', './uploads', './data', './scripts', './output']
        if not any(file_path.startswith(allowed_dir) for allowed_dir in allowed_dirs):
            return {
                "success": False,
                "error": f"File access not allowed for path: {file_path}. Use agent_files directory for new files."
            }
        
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        # Get the base URL from environment (fallback to localhost for development)
        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        
        # Create the local file URLs
        download_url = f"{backend_url}/api/v1/local-files/serve/{file_path}"
        view_url = f"{backend_url}/api/v1/local-files/view/{file_path}"
        
        # Get file information
        stat_info = os.stat(file_path)
        
        # Determine content type and if it's viewable in browser
        from pathlib import Path
        import mimetypes
        
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
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
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.webp': 'image/webp',
                '.pdf': 'application/pdf',
            }
            content_type = content_type_map.get(extension, 'application/octet-stream')
        
        # Determine if viewable in browser
        viewable_types = {
            'text/html', 'text/css', 'application/javascript', 'text/javascript',
            'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
            'text/plain', 'text/markdown', 'application/json', 'text/csv',
            'application/pdf'
        }
        is_viewable = content_type in viewable_types
        
        # Check if it's an agent file to provide additional context
        is_agent_file = file_path.startswith('./agent_files/') or file_path.startswith('agent_files/')
        chat_id = None
        if is_agent_file:
            path_parts = file_path.replace('./agent_files/', '').replace('agent_files/', '').split('/')
            if len(path_parts) > 1:
                chat_id = path_parts[0]
        
        result = {
            "success": True,
            "file_path": file_path,
            "download_url": download_url,
            "filename": os.path.basename(file_path),
            "size": stat_info.st_size,
            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
            "content_type": content_type,
            "accessible_via": "local-files endpoint (no auth required)",
            "is_agent_file": is_agent_file,
            "chat_id": chat_id
        }
        
        # Add view URL only if the file is viewable in browser
        if is_viewable:
            result["view_url"] = view_url
            result["viewable_in_browser"] = True
            if content_type == 'text/html':
                result["recommended_url"] = view_url  # For HTML, recommend view URL
            else:
                result["recommended_url"] = view_url  # For images, PDFs, etc., also recommend view URL
        else:
            result["viewable_in_browser"] = False
            result["recommended_url"] = download_url  # For binary files, recommend download URL
        
        return result
        
    except Exception as e:
        error_msg = f"Error getting local file URL: {str(e)}"
        import traceback
        error_params = {
            "file_path": file_path
        }
        error_logger.log_error(
            function_name="get_local_file_url",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def get_local_file_view_url(
    ctx: RunContext,
    file_path: str
) -> Dict[str, Any]:
    """
    Get the view URL for a file created by the agent to display in browser.
    This is specifically for HTML files, images, and other web-viewable content.
    
    Args:
        file_path: Path to the local file
        
    Returns:
        Dict containing the view URL and information
    """
    try:
        # Use the main get_local_file_url function to get all info
        file_info = get_local_file_url(ctx, file_path)
        
        if not file_info["success"]:
            return file_info
        
        # Check if the file is viewable in browser
        if not file_info.get("viewable_in_browser", False):
            return {
                "success": False,
                "error": f"File type '{file_info.get('content_type', 'unknown')}' is not viewable in browser. Use get_local_file_url() for download URL."
            }
        
        return {
            "success": True,
            "file_path": file_info["file_path"],
            "view_url": file_info["view_url"],
            "filename": file_info["filename"],
            "content_type": file_info["content_type"],
            "viewable_in_browser": True,
            "accessible_via": "local-files view endpoint (opens in browser)",
            "is_agent_file": file_info["is_agent_file"],
            "chat_id": file_info.get("chat_id")
        }
        
    except Exception as e:
        error_msg = f"Error getting local file view URL: {str(e)}"
        import traceback
        error_params = {
            "file_path": file_path
        }
        error_logger.log_error(
            function_name="get_local_file_view_url",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        }


def create_shareable_file_link(
    ctx: RunContext,
    content: str,
    filename: str,
    content_type: str = "text/plain"
) -> Dict[str, Any]:
    """
    Create a shareable file link by uploading content to Digital Ocean Spaces.
    
    Args:
        content: The content to upload
        filename: Name for the file (will be prefixed with timestamp and UUID)
        content_type: MIME type of the content (default: text/plain)
        
    Returns:
        Dict containing the shareable URL and file information
    """
    try:
        import boto3
        import os
        from datetime import datetime
        import uuid
        
        # Digital Ocean Spaces configuration
        DO_SPACES_ENDPOINT = "https://fra1.digitaloceanspaces.com"
        DO_SPACES_BUCKET = "whagons5"
        DO_SPACES_REGION = "fra1" 
        CDN_ENDPOINT = "https://whagons5.fra1.cdn.digitaloceanspaces.com"
        
        # Environment variables
        DO_SPACES_ACCESS_KEY = os.getenv("DO_SPACES_ACCESS_KEY")
        DO_SPACES_SECRET_KEY = os.getenv("DO_SPACES_SECRET_KEY")
        
        if not DO_SPACES_ACCESS_KEY or not DO_SPACES_SECRET_KEY:
            return {
                "success": False,
                "error": "Digital Ocean Spaces credentials not configured"
            }
        
        # Create S3 client
        s3_client = boto3.client(
            's3',
            endpoint_url=DO_SPACES_ENDPOINT,
            aws_access_key_id=DO_SPACES_ACCESS_KEY,
            aws_secret_access_key=DO_SPACES_SECRET_KEY,
            region_name=DO_SPACES_REGION
        )
        
        # Generate unique file key with timestamp and UUID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = filename.split('.')[-1] if '.' in filename else ''
        unique_id = str(uuid.uuid4())[:8]
        
        # Create file key with folder structure
        file_key = f"nca-assistant-files/{timestamp}_{unique_id}_{filename}"
        
        # Convert content to bytes
        if isinstance(content, str):
            content_bytes = content.encode('utf-8')
        else:
            content_bytes = content
        
        # Upload to Digital Ocean Spaces
        s3_client.put_object(
            Bucket=DO_SPACES_BUCKET,
            Key=file_key,
            Body=content_bytes,
            ContentType=content_type,
            ACL='public-read'  # Make file publicly accessible
        )
        
        # Return file information
        file_url = f"{CDN_ENDPOINT}/{file_key}"
        
        return {
            "success": True,
            "file_id": file_key,
            "url": file_url,
            "filename": filename,
            "size": len(content_bytes),
            "content_type": content_type,
            "shareable_link": file_url
        }
        
    except Exception as e:
        error_msg = f"Error creating shareable file link: {str(e)}"
        import traceback
        error_params = {
            "filename": filename,
            "content_type": content_type,
            "content_length": len(content) if content else 0
        }
        error_logger.log_error(
            function_name="create_shareable_file_link",
            error_text=error_msg,
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return {
            "success": False,
            "error": error_msg
        } 


 