deploy-qdrant:
	docker run -d --name qdrant-nca-assistant -p 6333:6333 -e QDRANT__AUTH__API_KEY=f5xyiQODJQCpF92xlmlk9JegfaPp5I0Z qdrant/qdrant:latest

# Deploy PostgreSQL container (if not already running)
deploy-postgres:
	docker run -d --name postgres-nca-assistant -p 5432:5432 \
		-e POSTGRES_USER=postgres \
		-e POSTGRES_PASSWORD=postgres \
		-e POSTGRES_DB=postgres \
		postgres:latest

# Create the database in PostgreSQL (works with Docker or local PostgreSQL)
# Uses DATABASE_URL from .env file
create-db:
	uv run scripts/create_db.py

run:
	uv run index.py

log:
	uv run -m uvicorn index:app --reload --log-level info