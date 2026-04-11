import glob, sys

replacements = {
    '✅': '<i class="fa-solid fa-check"></i>',
    '❌': '<i class="fa-solid fa-xmark"></i>',
    '⚠': '<i class="fa-solid fa-triangle-exclamation"></i>',
    '🔒': '<i class="fa-solid fa-lock"></i>'
}

files = ['cancel.html', 'entry_list.html', 'disclosure.html', 'entry.html', 'js/conflict.js', 'js/checkin.js', 'js/entry.js']

for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
            
        original_content = content
        
        for k, v in replacements.items():
            if k in content:
                content = content.replace(k, v)
        
        content = content.replace('.textContent = \'<i class="fa-solid', '.innerHTML = \'<i class="fa-solid')
        content = content.replace('.textContent = `<i class="fa-solid', '.innerHTML = `<i class="fa-solid')

        if content != original_content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(content)
            print(f'Replaced emojis in {f}')
    except Exception as e:
        print(e)
