# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "devtools",
#     "httpx",
# ]
# ///
from pathlib import Path
import httpx
from devtools import debug

code_file = Path('sandbox_code.py')
if not code_file.exists():
    print(f'{code_file} does not exist, creating it...')
    code_file.write_text("print('hello world')\n")

code = code_file.read_text()
url = 'https://sandbox.samuelcolvin.workers.dev'

r = httpx.post(url + '/run', content=code)
debug(r.status_code)
try:
    data = r.json()
except ValueError:
    debug(r.text)
else:
    debug(data)
    output = ''.join(item['v'] for item in data['stream'])
    print(f'output:\n{output}')
