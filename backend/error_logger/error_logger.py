from datetime import datetime
from typing import Dict, Any, Optional, List, Union
import json
import logging
from pydantic import BaseModel
import sqlite3
import os

class ErrorLog(BaseModel):
    timestamp: datetime
    function_name: str
    error_text: str
    parameters: Dict[str, Any]
    stack_trace: Optional[str] = None

class ErrorLogger:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.db_path = os.path.join(os.path.dirname(__file__), 'error_logs.db')
        self._init_db()

    def _init_db(self):
        """Initialize the database and create tables if they don't exist."""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row  # Enable row name access
        
        # Create errors table if it doesn't exist
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS error_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                function_name TEXT NOT NULL,
                error_text TEXT NOT NULL,
                parameters TEXT NOT NULL,
                stack_trace TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        self.conn.commit()

    def log_error(
        self,
        function_name: str,
        error_text: str,
        parameters: Dict[str, Any],
        stack_trace: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Logs an error to the database and prepares for future SMS notification.
        
        Args:
            function_name: Name of the function where the error occurred
            error_text: Description of the error
            parameters: Dictionary of parameters used in the function call
            stack_trace: Optional stack trace of the error
            
        Returns:
            Dict containing error information and a user-friendly message
        """
        error_log = ErrorLog(
            timestamp=datetime.utcnow(),
            function_name=function_name,
            error_text=error_text,
            parameters=parameters,
            stack_trace=stack_trace
        )

        # Log to console
        self.logger.error(f"Error in {function_name}: {error_text}")
        if stack_trace:
            self.logger.error(f"Stack trace: {stack_trace}")

        # Save to database
        try:
            self.conn.execute('''
                INSERT INTO error_logs 
                (timestamp, function_name, error_text, parameters, stack_trace)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                error_log.timestamp.isoformat(),
                error_log.function_name,
                error_log.error_text,
                json.dumps(error_log.parameters),
                error_log.stack_trace
            ))
            self.conn.commit()
        except Exception as e:
            self.logger.error(f"Failed to save error to database: {str(e)}")
            # Don't raise the exception, just log it and continue

        # TODO: Send SMS notification
        # self.send_sms_notification(error_log)

        # Return a user-friendly error response
        return {
            "error": True,
            "message": f"An error occurred in {function_name}: {error_text}",
            "details": {
                "function": function_name,
                "timestamp": error_log.timestamp.isoformat(),
                "parameters": parameters
            }
        }

    def send_sms_notification(self, error_log: ErrorLog) -> None:
        """
        Placeholder for future SMS notification functionality.
        """
        # TODO: Implement SMS notification
        pass

    def get_recent_errors(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieve recent error logs from the database.
        
        Args:
            limit: Maximum number of errors to return
            
        Returns:
            List of error logs as dictionaries
        """
        try:
            cursor = self.conn.execute('''
                SELECT * FROM error_logs 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,))
            
            errors = []
            for row in cursor.fetchall():
                error = {
                    'id': row['id'],
                    'timestamp': row['timestamp'],
                    'function_name': row['function_name'],
                    'error_text': row['error_text'],
                    'parameters': json.loads(row['parameters']),
                    'stack_trace': row['stack_trace'],
                    'created_at': row['created_at']
                }
                errors.append(error)
            return errors
        except Exception as e:
            self.logger.error(f"Failed to retrieve errors from database: {str(e)}")
            return []

    def search_errors(
        self,
        search_text: Optional[str] = None,
        function_name: Optional[str] = None,
        start_date: Optional[Union[str, datetime]] = None,
        end_date: Optional[Union[str, datetime]] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search for errors with various filters.
        
        Args:
            search_text: Text to search in error_text and stack_trace
            function_name: Filter by specific function name
            start_date: Filter errors from this date (inclusive)
            end_date: Filter errors until this date (inclusive)
            limit: Maximum number of errors to return
            
        Returns:
            List of error logs as dictionaries
        """
        try:
            query = "SELECT * FROM error_logs WHERE 1=1"
            params = []

            if search_text:
                query += " AND (error_text LIKE ? OR stack_trace LIKE ?)"
                search_pattern = f"%{search_text}%"
                params.extend([search_pattern, search_pattern])

            if function_name:
                query += " AND function_name = ?"
                params.append(function_name)

            if start_date:
                if isinstance(start_date, datetime):
                    start_date = start_date.isoformat()
                query += " AND timestamp >= ?"
                params.append(start_date)

            if end_date:
                if isinstance(end_date, datetime):
                    end_date = end_date.isoformat()
                query += " AND timestamp <= ?"
                params.append(end_date)

            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            cursor = self.conn.execute(query, params)
            
            errors = []
            for row in cursor.fetchall():
                error = {
                    'id': row['id'],
                    'timestamp': row['timestamp'],
                    'function_name': row['function_name'],
                    'error_text': row['error_text'],
                    'parameters': json.loads(row['parameters']),
                    'stack_trace': row['stack_trace'],
                    'created_at': row['created_at']
                }
                errors.append(error)
            return errors
        except Exception as e:
            self.logger.error(f"Failed to search errors: {str(e)}")
            return []

    def get_errors_by_date_range(
        self,
        start_date: Union[str, datetime],
        end_date: Union[str, datetime],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get errors within a specific date range.
        
        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            limit: Maximum number of errors to return
            
        Returns:
            List of error logs as dictionaries
        """
        return self.search_errors(start_date=start_date, end_date=end_date, limit=limit)

    def get_errors_by_function(
        self,
        function_name: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get errors from a specific function.
        
        Args:
            function_name: Name of the function to filter by
            limit: Maximum number of errors to return
            
        Returns:
            List of error logs as dictionaries
        """
        return self.search_errors(function_name=function_name, limit=limit)

    def get_errors_by_text(
        self,
        search_text: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search for errors containing specific text in error_text or stack_trace.
        
        Args:
            search_text: Text to search for
            limit: Maximum number of errors to return
            
        Returns:
            List of error logs as dictionaries
        """
        return self.search_errors(search_text=search_text, limit=limit)

    def __del__(self):
        """Close database connection when the object is destroyed."""
        if hasattr(self, 'conn'):
            self.conn.close()
