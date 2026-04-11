import os, re

files = [
    'js/admin.js', 'js/judge.js', 'js/question.js', 'js/conflict.js', 
    'js/checkin.js', 'js/cancel.js', 'js/disclosure.js', 'js/entry_list.js'
]

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r') as file:
        content = file.read()
    
    if "const secretHash" not in content:
        # Insert it after const projectId
        content = re.sub(r'(const projectId = [^\n;]+;)', r'\1\n        const secretHash = session.get("secretHash");', content, count=1)
        with open(f, 'w') as file:
            file.write(content)
        print(f"Fixed {f}")
