# Bookkeeping Demo

A full-stack application for tracking, categorizing, and managing financial transactions.

## System Architecture

- **Frontend**: React with TypeScript, Vite, and CSS
- **Backend**: Django with Django REST Framework
- **Database**: PostgreSQL

## Setup

```bash
# Backend (Django + PostgreSQL)
docker compose up -d db  # Start PostgreSQL database

# setup api server
cd python-backend 
python -m venv env
source env/bin/activate 
pip install -r requirements.txt
python manage.py migrate
# run api at http://localhost:8000/
python manage.py runserver
```

```bash
# Start frontend at  http://localhost:5173/
cd bookkeeping-ui && npm install && npm run dev
```

## Development

### Common Commands

- UI: `cd bookkeeping-ui && npm run dev` - Start UI dev server
- UI: `cd bookkeeping-ui && npm run build` - Build UI for production
- UI: `cd bookkeeping-ui && npm run lint` - Lint UI code
- Backend: `cd python-backend && source env/bin/activate` - Setup virtual environment
- Backend: `cd python-backend && python manage.py runserver` - Start Django server
- Backend: `cd python-backend && python manage.py test` - Run all tests
- Backend: `cd python-backend && python manage.py test transactions.tests.TestClassName.test_method_name` - Run single test

## API Endpoints

- `GET /transactions/` - List all transactions
- `POST /transactions/` - Create a new transaction
- `GET /transactions/{id}/` - Get transaction details
- `PUT /transactions/{id}/` - Update a transaction
- `PATCH /transactions/{id}/` - Partially update a transaction
- `POST /transactions/upload/` - Upload transactions via CSV
- `GET /rules/` - List all transaction rules
- `POST /rules/` - Create a new rule
- `GET /rules/{id}/` - Get rule details
- `PUT /rules/{id}/` - Update a rule
- `DELETE /rules/{id}/` - Delete a rule

## Key Features Implementation

### Duplicate Detection

The system detects potential duplicate transactions by comparing:
- Transaction amount
- Transaction description
- Transaction datetime

This helps prevent double-counting of the same transaction while avoiding false positives.

### Transaction Rules

Rules can be created with conditions such as:
- Amount greater/less than a value
- Description containing specific text
- Category matching specific criteria

Actions that can be performed by rules:
- Automatically set a category
- Flag transactions for review
