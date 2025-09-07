# Helpful Tools v2

A comprehensive web-based dashboard for developer utilities built with Flask.

## Features

- **7 Developer Tools**: JSON formatter, converter, text diff, regex tester, cron parser, JWT decoder, scientific calculator
- **Backend APIs**: Real server-side processing for text diff and format conversion
- **History Tracking**: Save and retrieve tool usage across sessions
- **Modern UI**: Clean, responsive interface with Windows 95 aesthetic
- **Comprehensive Testing**: 120+ tests with 98.4% pass rate

## Available Tools

1. **JSON Formatter** 📄 - Format, validate, and minify JSON data
2. **JSON-YAML-XML Converter** 🔄 - Bidirectional format conversion
3. **Text Diff Tool** ⚖️ - Compare text files with inline highlighting
4. **Regex Tester** 🔍 - Interactive regex pattern testing
5. **Cron Parser** ⏰ - Parse and analyze cron expressions
6. **Scientific Calculator** 🧮 - Advanced calculator with graphing
7. **JWT Decoder** 🔑 - Decode and analyze JWT tokens

## Quick Start

```bash
# Run the quick-start script
./scripts/start/quick-start.sh

# Or start manually
source venv/bin/activate
python src/main.py
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
cd src && python main.py
```

## Project Structure

```
helpful-tools-v2/
├── src/
│   ├── main.py              # Main Flask application
│   ├── api/
│   │   ├── converter.py     # Format conversion API
│   │   └── history.py       # History management API
│   └── utils/               # Utility modules
├── frontend/
│   ├── static/
│   │   ├── css/             # Stylesheets
│   │   └── js/              # JavaScript files
│   └── tools/               # HTML templates
├── tests/                   # Test suite (120+ tests)
├── scripts/start/           # Startup scripts
├── config/                  # Configuration files
└── docs/                    # Documentation

```

## API Endpoints

- **Dashboard**: http://127.0.0.1:8000
- **Text Diff API**: POST /api/text-diff/compare
- **Converter API**: POST /api/convert
- **History API**: GET/POST /api/history/{tool}
- **Health Check**: GET /health

## Testing

```bash
# Run all tests
PYTHONPATH=/path/to/helpful-tools-v2/src:/path/to/helpful-tools-v2 pytest tests/ -v

# Run specific test category
pytest tests/converter/ -v
pytest tests/text-diff/ -v
```

## Requirements

- Python 3.7+
- Flask 3.0.0
- PyYAML 6.0.1
- xmltodict 0.13.0

## Development

The project maintains high code quality with:
- **98.4% test pass rate** (120 passed, 2 minor failures)
- **Clean architecture** with separated API and frontend layers  
- **Comprehensive edge case testing** for robustness
- **Minimal dependencies** for easy maintenance

## License

MIT License - See project for details.