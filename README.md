# Helpful Tools v2

[![CI](https://github.com/susamn/helpful-tools-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/susamn/helpful-tools-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![Code style: flake8](https://img.shields.io/badge/code%20style-flake8-orange.svg)](https://flake8.pycqa.org/)

A comprehensive web-based developer toolkit built with Flask. Simple, fast, and privacy-focused - all tools run locally with no data sent to external servers.

## Features

- **11 Developer Tools** - JSON/YAML formatters, converters, diff viewer, regex tester, and more
- **History Tracking** - Save and retrieve tool usage across sessions
- **Configurable** - Enable/disable tools via configuration
- **Modern UI** - Clean, responsive interface
- **Privacy-First** - All processing happens locally

## Available Tools

| Tool | Description | Status |
|------|-------------|--------|
| **Scratchpad** | Simple note-taking tool with history tracking | Stable |
| **JSON Tool** | Format, validate, and minify JSON data | Stable |
| **YAML Tool** | Format, validate, and work with YAML data | Stable |
| **JSON-YAML-XML Converter** | Bidirectional format conversion | Stable |
| **Text Diff Tool** | Compare text side-by-side with highlighting | Stable |
| **Regex Tester** | Interactive regex testing with live highlighting | Stable |
| **Cron Parser** | Parse cron expressions with human-readable output | Stable |
| **Scientific Calculator** | Advanced calculator with graphing support | Stable |
| **JWT Decoder** | Decode and analyze JWT tokens | Stable |
| **Sources Manager** | Manage data sources (local, S3, SFTP, HTTP) | Stable |
| **AWS Step Functions Viewer** | Visualize state machines | Beta (disabled by default) |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/helpful-tools-v2.git
cd helpful-tools-v2

# Run the quick-start script (creates venv, installs deps, starts server)
./quick-start.sh

# Or start manually
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open your browser to: `http://127.0.0.1:8000`

### Command Line Options

```bash
python app.py --port 8080        # Run on different port
python app.py --host 0.0.0.0     # Bind to all interfaces
```

## Configuration

Tools can be enabled/disabled via `config/config.json`:

```json
{
  "tools": {
    "json-tool": {
      "enabled": true,
      "description": "JSON formatter and validator"
    },
    "aws-sf-viewer": {
      "enabled": false,
      "description": "AWS Step Functions state machine viewer"
    }
  }
}
```

Set `"enabled": false` to hide a tool from the dashboard and disable its route.

## Project Structure

```
helpful-tools-v2/
├── app.py                  # Application entry point
├── config/
│   └── config.json         # Tool configuration
├── src/
│   ├── main.py             # Flask application and routes
│   ├── api/                # API modules (history, converter)
│   ├── sources/            # Data source implementations
│   └── validators/         # Data validation system
├── frontend/
│   ├── tools/              # HTML templates for each tool
│   └── static/             # CSS and JavaScript
└── tests/                  # Test suite
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard |
| `/api/tools` | GET | List enabled tools |
| `/api/convert` | POST | Format conversion |
| `/api/text-diff/compare` | POST | Text comparison |
| `/api/history/<tool>` | GET/POST | Tool history |
| `/health` | GET | Health check |

## Roadmap

### Planned Features

- [ ] **Base64 Encoder/Decoder** - Encode/decode Base64 strings
- [ ] **URL Encoder/Decoder** - URL encoding utilities
- [ ] **Hash Generator** - MD5, SHA-1, SHA-256 hash generation
- [ ] **UUID Generator** - Generate various UUID formats
- [ ] **Color Picker** - Color format converter (HEX, RGB, HSL)
- [ ] **Unix Timestamp Converter** - Convert between formats
- [ ] **Markdown Preview** - Live markdown rendering
- [ ] **SQL Formatter** - Format and beautify SQL queries
- [ ] **HTML/CSS Minifier** - Minify web assets
- [ ] **IP Address Tools** - Subnet calculator, CIDR notation

### Improvements

- [ ] Dark mode support
- [ ] Export/import history
- [ ] Keyboard shortcuts documentation
- [ ] Plugin system for custom tools

## Development

### Running Tests

```bash
# Activate virtual environment
source venv/bin/activate

# Run all tests
python -m pytest tests/ -v

# Run specific test category
python -m pytest tests/api/ -v
python -m pytest tests/converter/ -v

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=html
```

### Adding New Tools

1. Create HTML template in `frontend/tools/your-tool.html`
2. Add CSS/JS assets in `frontend/static/`
3. Add tool entry in `src/main.py` TOOLS list with unique `id`
4. Add configuration in `config/config.json`
5. Add tests in `tests/your-tool/`

## Requirements

- Python 3.8+
- Flask 3.0+
- PyYAML 6.0+
- xmltodict 0.13+

See `requirements.txt` for complete list.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

Built with Flask, and inspired by the need for simple, local developer tools that respect privacy.
