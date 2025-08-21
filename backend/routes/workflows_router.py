from typing import List, Optional
from datetime import datetime, timedelta, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
import sys
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, exists
from pydantic import BaseModel
import threading
import queue
import json
import traceback
import logging

from ai.models import Workflow, WorkflowSchedule, WorkflowRun, WorkflowShare, get_session, engine
from croniter import croniter
import pytz
from helpers.Firebase_helpers import FirebaseUser, get_current_user
import firebase_admin.auth as auth

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Global storage for running workflows and their output streams
running_workflows = {}  # workflow_run_id -> {"thread": thread, "output_queue": queue, "stop_event": threading.Event}

# Pydantic models for request/response
class WorkflowCreate(BaseModel):
    title: str
    description: Optional[str] = None
    code: str

class WorkflowUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None
    status: Optional[str] = None

class WorkflowScheduleCreate(BaseModel):
    cron_expression: str
    timezone: str = "UTC"
    is_active: bool = True

class WorkflowResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    code: str
    status: str
    last_run: Optional[datetime]
    last_run_status: Optional[str]
    created_at: datetime
    updated_at: datetime
    user_id: str

class WorkflowRunResponse(BaseModel):
    id: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    output: Optional[str]
    error: Optional[str]
    triggered_by: str
    duration_seconds: Optional[float]
    workflow_id: str

class ShareWorkflowRequest(BaseModel):
    email: str  # Changed from EmailStr to str to avoid email-validator dependency

class SharedUserResponse(BaseModel):
    id: str
    email: str
    shared_at: datetime

# Remove this duplicate line that was added
# Workflow.shares = Relationship(back_populates="workflow")

def get_current_user_id(current_user: FirebaseUser) -> str:
    return current_user.uid

# Stream capture class to write output to the database in real-time for polling
class LiveDBStreamCapture:
    def __init__(self, original_stream, run_id: int, session: Session, stop_event: threading.Event, is_error: bool = False):
        self.original_stream = original_stream
        self.run_id = run_id
        self.session = session
        self.stop_event = stop_event
        self.is_error = is_error
        self._buffer = []

    def write(self, text: str):
        if self.stop_event.is_set() or not text:
            return
        
        self._buffer.append(text)
        try:
            # Use a separate, short-lived session for each write to ensure thread safety and avoid conflicts.
            with Session(engine) as update_session:
                db_run = update_session.get(WorkflowRun, self.run_id)
                if db_run:
                    if self.is_error:
                        db_run.error = (db_run.error or "") + text
                    else:
                        db_run.output = (db_run.output or "") + text
                    update_session.add(db_run)
                    update_session.commit()
        except Exception as e:
            # Use original stdout to prevent recursion if logging is also redirected
            print(f"Error updating database during stream: {e}", file=sys.__stdout__)

    def flush(self):
        pass  # Not needed as we write immediately

    def get_value(self):
        return "".join(self._buffer)

    def __getattr__(self, attr):
        return getattr(self.original_stream, attr)

# Custom logging handler to redirect logs to the live database stream
class DatabaseLogHandler(logging.Handler):
    def __init__(self, stream_capture: LiveDBStreamCapture):
        super().__init__()
        self.stream_capture = stream_capture

    def emit(self, record: logging.LogRecord):
        log_entry = self.format(record)
        # Prepending the levelname to the log message to provide context
        self.stream_capture.write(f"[{record.levelname}] {log_entry}\n")

def run_workflow_in_thread(workflow_id: str, code: str, run_id: int, stop_event: threading.Event):
    """
    This function runs in a separate thread. It executes the workflow code,
    writes all output (stdout, stderr, and logs) to the database in real-time.
    """
    import sys
    from ai.workflow_context import get_assistant_workflow_context
    from sqlmodel import Session

    run_start_time = datetime.now(timezone.utc)
    status = "pending"
    error_message = ""
    
    # Each thread must have its own session for the main execution loop
    with Session(engine) as session:
        # Setup stream capturing to write directly to DB
        stdout_capture = LiveDBStreamCapture(sys.stdout, run_id, session, stop_event, is_error=False)
        stderr_capture = LiveDBStreamCapture(sys.stderr, run_id, session, stop_event, is_error=True)

        # Setup root logger to capture all logs from this thread
        root_logger = logging.getLogger()
        original_handlers = root_logger.handlers[:]
        log_handler = DatabaseLogHandler(stdout_capture) # Send logs to stdout stream
        
        try:
            # Clear other handlers and add our db handler
            root_logger.handlers = [log_handler]
            root_logger.setLevel(logging.INFO)

            # Redirect stdout/stderr BEFORE building context so context bootstrap logs are captured
            original_stdout = sys.stdout
            original_stderr = sys.stderr
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            # Mark as running in the DB and write initial message
            db_run = session.get(WorkflowRun, run_id)
            if db_run:
                db_run.status = "running"
                db_run.started_at = run_start_time
                # Write initial message directly to the output field
                db_run.output = f"[{run_start_time.strftime('%H:%M:%S')}] Starting workflow execution...\n"
                session.add(db_run)
                session.commit()
            
            # Get workflow context
            workflow_context = get_assistant_workflow_context(workflow_id, session)
            # Ensure scripts guarded by if __name__ == '__main__' run under this executor
            workflow_context['__name__'] = '__main__'
            
            def check_for_stop():
                if stop_event.is_set():
                    raise InterruptedError("Workflow stopped by user.")
            workflow_context['check_for_stop'] = check_for_stop

            try:
                # Execute the code
                exec(code, workflow_context)
                status = "success"
            finally:
                # Always restore original streams
                sys.stdout = original_stdout
                sys.stderr = original_stderr

        except InterruptedError as e:
            status = "stopped"
            error_message = str(e)
            stderr_capture.write(f"\n--- {error_message} ---\n")
        except Exception as e:
            status = "error"
            tb = traceback.format_exc()
            error_message = f"Execution error: {e}\n{tb}"
            stderr_capture.write(f"\n--- {error_message} ---\n")
        
        finally:
            # Restore original logging configuration
            root_logger.handlers = original_handlers
            root_logger.setLevel(logging.getLogger().level) # Restore original level

            # Final database update
            run_end_time = datetime.now(timezone.utc)
            db_run = session.get(WorkflowRun, run_id)
            db_workflow = session.get(Workflow, workflow_id)

            if db_run:
                db_run.status = status
                db_run.completed_at = run_end_time
                db_run.duration_seconds = (run_end_time - run_start_time).total_seconds()
                # The output/error fields are already populated by the live stream capture
                session.add(db_run)

            if db_workflow:
                db_workflow.last_run = run_end_time
                db_workflow.last_run_status = status
                session.add(db_workflow)
                
            session.commit()

            # Clean up from global registry
            if run_id in running_workflows:
                del running_workflows[run_id]

# Workflow execution helper with real-time output streaming (for SSE)
async def execute_workflow_code_streaming(workflow_id: str, code: str, session: Session, run_id: int, output_queue: queue.Queue, stop_event: threading.Event) -> tuple[str, str, str]:
    """Execute Python code with injected context and stream output in real-time"""
    from io import StringIO
    from io import StringIO
    import threading
    import queue
    
    # Get workflow context with injected functions including assistant workflow management
    from ai.workflow_context import get_assistant_workflow_context
    workflow_context = get_assistant_workflow_context(workflow_id, session)
    
    # Create a queue to store the final result
    result_queue = queue.Queue()
    
    class StreamCapture:
        def __init__(self, original_stream, output_queue, stop_event):
            self.original_stream = original_stream
            self.output_queue = output_queue
            self.stop_event = stop_event
            self.buffer = ""
        
        def write(self, text):
            if self.stop_event.is_set():
                return
            
            self.buffer += text
            # Send output immediately, don't wait for newlines
            if self.buffer:
                try:
                    self.output_queue.put({
                        "type": "output",
                        "data": self.buffer,
                        "timestamp": datetime.now().isoformat()
                    })
                    self.buffer = ""  # Clear buffer after sending
                except:
                    pass  # Queue might be full or closed
        
        def flush(self):
            if self.buffer and not self.stop_event.is_set():
                try:
                    self.output_queue.put({
                        "type": "output", 
                        "data": self.buffer,
                        "timestamp": datetime.now().isoformat()
                    })
                    self.buffer = ""
                except:
                    pass
        
        def __getattr__(self, attr):
            return getattr(self.original_stream, attr)
    
    def run_code():
        try:
            # Capture stdout and stderr with streaming
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            
            stdout_capture = StreamCapture(sys.stdout, output_queue, stop_event)
            stderr_capture = StreamCapture(sys.stderr, output_queue, stop_event)
            
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            # Send start message
            output_queue.put({
                "type": "status",
                "data": "running",
                "timestamp": datetime.now().isoformat()
            })

            # Execute the code with the injected context
            # Add explicit flush to the workflow context
            workflow_context['flush'] = lambda: (stdout_capture.flush(), stderr_capture.flush())
            exec(code, workflow_context)

            # Restore stdout and stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            
            # Flush any remaining output
            stdout_capture.flush()
            stderr_capture.flush()

            # Send completion message
            output_queue.put({
                "type": "status",
                "data": "completed",
                "timestamp": datetime.now().isoformat()
            })

            result_queue.put(("success", "", ""))

        except Exception as e:
            # Restore stdout and stderr in case of exception
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            
            # Send error message
            error_msg = f"Execution error: {str(e)}"
            output_queue.put({
                "type": "error",
                "data": error_msg,
                "timestamp": datetime.now().isoformat()
            })
            
            result_queue.put(("error", "", error_msg))

    # Create and start the thread
    thread = threading.Thread(target=run_code)
    thread.daemon = True
    thread.start()
    
    # Store the thread reference for potential stopping
    running_workflows[run_id] = {
        "thread": thread,
        "output_queue": output_queue,
        "stop_event": stop_event
    }
    
    try:
        # Wait for the result with timeout (10 minutes for workflows)
        status, output, error = result_queue.get(timeout=600)
        return status, output, error

    except queue.Empty:
        # Timeout occurred
        output_queue.put({
            "type": "error",
            "data": "Workflow execution timed out after 10 minutes",
            "timestamp": datetime.now().isoformat()
        })
        return "timeout", "", "Workflow execution timed out after 10 minutes"
    finally:
        # Clean up
        if run_id in running_workflows:
            del running_workflows[run_id]

# Original synchronous execution helper (kept for compatibility)
async def execute_workflow_code(workflow_id: str, code: str, session: Session) -> tuple[str, str, str]:
    """Execute Python code with injected context similar to python_interpreter"""
    import threading
    import queue
    
    # Get workflow context with injected functions including assistant workflow management
    from ai.workflow_context import get_assistant_workflow_context
    workflow_context = get_assistant_workflow_context(workflow_id, session)
    
    # Create a queue to store the result
    result_queue = queue.Queue()
    
    def run_code():
        try:
            # Capture stdout and stderr
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            from io import StringIO as _StringIO
            stdout_capture = _StringIO()
            stderr_capture = _StringIO()
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            # Execute the code with the injected context
            exec(code, workflow_context)

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
        return status, output, error

    except queue.Empty:
        # Timeout occurred
        return "timeout", "", "Workflow execution timed out after 10 minutes"

# Calculate next run time for cron expression
def calculate_next_run(cron_expression: str, timezone_str: str = "UTC") -> datetime:
    """Calculate the next run time based on cron expression"""
    try:
        tz = pytz.timezone(timezone_str)
        now = datetime.now(tz)
        cron = croniter(cron_expression, now)
        next_run = cron.get_next(datetime)
        return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
    except Exception:
        # If cron parsing fails, default to 1 hour from now
        return datetime.now(timezone.utc) + timedelta(hours=1)

# Routes
@router.get("", response_model=List[WorkflowResponse])
@router.get("/", response_model=List[WorkflowResponse])
def get_workflows(
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get all workflows for the current user (including shared ones)"""
    user_id = get_current_user_id(current_user)
    
    # Get user's own workflows
    own_workflows = session.exec(
        select(Workflow).where(Workflow.user_id == user_id)
    ).all()
    
    # Get workflows shared with user
    shared_workflows = session.exec(
        select(Workflow).join(WorkflowShare).where(
            WorkflowShare.user_id == user_id
        )
    ).all()
    
    # Combine and return unique workflows
    all_workflows = list({w.id: w for w in own_workflows + shared_workflows}.values())
    return all_workflows

@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: str,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get a specific workflow"""
    user_id = get_current_user_id(current_user)
    return check_workflow_access(workflow_id, user_id, session)

@router.post("/", response_model=WorkflowResponse)
def create_workflow(
    workflow_data: WorkflowCreate,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Create a new workflow"""
    user_id = get_current_user_id(current_user)
    
    # Create workflow
    workflow = Workflow(
        id=str(uuid.uuid4()),
        title=workflow_data.title,
        description=workflow_data.description,
        code=workflow_data.code,
        user_id=user_id
    )
    
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow

@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: str, 
    workflow_data: WorkflowUpdate, 
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Update a workflow"""
    user_id = get_current_user_id(current_user)
    statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Update fields if provided
    if workflow_data.title is not None:
        workflow.title = workflow_data.title
    if workflow_data.description is not None:
        workflow.description = workflow_data.description
    if workflow_data.code is not None:
        workflow.code = workflow_data.code
    if workflow_data.status is not None:
        workflow.status = workflow_data.status
    
    workflow.updated_at = datetime.now(timezone.utc)
    session.add(workflow)
    session.commit()
    session.refresh(workflow)
    return workflow

@router.delete("/{workflow_id}")
def delete_workflow(
    workflow_id: str,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Delete a workflow"""
    user_id = get_current_user_id(current_user)
    statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    session.delete(workflow)
    session.commit()
    return {"message": "Workflow deleted successfully"}

@router.post("/{workflow_id}/run", response_model=WorkflowRunResponse)
async def run_workflow(
    workflow_id: str, 
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Execute a workflow"""
    user_id = get_current_user_id(current_user)
    statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Create workflow run record
    workflow_run = WorkflowRun(
        workflow_id=workflow_id,
        status="pending",
        triggered_by="manual"
    )
    session.add(workflow_run)
    session.commit()
    session.refresh(workflow_run)
    
    # Extract workflow code before background task to avoid detached instance error
    workflow_code = workflow.code
    
    # Execute the workflow in background (threaded with DB log capture)
    async def execute_in_background():
        # We delegate execution to the same threaded runner used by streaming
        # so stdout/stderr and logging are captured to DB instead of server console.
        stop_event = threading.Event()
        thread = threading.Thread(
            target=run_workflow_in_thread,
            args=(workflow_id, workflow_code, workflow_run.id, stop_event)
        )
        thread.daemon = True
        thread.start()
    
    background_tasks.add_task(execute_in_background)
    
    return workflow_run

@router.post("/{workflow_id}/run/stream", response_model=WorkflowRunResponse)
async def run_workflow_streaming(
    workflow_id: str, 
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Execute a workflow with streaming output and return streaming info"""
    user_id = get_current_user_id(current_user)
    statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Create workflow run record
    workflow_run = WorkflowRun(
        workflow_id=workflow_id,
        status="pending",
        triggered_by="manual"
    )
    session.add(workflow_run)
    session.commit()
    session.refresh(workflow_run)
    
    # Communication channels are now just for stopping the thread
    stop_event = threading.Event()
    
    # Create and start the background thread
    thread = threading.Thread(
        target=run_workflow_in_thread,
        args=(workflow.id, workflow.code, workflow_run.id, stop_event)
    )
    thread.daemon = True
    
    # Store thread and stop event in global dict
    running_workflows[workflow_run.id] = {
        "thread": thread,
        "output_queue": None, # Queue is no longer used for streaming
        "stop_event": stop_event
    }
    
    thread.start()
    
    return workflow_run


@router.get("/{workflow_id}/runs/{run_id}/stream-url")
async def get_stream_url(
    request: Request,
    workflow_id: str,
    run_id: int,
    session: Session = Depends(get_session)
):
    """Get a streaming URL with embedded auth for EventSource"""
    current_user = request.state.user
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Create a temporary token for streaming
    import secrets
    import time
    stream_token = f"{user_id}:{int(time.time())}:{secrets.token_urlsafe(32)}"
    
    # Store the token temporarily (in production, use Redis or similar)
    # For now, we'll use a simple in-memory store with expiration
    if not hasattr(get_stream_url, '_stream_tokens'):
        get_stream_url._stream_tokens = {}
    
    # Clean up expired tokens (older than 1 hour)
    current_time = int(time.time())
    get_stream_url._stream_tokens = {
        k: v for k, v in get_stream_url._stream_tokens.items() 
        if current_time - int(k.split(':')[1]) < 3600
    }
    
    # Store the token
    get_stream_url._stream_tokens[stream_token] = user_id
    
    return {
        "stream_url": f"/api/v1/workflows/{workflow_id}/runs/{run_id}/stream?token={stream_token}"
    }

@router.get("/{workflow_id}/runs/{run_id}/stream")
async def stream_workflow_logs(
    workflow_id: str,
    run_id: int,
    token: str = None,
    session: Session = Depends(get_session)
):
    """Stream workflow execution logs in real-time"""
    # Validate the temporary stream token
    if not token:
        raise HTTPException(status_code=401, detail="Stream token required")
    
    # Check if token exists and is valid
    if not hasattr(get_stream_url, '_stream_tokens'):
        raise HTTPException(status_code=403, detail="Invalid stream token")
    
    user_id = get_stream_url._stream_tokens.get(token)
    if not user_id:
        raise HTTPException(status_code=403, detail="Invalid or expired stream token")
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Verify run exists
    run_statement = select(WorkflowRun).where(
        WorkflowRun.id == run_id,
        WorkflowRun.workflow_id == workflow_id
    )
    workflow_run = session.exec(run_statement).first()
    if not workflow_run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    
    # THIS STREAMING ENDPOINT IS NO LONGER USED BY THE FRONTEND'S POLLING MECHANISM
    # It is kept for potential future use with a real SSE client.
    # The current frontend polls /runs/{run_id} instead.
    async def generate_stream():
        """Generate Server-Sent Events stream"""
        try:
            # Check if this run is currently executing
            if run_id in running_workflows:
                output_queue = running_workflows.get(run_id, {}).get("output_queue")
                
                # This part is now less relevant as queue is not used for logs
                if output_queue:
                    while True:
                        try:
                            output_data = output_queue.get(timeout=1.0)
                            if output_data.get("type") == "control" and output_data.get("data") == "finished":
                                break
                            yield f"data: {json.dumps(output_data)}\n\n"
                        except queue.Empty:
                            thread = running_workflows.get(run_id, {}).get("thread")
                            if not thread or not thread.is_alive():
                                break
                            continue
                        except Exception:
                            break
                
                # Fallback to historical data after run
                final_run = session.get(WorkflowRun, run_id)
                if final_run:
                    yield f"data: {json.dumps({'type': 'status', 'data': final_run.status, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
            else:
                # Run is not currently executing, send historical data
                yield f"data: {json.dumps({'type': 'status', 'data': workflow_run.status, 'timestamp': workflow_run.started_at.isoformat()})}\n\n"
                if workflow_run.output:
                    yield f"data: {json.dumps({'type': 'output', 'data': workflow_run.output, 'timestamp': workflow_run.completed_at.isoformat() if workflow_run.completed_at else datetime.now().isoformat()})}\n\n"
                if workflow_run.error:
                    yield f"data: {json.dumps({'type': 'error', 'data': workflow_run.error, 'timestamp': workflow_run.completed_at.isoformat() if workflow_run.completed_at else datetime.now().isoformat()})}\n\n"
                
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': f'Stream error: {str(e)}', 'timestamp': datetime.now().isoformat()})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )

@router.post("/{workflow_id}/runs/{run_id}/stop")
async def stop_workflow_run(
    workflow_id: str,
    run_id: int,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Stop a running workflow"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get the run record first
    run_statement = select(WorkflowRun).where(
        WorkflowRun.id == run_id,
        WorkflowRun.workflow_id == workflow_id
    )
    workflow_run = session.exec(run_statement).first()
    if not workflow_run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    
    # Check if workflow is currently running
    if workflow_run.status not in ['running', 'pending']:
        raise HTTPException(status_code=400, detail=f"Workflow run is not currently executing (status: {workflow_run.status})")
    
    # Check if we have a stop event for this run (SSE version)
    if run_id in running_workflows:
        # Stop the execution via stop event
        stop_event = running_workflows[run_id]["stop_event"]
        stop_event.set()
    
    # Update run status in database (works for both execution methods)
    workflow_run.status = "stopped"
    workflow_run.completed_at = datetime.now(timezone.utc)
    workflow_run.error = (workflow_run.error or "") + f"\n[{datetime.now().strftime('%H:%M:%S')}] Workflow execution stopped by user"
    session.add(workflow_run)
    session.commit()
    
    return {"message": "Workflow execution stopped successfully"}

@router.get("/{workflow_id}/runs/{run_id}", response_model=WorkflowRunResponse)
def get_workflow_run(
    workflow_id: str,
    run_id: int,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get a specific workflow run"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get the specific run
    run_statement = select(WorkflowRun).where(
        WorkflowRun.id == run_id,
        WorkflowRun.workflow_id == workflow_id
    )
    workflow_run = session.exec(run_statement).first()
    if not workflow_run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    
    return workflow_run

@router.get("/{workflow_id}/runs", response_model=List[WorkflowRunResponse])
def get_workflow_runs(
    workflow_id: str, 
    skip: int = 0, 
    limit: int = 50,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get workflow run history"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get runs
    runs_statement = select(WorkflowRun).where(
        WorkflowRun.workflow_id == workflow_id
    ).order_by(WorkflowRun.started_at.desc()).offset(skip).limit(limit)
    
    runs = session.exec(runs_statement).all()
    return runs

@router.post("/{workflow_id}/schedule")
def create_schedule(
    workflow_id: str,
    schedule_data: WorkflowScheduleCreate,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Create a schedule for a workflow"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Calculate next run time
    next_run = calculate_next_run(schedule_data.cron_expression, schedule_data.timezone)
    
    # Create schedule
    schedule = WorkflowSchedule(
        cron_expression=schedule_data.cron_expression,
        timezone=schedule_data.timezone,
        is_active=schedule_data.is_active,
        next_run=next_run,
        workflow_id=workflow_id
    )
    
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return schedule

@router.get("/{workflow_id}/schedules")
def get_workflow_schedules(
    workflow_id: str,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get all schedules for a workflow"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get schedules
    schedules_statement = select(WorkflowSchedule).where(
        WorkflowSchedule.workflow_id == workflow_id
    ).order_by(WorkflowSchedule.created_at.desc())
    
    schedules = session.exec(schedules_statement).all()
    return schedules

@router.delete("/{workflow_id}/schedules/{schedule_id}")
def delete_schedule(
    workflow_id: str,
    schedule_id: int,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Delete a workflow schedule"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow_statement = select(Workflow).where(
        Workflow.id == workflow_id, 
        Workflow.user_id == user_id
    )
    workflow = session.exec(workflow_statement).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get and delete schedule
    schedule_statement = select(WorkflowSchedule).where(
        WorkflowSchedule.id == schedule_id,
        WorkflowSchedule.workflow_id == workflow_id
    )
    schedule = session.exec(schedule_statement).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    session.delete(schedule)
    session.commit()
    return {"message": "Schedule deleted successfully"} 

@router.get("/{workflow_id}/shared", response_model=List[SharedUserResponse])
async def get_shared_users(
    workflow_id: str,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Get list of users this workflow is shared with"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow = session.exec(
        select(Workflow).where(
            Workflow.id == workflow_id,
            Workflow.user_id == user_id
        )
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Get shared users
    shares = session.exec(
        select(WorkflowShare).where(WorkflowShare.workflow_id == workflow_id)
    ).all()
    
    # Get user details from Firebase
    shared_users = []
    for share in shares:
        try:
            user = auth.get_user(share.user_id)
            shared_users.append({
                "id": user.uid,
                "email": user.email,
                "shared_at": share.shared_at
            })
        except:
            # Skip users that can't be found
            continue
    
    return shared_users

@router.post("/{workflow_id}/share")
async def share_workflow(
    workflow_id: str,
    share_data: ShareWorkflowRequest,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Share workflow with another user"""
    user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow = session.exec(
        select(Workflow).where(
            Workflow.id == workflow_id,
            Workflow.user_id == user_id
        )
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    try:
        # Find user by email
        user_to_share = auth.get_user_by_email(share_data.email)
        
        # Don't allow sharing with self
        if user_to_share.uid == user_id:
            raise HTTPException(status_code=400, detail="Cannot share workflow with yourself")
        
        # Check if already shared
        existing_share = session.exec(
            select(WorkflowShare).where(
                WorkflowShare.workflow_id == workflow_id,
                WorkflowShare.user_id == user_to_share.uid
            )
        ).first()
        
        if existing_share:
            raise HTTPException(status_code=400, detail="Workflow already shared with this user")
        
        # Create share
        share = WorkflowShare(
            workflow_id=workflow_id,
            user_id=user_to_share.uid,
            shared_by=user_id
        )
        
        session.add(share)
        session.commit()
        
        return {"message": "Workflow shared successfully"}
        
    except auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{workflow_id}/share/{user_id}")
async def remove_workflow_share(
    workflow_id: str,
    user_id: str,
    session: Session = Depends(get_session),
    current_user: FirebaseUser = Depends(get_current_user)
):
    """Remove workflow share from a user"""
    current_user_id = get_current_user_id(current_user)
    
    # Verify workflow belongs to user
    workflow = session.exec(
        select(Workflow).where(
            Workflow.id == workflow_id,
            Workflow.user_id == current_user_id
        )
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Find and delete share
    share = session.exec(
        select(WorkflowShare).where(
            WorkflowShare.workflow_id == workflow_id,
            WorkflowShare.user_id == user_id
        )
    ).first()
    
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    session.delete(share)
    session.commit()
    
    return {"message": "Share removed successfully"} 

# Add the missing check_workflow_access function
def check_workflow_access(
    workflow_id: str,
    user_id: str,
    session: Session
) -> Workflow:
    """Check if user has access to workflow (owns or shared)"""
    workflow = session.exec(
        select(Workflow).where(
            (Workflow.id == workflow_id) & 
            (
                (Workflow.user_id == user_id) |
                exists().where(
                    (WorkflowShare.workflow_id == workflow_id) &
                    (WorkflowShare.user_id == user_id)
                )
            )
        )
    ).first()
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    return workflow 