import os, glob, re

# We will read all html files and update their body styles and some panel styles
html_files = glob.glob("*.html")

common_css = """
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+JP:wght@400;600;800&display=swap');
    
    body {
      font-family: 'Inter', 'Noto Sans JP', sans-serif;
      background: radial-gradient(circle at top left, #0f172a, #1e293b, #020617);
      background-attachment: fixed;
      color: #f1f5f9;
      margin: 0;
    }

    button.btn, .btn {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
      transition: all 0.2s;
    }
    button.btn:hover, .btn:hover {
      box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
      transform: translateY(-2px);
    }
    .btn.secondary { background: #475569; box-shadow: none; }
    
    /* Input modern styles */
    input[type="text"], input[type="password"], input[type="number"], select {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      font-size: 15px;
      width: 100%;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    /* Glassmorphic Panels */
    .setting-panel, .card, .q-card, .pv-item {
      background: rgba(30, 41, 59, 0.6) !important;
      backdrop-filter: blur(12px) !important;
      border-radius: 16px !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
    }
    
    table th { background: rgba(15, 23, 42, 0.8) !important; color: #94a3b8 !important; }
    table td { border-color: rgba(255, 255, 255, 0.1) !important; }
"""

for f in html_files:
    if f == "index.html": continue # Already styled
    
    with open(f, "r") as file:
        content = file.read()
    
    # Replace body { ... }
    content = re.sub(r'body\s*{[^}]*}', 'body { font-family: "Inter", "Noto Sans JP", sans-serif; background: radial-gradient(circle at top left, #0f172a, #1e293b, #020617); background-attachment: fixed; color: #f1f5f9; margin: 0; }', content, count=1)
    
    # Insert new CSS just before </style>
    if "</style>" in content and "glassmorphism" not in content.lower() and "radial-gradient" not in content:
        content = content.replace("</style>", common_css + "\n</style>")
        
    with open(f, "w") as file:
        file.write(content)
        print(f"Applied glassmorphism to {f}")

