# /// script
# dependencies = ["https://githubproxy.samuelcolvin.workers.dev/samuelcolvin/scratch/blob/main/logfire-3.3.0-py3-none-any.whl"]
# ///

import logfire

logfire.configure(token='...')
logfire.info('Hello, {place}!', place='World')
