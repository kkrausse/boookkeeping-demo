# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

assume dev servers are already running unless otherwise specified

## Build & Run Commands
- UI: `cd bookkeeping-ui && npm run dev` - Start UI dev server
- UI: `cd bookkeeping-ui && npm run build` - Build UI for production
- UI: `cd bookkeeping-ui && npm run lint` - Lint UI code
- Backend: `cd python-backend && python manage.py runserver` - Start Django server
- Backend: `cd python-backend && python manage.py test` - Run all tests
- Backend: `cd python-backend && python manage.py test transactions.tests.TestClassName.test_method_name` - Run single test

## Code Style Guidelines
- TypeScript: Use strict typing, avoid `any`, prefer interfaces over types for objects
- React: Use functional components with hooks, avoid class components
- Python: Follow PEP 8 style guide
- Imports: Group and sort imports (standard library, third-party, local)
- Naming: camelCase for JS/TS variables/functions, PascalCase for components/classes, snake_case for Python
- Error handling: Use try/catch in UI, raise/except in backend with appropriate error messages
- CSS: Component-specific CSS files (e.g., ComponentName.css)
- Comments: Docstrings for Python functions, JSDoc for complex TS functions
