# add a python interpreter tool

import sys
from io import StringIO
import threading
import queue
from typing import Optional, Dict, Any, Union
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
) -> Union[str, Dict[str, Any]]:
    """
    Executes Python code in the current environment.
    The following functions are automatically imported and available:
    - graph_api_request_no_ctx: For making Graph API requests
    - default_api.graph_api_request: Same as graph_api_request_no_ctx
    - graph_api_request: Same as graph_api_request_no_ctx
    
    Args:
        code (str): The Python code to execute.

    Returns:
        Union[str, Dict[str, Any]]:
            - On success: The captured standard output (stdout) as a string.
            - On failure: An error dictionary containing details (from error_logger).
                         This includes execution errors, timeouts, text sent to stderr,
                         or text sent to stdout starting with "Error:".
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
                result_queue.put(error_result)
            elif output.strip().startswith("Error:"):
                error_params = {
                    "code": code,
                    "stdout_error": output.strip(),
                    "user_id": ctx.deps.user_object.uid if ctx and ctx.deps and ctx.deps.user_object else None
                }
                error_result = error_logger.log_error(
                    function_name="python_interpreter",
                    error_text="Code execution printed an error message to stdout",
                    parameters=error_params,
                    stack_trace=None
                )
                result_queue.put(error_result)
            else:
                result_queue.put(output)

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
            result_queue.put(error_result)

    # Create and start the thread
    thread = threading.Thread(target=run_code)
    thread.daemon = True
    thread.start()

    try:
        # Wait for the result with timeout
        result = result_queue.get(timeout=30)
        return result

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
        return error_result

if __name__ == "__main__":
    # Note: This test call might need adjustment based on how you handle RunContext
    # For simple testing, creating a dummy context or handling None might be needed.
    # Example of direct call (might raise error if context is strictly needed):
    # print(python_interpreter(None, "print('Hello')")) 
    # Example with a dummy context (adapt as needed):
    class DummyDeps: user_object = type('obj', (object,), {'uid': 'test-user'})()
    class DummyContext: deps = DummyDeps()
    # print(python_interpreter(DummyContext(), "print('Test successful output')"))
    # print(python_interpreter(DummyContext(), "import sys; sys.stderr.write('Test stderr error')"))
    # print(python_interpreter(DummyContext(), "print('Error: Test stdout error')"))
    # print(python_interpreter(DummyContext(), "raise ValueError('Test exception')"))
    pass # Keep the __main__ block but comment out the potentially problematic print
#    print(
#        python_interpreter(None, "print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))")
#    )
