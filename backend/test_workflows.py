#!/usr/bin/env python3
"""
Test script for workflow functionality.
Creates a sample user and workflow to test the system.
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from datetime import datetime
from sqlmodel import Session, select
from ai.models import engine, User, Workflow, WorkflowSchedule, create_db_and_tables

def create_test_user():
    """Create a test user for workflow testing"""
    with Session(engine) as session:
        # Check if default user exists
        statement = select(User).where(User.id == "default_user")
        existing_user = session.exec(statement).first()
        
        if not existing_user:
            user = User(
                id="default_user",
                email="test@example.com",
                name="Test User",
                preferred_model="gemini"
            )
            session.add(user)
            session.commit()
            print("✅ Created test user: default_user")
        else:
            print("✅ Test user already exists")

def create_sample_workflow():
    """Create a sample workflow for testing"""
    sample_code = """#!/usr/bin/env python3

workflow_log("Starting sample workflow execution", "INFO")
workflow_log(f"Workflow ID: {workflow_id}")
workflow_log(f"Current time: {datetime.datetime.now()}")

# Demonstrate access to injected functions
workflow_log("Available injected functions:", "INFO")
try:
    workflow_log(f"- graph_api_request_no_ctx: {callable(graph_api_request_no_ctx)}")
    workflow_log(f"- graph_api_request: {callable(graph_api_request)}")
    workflow_log(f"- default_api.graph_api_request: {callable(default_api.graph_api_request)}")
except NameError:
    workflow_log("Graph API functions not available", "WARN")

# Demonstrate workflow utility functions
workflow_log("Testing workflow utility functions:", "INFO")
workflow_log(f"- workflow_log: {callable(workflow_log)}")
workflow_log(f"- workflow_sleep: {callable(workflow_sleep)}")
workflow_log(f"- workflow_request: {callable(workflow_request)}")

# Demonstrate database session access (if available)
if 'session' in locals() or 'session' in globals():
    workflow_log(f"Database session available: {session is not None}")
else:
    workflow_log("No database session in context", "INFO")

# Demonstrate available modules
workflow_log("Available modules:", "INFO")
workflow_log(f"- datetime: {datetime}")
workflow_log(f"- json: {json}")
workflow_log(f"- uuid: {uuid}")
workflow_log(f"- hashlib: {hashlib}")

# Generate a unique ID for this run
run_id = str(uuid.uuid4())
workflow_log(f"Generated run ID: {run_id}")

# Example JSON processing
sample_data = {"workflow_id": workflow_id, "run_id": run_id, "timestamp": str(datetime.datetime.now())}
json_string = json.dumps(sample_data, indent=2)
workflow_log(f"Sample JSON data:\\n{json_string}")

# Simulate some work with logging
workflow_sleep(2)

# Example of error handling
try:
    # This will work fine
    result = len("test string")
    workflow_log(f"String length calculation: {result}")
except Exception as e:
    workflow_log(f"Error in calculation: {e}", "ERROR")

workflow_log("Sample workflow completed successfully!", "INFO")
workflow_log("This workflow demonstrates the enhanced context with injected functions!")
"""
    
    with Session(engine) as session:
        # Check if sample workflow exists
        statement = select(Workflow).where(Workflow.title == "Sample Test Workflow")
        existing_workflow = session.exec(statement).first()
        
        if not existing_workflow:
            workflow = Workflow(
                id="sample-workflow-001",
                title="Sample Test Workflow",
                description="A simple workflow for testing the system",
                code=sample_code,
                user_id="default_user",
                status="inactive"
            )
            session.add(workflow)
            session.commit()
            print("✅ Created sample workflow")
            return workflow.id
        else:
            print("✅ Sample workflow already exists")
            return existing_workflow.id

def create_sample_schedule(workflow_id: str):
    """Create a sample schedule for testing (every 5 minutes)"""
    with Session(engine) as session:
        # Check if schedule exists
        statement = select(WorkflowSchedule).where(WorkflowSchedule.workflow_id == workflow_id)
        existing_schedule = session.exec(statement).first()
        
        if not existing_schedule:
            schedule = WorkflowSchedule(
                workflow_id=workflow_id,
                cron_expression="*/5 * * * *",  # Every 5 minutes
                timezone="UTC",
                is_active=False,  # Start inactive for safety
                next_run=datetime.now()
            )
            session.add(schedule)
            session.commit()
            print("✅ Created sample schedule (every 5 minutes, inactive)")
        else:
            print("✅ Sample schedule already exists")

def main():
    """Run the test setup"""
    print("🧪 Setting up workflow test environment...")
    
    # Ensure database and tables exist
    create_db_and_tables()
    
    # Create test data
    create_test_user()
    workflow_id = create_sample_workflow()
    create_sample_schedule(workflow_id)
    
    print("\n🎉 Test setup completed!")
    print("\n📋 What you can test now:")
    print("1. Start your FastAPI server: python index.py")
    print("2. Visit http://localhost:8000/docs to see the workflow API endpoints")
    print("3. Use the following endpoints:")
    print("   - GET /api/v1/workflows - List all workflows")
    print("   - GET /api/v1/workflows/sample-workflow-001 - Get sample workflow")
    print("   - POST /api/v1/workflows/sample-workflow-001/run - Run the sample workflow")
    print("   - GET /api/v1/workflows/sample-workflow-001/runs - View run history")
    print("   - GET /api/v1/workflows/sample-workflow-001/schedules - View schedules")
    print("\n⚠️  Note: You'll need proper Firebase authentication for the actual API calls")
    print("   The workflow router uses Firebase auth with 'whitelisted' role requirement")

if __name__ == "__main__":
    main() 