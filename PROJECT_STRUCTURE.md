# Helpful Tools v2 - Project Structure

This document explains the reorganized folder structure and how to work with the codebase.

## 📁 Directory Structure

```
helpful-tools-v2/
├── app.py                        # 🚀 Main application entry point
├── requirements.txt              # 📦 Python dependencies
├── helpful-tools-v2.pid          # 🔧 Process ID file (when running)
├── helpful-tools-v2.log          # 📝 Application logs
├── venv/                         # 🐍 Python virtual environment
│
├── src/                          # 💻 Source Code
│   ├── __init__.py              
│   ├── main.py                   # 🌐 Flask application and routes
│   ├── api/                      # 🔌 API modules
│   │   ├── __init__.py
│   │   ├── history.py           # 📚 History management
│   │   └── converter.py         # 🔄 Format conversion utilities
│   └── utils/                    # 🛠️ Utility modules
│       └── __init__.py
│
├── frontend/                     # 🎨 Frontend Resources
│   ├── tools/                    # 📄 HTML tool templates
│   │   ├── cron-parser.html
│   │   ├── json-formatter.html
│   │   ├── json-yaml-xml-converter.html
│   │   ├── jwt-decoder.html
│   │   ├── regex-tester.html
│   │   ├── scientific-calculator.html
│   │   └── text-diff.html
│   └── static/                   # 🎭 Static assets
│       ├── css/                  # 🎨 Stylesheets
│       │   ├── common-enhancements.css
│       │   ├── json-yaml-xml-converter.css
│       │   └── main.css
│       └── js/                   # ⚡ JavaScript files
│           ├── json-formatter.js
│           ├── json-yaml-xml-converter.js
│           ├── jwt-decoder.js
│           └── scientific-calculator.js
│
├── tests/                        # 🧪 Test Suite (Organized by Tool)
│   ├── test-report.html         # 📊 Test reports
│   ├── text-diff/               # ⚖️ Text Diff Tool Tests
│   │   ├── test_text_diff.py
│   │   ├── test_text_diff_frontend.py
│   │   ├── run_diff_tests.py
│   │   └── validate_text_diff_improvements.py
│   ├── regex/                   # 🔍 Regex Tester Tests
│   │   ├── test_regex_tester.py
│   │   ├── test_regex_tester_frontend.py
│   │   ├── run_regex_tests.py
│   │   ├── test_fixed_regex.js
│   │   └── validate_regex_fix.py
│   ├── converter/               # 🔄 Format Converter Tests
│   │   ├── test_converter.py
│   │   ├── json-yaml-xml-converter.test.js
│   │   └── json-yaml-xml-converter-integration.test.js
│   ├── cron-parser/             # ⏰ Cron Parser Tests
│   │   ├── test_cron_parser.py
│   │   └── validate_cron_parser.py
│   ├── jwt-decoder/             # 🔑 JWT Decoder Tests
│   │   ├── test_jwt_decoder.py
│   │   ├── validate_jwt_decoder.py
│   │   └── validate_jwt_history.py
│   ├── scientific-calculator/   # 🧮 Scientific Calculator Tests
│   │   ├── test_scientific_calculator.py
│   │   └── validate_scientific_calculator.py
│   ├── json-formatter/          # 📄 JSON Formatter Tests
│   │   └── json-formatter.test.js
│   └── shared/                  # 🔧 Shared/General Tests
│       ├── test.py
│       ├── test_final_history_fix.py
│       ├── test_ui_enhancements.py
│       ├── test_ui_match.py
│       ├── test_history_debug.js
│       ├── delete-functionality.test.js
│       ├── history-consistency.test.js
│       ├── validate_font_controls.py
│       └── validate_windows_scripts.py
│
├── scripts/                      # 🔧 Build & Utility Scripts
│   ├── start/                    # 🚀 Startup scripts
│   │   ├── quick-start.sh       # Linux/Mac startup
│   │   ├── quick-start.bat      # Windows batch startup
│   │   ├── quick-start.ps1      # PowerShell startup
│   │   ├── start.py             # Python startup script
│   │   └── stop.py              # Stop server script
│   ├── test/                     # 🧪 Test runners
│   │   ├── run_diff_tests.py
│   │   └── run_regex_tests.py
│   └── debug/                    # 🐛 Debug utilities
│       └── debug_regex.js
│
├── config/                       # ⚙️ Configuration Files
│   └── config.json              # Application configuration
│
├── docs/                         # 📚 Documentation
│   ├── README.md                # Main documentation
│   └── README_text_diff.md      # Text diff tool docs
│
└── logs/                         # 📝 Log Directory
    └── (application logs)
```

## 🚀 Getting Started

### Quick Start

```bash
# From project root directory
./scripts/start/quick-start.sh
```

### Manual Start

```bash
# Install dependencies (first time only)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run the application
python app.py
```

### Access the Application

Open your browser to: `http://127.0.0.1:8000`

## 🛠️ Development

### Adding New Tools

1. Create HTML template in `frontend/tools/your-tool.html`
2. Add CSS/JS assets in `frontend/static/`
3. Add route in `src/main.py`
4. Update TOOLS list in `src/main.py`

### Running Tests

```bash
# Unit tests
python -m pytest tests/unit/

# Frontend tests
python tests/frontend/test_*.py

# Validation scripts  
python tests/validation/validate_*.py
```

### Code Organization

- **Backend Logic**: `src/` directory
- **Frontend Assets**: `frontend/` directory  
- **Tests**: `tests/` directory with subcategories
- **Scripts**: `scripts/` directory organized by purpose
- **Configuration**: `config/` directory
- **Documentation**: `docs/` directory

## 📦 Benefits of New Structure

- **Separation of Concerns**: Clear separation between backend, frontend, tests, and scripts
- **Scalability**: Easy to add new tools and features
- **Maintainability**: Logical organization makes code easier to find and maintain  
- **Testing**: Organized test structure with unit, integration, frontend, and validation tests
- **Deployment**: Clean structure suitable for production deployment
- **Developer Experience**: Clear entry points and organized codebase

## 🔄 Migration Notes

- Entry point changed from `main.py` to `app.py`
- All imports updated to reflect new structure
- Scripts updated to use project root as working directory
- Path references updated throughout the codebase