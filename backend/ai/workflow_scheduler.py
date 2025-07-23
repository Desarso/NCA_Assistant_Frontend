"""
Workflow Scheduler Service
Handles automatic execution of workflows based on their cron schedules
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List
from sqlmodel import Session, select
from croniter import croniter
import pytz

from ai.models import Workflow, WorkflowSchedule, WorkflowRun, engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WorkflowScheduler:
    def __init__(self, check_interval: int = 60):
        """
        Initialize the workflow scheduler
        
        Args:
            check_interval: How often to check for scheduled workflows (in seconds)
        """
        self.check_interval = check_interval
        self.running = False
        
    async def start(self):
        """Start the scheduler"""
        logger.info("Starting workflow scheduler...")
        self.running = True
        
        while self.running:
            try:
                await self.check_and_run_scheduled_workflows()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(self.check_interval)
    
    def stop(self):
        """Stop the scheduler"""
        logger.info("Stopping workflow scheduler...")
        self.running = False
    
    async def check_and_run_scheduled_workflows(self):
        """Check for workflows that need to be executed and run them"""
        try:
            with Session(engine) as session:
                now = datetime.now(timezone.utc)
                
                # Get all active schedules that are due to run
                statement = select(WorkflowSchedule).where(
                    WorkflowSchedule.is_active == True,
                    WorkflowSchedule.next_run <= now
                ).join(Workflow).where(
                    Workflow.status == "active"
                )
                
                due_schedules = session.exec(statement).all()
                
                if due_schedules:
                    logger.info(f"Found {len(due_schedules)} workflows due to run")
                
                for schedule in due_schedules:
                    try:
                        await self.execute_scheduled_workflow(schedule, session)
                        self.update_next_run(schedule, session)
                    except Exception as e:
                        logger.error(f"Error executing scheduled workflow {schedule.workflow_id}: {e}")
                
                if due_schedules:
                    session.commit()
                    
        except Exception as e:
            logger.error(f"Error checking scheduled workflows: {e}")
    
    async def execute_scheduled_workflow(self, schedule: WorkflowSchedule, session: Session):
        """Execute a scheduled workflow"""
        try:
            workflow = session.get(Workflow, schedule.workflow_id)
            if not workflow:
                logger.error(f"Workflow {schedule.workflow_id} not found")
                return
            
            logger.info(f"Executing scheduled workflow: {workflow.title} ({workflow.id})")
            
            # Create workflow run record
            workflow_run = WorkflowRun(
                workflow_id=workflow.id,
                status="pending",
                triggered_by="schedule"
            )
            session.add(workflow_run)
            session.flush()  # Get the ID
            
            # Execute the workflow
            run_start = datetime.now(timezone.utc)
            workflow_run.status = "running"
            workflow_run.started_at = run_start
            session.add(workflow_run)
            session.flush()
            
            # Execute the code
            status, output, error = await self.execute_workflow_code(workflow.code, workflow.id)
            
            # Update run with results
            run_end = datetime.now(timezone.utc)
            workflow_run.status = status
            workflow_run.completed_at = run_end
            workflow_run.output = output
            workflow_run.error = error
            workflow_run.duration_seconds = (run_end - run_start).total_seconds()
            
            # Update workflow last run info
            workflow.last_run = run_end
            workflow.last_run_status = status
            workflow.last_run_output = output
            workflow.last_run_error = error
            
            session.add(workflow_run)
            session.add(workflow)
            
            logger.info(f"Workflow {workflow.title} completed with status: {status}")
            
        except Exception as e:
            logger.error(f"Error executing workflow {schedule.workflow_id}: {e}")
            
            # Update run with error
            if 'workflow_run' in locals():
                workflow_run.status = "error"
                workflow_run.error = str(e)
                workflow_run.completed_at = datetime.now(timezone.utc)
                session.add(workflow_run)
    
    async def execute_workflow_code(self, code: str, workflow_id: str = None) -> tuple[str, str, str]:
        """Execute Python code with injected context similar to python_interpreter"""
        import sys
        from io import StringIO
        import threading
        import queue
        
        # Get workflow context with injected functions including assistant workflow management
        from ai.workflow_context import get_assistant_workflow_context
        workflow_context = get_assistant_workflow_context(workflow_id)
        
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
            # Wait for the result with timeout (10 minutes)
            status, output, error = result_queue.get(timeout=600)
            return status, output, error

        except queue.Empty:
            # Timeout occurred
            return "timeout", "", "Workflow execution timed out after 10 minutes"
    
    def update_next_run(self, schedule: WorkflowSchedule, session: Session):
        """Update the next run time for a schedule"""
        try:
            tz = pytz.timezone(schedule.timezone)
            now = datetime.now(tz)
            cron = croniter(schedule.cron_expression, now)
            next_run = cron.get_next(datetime)
            
            schedule.next_run = next_run.astimezone(pytz.UTC).replace(tzinfo=None)
            schedule.updated_at = datetime.now(timezone.utc)
            session.add(schedule)
            
            logger.debug(f"Updated next run for schedule {schedule.id}: {schedule.next_run}")
            
        except Exception as e:
            logger.error(f"Error updating next run for schedule {schedule.id}: {e}")
            # Set next run to 1 hour from now as fallback
            schedule.next_run = datetime.now(timezone.utc) + timedelta(hours=1)
            session.add(schedule)


# Global scheduler instance
scheduler = WorkflowScheduler()

async def start_scheduler():
    """Start the workflow scheduler"""
    await scheduler.start()

def stop_scheduler():
    """Stop the workflow scheduler"""
    scheduler.stop()

# Function to run scheduler in background
async def run_scheduler_background():
    """Run the scheduler as a background task"""
    try:
        await start_scheduler()
    except Exception as e:
        logger.error(f"Scheduler error: {e}") 