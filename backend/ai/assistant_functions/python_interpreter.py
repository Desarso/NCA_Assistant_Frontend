# add a python interpreter tool

import sys
from io import StringIO
import threading
import queue
from typing import Optional, Dict, Any, Tuple
import logging
from error_logger.error_logger import ErrorLogger
import traceback

from pydantic_ai.tools import RunContext
from ai.assistant_functions.graph import graph_api_request_no_ctx

# Initialize error logger
error_logger = ErrorLogger()

# Create a default_api class to match the expected structure
class DefaultApi:
    def __init__(self):
        self.graph_api_request = graph_api_request_no_ctx

def python_interpreter(
    ctx: RunContext, code: str
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Executes Python code in the current environment.
    The following functions are automatically imported and available:
    - graph_api_request_no_ctx: For making Graph API requests
    - default_api.graph_api_request: Same as graph_api_request_no_ctx
    - graph_api_request: Same as graph_api_request_no_ctx
    
    Example usage:
        # List users (any of these will work):
        users, error = graph_api_request_no_ctx(method='GET', path='/users', query_params={'$select': 'id'})
        users, error = default_api.graph_api_request(method='GET', path='/users', query_params={'$select': 'id'})
        users, error = graph_api_request(method='GET', path='/users', query_params={'$select': 'id'})
        
        # List channels (any of these will work):
        channels, error = graph_api_request_no_ctx(method='GET', path='/teams/{{team-id}}/channels', query_params={'$select': 'id,displayName'})
        channels, error = default_api.graph_api_request(method='GET', path='/teams/{{team-id}}/channels', query_params={'$select': 'id,displayName'})
        channels, error = graph_api_request(method='GET', path='/teams/{{team-id}}/channels', query_params={'$select': 'id,displayName'})
    
    Args:
        code (str): The Python code to execute.

    Returns:
        tuple: A tuple containing:
            - The output of the Python code.
            - An error dictionary if an error occurred, or None if successful.
    """
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

            # Create execution context with pre-imported functions
            exec_context = {
                'graph_api_request_no_ctx': graph_api_request_no_ctx,
                'graph_api_request': graph_api_request_no_ctx,  # Alias for convenience
                'default_api': DefaultApi(),  # Create instance of DefaultApi
            }

            # Execute the code with the pre-imported context
            exec(code, exec_context)

            # Restore stdout and stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr

            # Get the captured output
            output = stdout_capture.getvalue()
            error_output = stderr_capture.getvalue()

            if error_output:
                error_params = {
                    "code": code,
                    "error_output": error_output,
                    "user_id": ctx.deps.user_object.uid if ctx and ctx.deps and ctx.deps.user_object else None
                }
                error_result = error_logger.log_error(
                    function_name="python_interpreter",
                    error_text="Code execution produced errors",
                    parameters=error_params,
                    stack_trace=traceback.format_exc()
                )
                result_queue.put((None, error_result))
            else:
                result_queue.put((output, None))

        except Exception as e:
            # Restore stdout and stderr in case of exception
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            error_params = {
                "code": code,
                "user_id": ctx.deps.user_object.uid if ctx and ctx.deps and ctx.deps.user_object else None
            }
            error_result = error_logger.log_error(
                function_name="python_interpreter",
                error_text=f"Execution error: {str(e)}",
                parameters=error_params,
                stack_trace=traceback.format_exc()
            )
            result_queue.put((None, error_result))

    # Create and start the thread
    thread = threading.Thread(target=run_code)
    thread.daemon = True
    thread.start()

    try:
        # Wait for the result with timeout
        output, error = result_queue.get(timeout=30)
        return output, error

    except queue.Empty:
        # If the thread is still running, we need to stop it
        if thread.is_alive():
            # Note: This is a best-effort attempt to stop the thread
            # Python threads cannot be forcefully terminated
            pass
        error_params = {
            "code": code,
            "user_id": ctx.deps.user_object.uid if ctx and ctx.deps and ctx.deps.user_object else None
        }
        error_result = error_logger.log_error(
            function_name="python_interpreter",
            error_text="Code execution exceeded 30 second timeout",
            parameters=error_params,
            stack_trace=traceback.format_exc()
        )
        return None, error_result

if __name__ == "__main__":
    print(
        python_interpreter(None, "print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))")
    )
