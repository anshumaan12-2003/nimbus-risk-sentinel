import os
import re

def camel_to_kebab(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1-\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1-\2', s1).lower()

src_dir = '/Users/anshumaanmac/Desktop/PROJECTCLOUD/frontend/src'

count = 0
for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Find all import { ... } from 'lucide-react'
            # Using DOTALL and a more robust regex
            pattern = re.compile(r'import\s+\{([^}]+)\}\s+from\s+[\'"]lucide-react[\'"]')
            
            def replacer(match):
                imports_str = match.group(1)
                imports = [i.strip() for i in imports_str.replace('\n', '').split(',')]
                new_lines = []
                for imp in imports:
                    if not imp: continue
                    parts = imp.split(' as ')
                    original_name = parts[0].strip()
                    alias_name = parts[1].strip() if len(parts) > 1 else original_name
                    
                    kebab_name = camel_to_kebab(original_name)
                    new_lines.append(f"import {alias_name} from 'lucide-react/dist/esm/icons/{kebab_name}'")
                return '\n'.join(new_lines)
            
            new_content = pattern.sub(replacer, content)
            
            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Fixed {filepath}")
                count += 1
print(f"Total fixed: {count}")
