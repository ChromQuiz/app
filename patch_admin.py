import re
with open("admin.html", "r", encoding="utf-8") as f:
    text = f.read()

# Add showAdminToast near db = firebase.database() if not exists
if "function showAdminToast" not in text:
    target = "        const db = firebase.database();"
    replacement = """        const db = firebase.database();
        function showAdminToast(msg, type = 'error') {
            const t = document.getElementById('admin-toast');
            t.textContent = msg;
            t.style.background = type === 'error' ? '#ef5350' : '#4caf50';
            t.style.display = 'block';
            setTimeout(() => t.style.display = 'none', 3000);
        }
"""
    if target in text:
        text = text.replace(target, replacement, 1)
        with open("admin.html", "w", encoding="utf-8") as f:
            f.write(text)
        print("Patched admin.html")
    else:
        print("Target not found.")
else:
    print("Function already exists.")
