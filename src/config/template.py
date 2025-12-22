# Dashboard template
DASHBOARD_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Helpful Tools v2</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .header {
            text-align: center;
            padding: 40px 20px;
            color: white;
        }
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            font-weight: 300;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 20px;
        }
        .search-container {
            margin-bottom: 30px;
        }
        .search-box {
            width: 100%;
            max-width: 500px;
            margin: 0 auto;
            display: block;
            padding: 15px 20px;
            font-size: 16px;
            border: none;
            border-radius: 50px;
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            outline: none;
            transition: all 0.3s ease;
        }
        .search-box:focus {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }
        .tools-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .tool-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        .tool-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .tool-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.15);
        }
        .tool-card h3 {
            color: #2d3748;
            margin-bottom: 10px;
            font-size: 1.3em;
            font-weight: 600;
        }
        .tool-card p {
            color: #718096;
            line-height: 1.5;
            margin-bottom: 15px;
        }
        .tool-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .tag {
            background: #e3f2fd;
            color: #1565c0;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 500;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: white;
        }
        .empty-state h2 {
            font-size: 2em;
            margin-bottom: 15px;
            font-weight: 300;
        }
        .empty-state p {
            font-size: 1.1em;
            opacity: 0.8;
        }
        .add-tool-btn {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 2px solid rgba(255, 255, 255, 0.3);
            padding: 12px 30px;
            border-radius: 50px;
            font-size: 1em;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        .add-tool-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.5);
            transform: translateY(-2px);
        }
        .no-results {
            text-align: center;
            padding: 40px;
            color: white;
            display: none;
        }
        .footer {
            text-align: center;
            padding: 40px 20px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Helpful Tools v2</h1>
        <p>Your minimal collection of web development utilities</p>
    </div>
    
    <div class="container">
        <div class="search-container">
            <input type="text" class="search-box" placeholder="Search tools..." id="searchInput">
        </div>
        
        <div class="tools-grid" id="toolsGrid">
            {% if tools %}
                {% for tool in tools %}
                <div class="tool-card" onclick="openTool('{{ tool.path }}')">
                    <h3>{{ tool.icon }} {{ tool.name }}</h3>
                    <p>{{ tool.description }}</p>
                    <div class="tool-tags">
                        {% for tag in tool.tags %}
                        <span class="tag">{{ tag }}</span>
                        {% endfor %}
                    </div>
                </div>
                {% endfor %}
            {% endif %}
        </div>
        
        <div class="no-results" id="noResults">
            <h3>No tools found</h3>
            <p>Try adjusting your search terms</p>
        </div>
        
        {% if not tools %}
        <div class="empty-state">
            <h2>Welcome to Helpful Tools v2</h2>
            <p>This is a clean slate ready for your awesome tools!</p>
            <p>Start by adding your first tool to see it appear here.</p>
            <button class="add-tool-btn" onclick="showAddToolInfo()">Ready to add tools</button>
        </div>
        {% endif %}
    </div>
    
    <div class="footer">
        <p>Helpful Tools v2 - Minimal & Clean | Built with Flask</p>
    </div>

    <script>
        function openTool(path) {
            window.location.href = path;
        }
        
        function showAddToolInfo() {
            alert('Tools can be added by modifying the TOOLS list in main.py');
        }
        
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const toolCards = document.querySelectorAll('.tool-card');
            const noResults = document.getElementById('noResults');
            let visibleCount = 0;
            
            toolCards.forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                const description = card.querySelector('p').textContent.toLowerCase();
                const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase()).join(' ');
                
                if (title.includes(searchTerm) || description.includes(searchTerm) || tags.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            noResults.style.display = visibleCount === 0 && searchTerm.trim() !== '' ? 'block' : 'none';
        });
    </script>
</body>
</html>
'''