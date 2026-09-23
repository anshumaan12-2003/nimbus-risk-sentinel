import os
import re

src_dir = '/Users/anshumaanmac/Desktop/PROJECTCLOUD/frontend/src'

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            new_content = content.replace('check-circle2', 'check-circle-2')
            new_content = new_content.replace('undo2', 'undo-2')
            new_content = new_content.replace('loader2', 'loader-2')
            new_content = new_content.replace('code2', 'code-2')
            new_content = new_content.replace('wand2', 'wand-2')
            new_content = new_content.replace('git-commit', 'git-commit-horizontal')
            new_content = new_content.replace('kanban-square', 'kanban-square')
            # Check others if needed, but the error explicitly only complained about check-circle2, undo2, loader2, code2, wand2.

            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Fixed numbers in {filepath}")
