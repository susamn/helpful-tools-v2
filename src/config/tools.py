# Store for tools configuration
TOOLS = [
    {
        "id": "scratchpad",
        "name": "Scratchpad",
        "description": "Simple note-taking tool for viewing and storing data with history tracking",
        "path": "/tools/scratchpad",
        "tags": ["notes", "text", "viewer", "scratchpad"],
        "has_history": True,
        "icon": "📝"
    },
    {
        "id": "json-tool",
        "name": "JSON Tool",
        "description": "Format, validate, and minify JSON data with history tracking",
        "path": "/tools/json-tool",
        "tags": ["formatter", "json", "validator"],
        "has_history": True,
        "icon": "📄"
    },
    {
        "id": "yaml-tool",
        "name": "YAML Tool",
        "description": "Format, validate, and minify YAML data with syntax highlighting",
        "path": "/tools/yaml-tool",
        "tags": ["formatter", "yaml", "validator"],
        "has_history": True,
        "icon": "📋"
    },
    {
        "id": "json-yaml-xml-converter",
        "name": "JSON-YAML-XML Converter",
        "description": "Bidirectional conversion between JSON, YAML, and XML formats with syntax highlighting",
        "path": "/tools/json-yaml-xml-converter",
        "tags": ["converter", "json", "yaml", "xml", "format"],
        "has_history": True,
        "icon": "🔄"
    },
    {
        "id": "text-diff",
        "name": "Text Diff Tool",
        "description": "Compare two text files side-by-side with inline highlighting of differences",
        "path": "/tools/text-diff",
        "tags": ["diff", "compare", "text", "files"],
        "has_history": True,
        "icon": "⚖️"
    },
    {
        "id": "regex-tester",
        "name": "Regex Tester",
        "description": "Interactive regex testing tool with live highlighting, group visualization, and match details",
        "path": "/tools/regex-tester",
        "tags": ["regex", "pattern", "match", "test", "validation"],
        "has_history": True,
        "icon": "🔍"
    },
    {
        "id": "cron-parser",
        "name": "Cron Parser",
        "description": "Parse and analyze cron expressions with human-readable descriptions and next execution times",
        "path": "/tools/cron-parser",
        "tags": ["cron", "scheduler", "parser", "time", "unix"],
        "has_history": True,
        "icon": "⏰"
    },
    {
        "id": "scientific-calculator",
        "name": "Scientific Calculator",
        "description": "Advanced calculator with scientific functions and interactive graph plotter for mathematical expressions",
        "path": "/tools/scientific-calculator",
        "tags": ["calculator", "math", "science", "graph", "plotter", "functions"],
        "has_history": True,
        "icon": "🧮"
    },
    {
        "id": "jwt-decoder",
        "name": "JWT Decoder",
        "description": "Decode and analyze JWT (JSON Web Tokens) with syntax highlighting, validation, and timestamp formatting",
        "path": "/tools/jwt-decoder",
        "tags": ["jwt", "decoder", "token", "security", "json", "auth"],
        "has_history": True,
        "icon": "🔑"
    },
    {
        "id": "sources",
        "name": "Sources Manager",
        "description": "Manage data sources from various locations: local files, S3, SFTP, Samba, HTTP URLs with secure credential management",
        "path": "/tools/sources",
        "tags": ["sources", "data", "s3", "sftp", "samba", "http", "files", "credentials"],
        "has_history": True,
        "icon": "🗄️"
    },
    {
        "id": "aws-sf-viewer",
        "name": "AWS Step Functions Viewer",
        "description": "Visualize AWS Step Functions state machines with interactive graph rendering, state details, and multiple layout options",
        "path": "/tools/aws-sf-viewer",
        "tags": ["aws", "step-functions", "state-machine", "visualization", "graph", "workflow"],
        "has_history": False,
        "icon": "🔀"
    },
    {
        "id": "workflow-processor",
        "name": "Workflow Processor",
        "description": "Process large files with a workflow of operators (format, minify, etc.) on the backend",
        "path": "/tools/workflow-processor",
        "tags": ["workflow", "process", "backend", "large-files"],
        "has_history": False,
        "icon": "⚙️"
    },
]