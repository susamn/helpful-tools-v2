# Helpful Tools v2

A minimal, clean web-based dashboard for developer utilities built with Flask.

## Features

- **Minimal Dependencies**: Only Flask required
- **Clean Dashboard**: Modern, responsive UI
- **Easy Extension**: Simple structure for adding tools
- **Standard Library Focus**: Minimal external packages

## Quick Start

```bash
# Make the script executable and run setup
chmod +x quick-start.sh
./quick-start.sh

# Start the server
python3 start.py

# Stop the server (in another terminal)
python3 stop.py
```

## Manual Setup

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run the application
python3 main.py
```

## Project Structure

```
helpful-tools-v2/
├── main.py              # Main Flask application
├── start.py             # Server startup script
├── stop.py              # Server stop script
├── quick-start.sh       # Quick setup script
├── requirements.txt     # Python dependencies
├── README.md           # This file
├── static/             # Static files directory
├── logs/               # Log files directory
└── venv/               # Virtual environment
```

## Adding Tools

To add tools, modify the `TOOLS` list in `main.py`:

```python
TOOLS = [
    {
        "name": "Your Tool Name",
        "description": "What your tool does",
        "path": "/tools/your-tool",
        "tags": ["tag1", "tag2"]
    }
]
```

## URLs

- Dashboard: http://127.0.0.1:8000
- API: http://127.0.0.1:8000/api/tools
- Health: http://127.0.0.1:8000/health

## Requirements

- Python 3.7+
- Flask 3.0.0

## License

This is a minimal template - customize as needed!