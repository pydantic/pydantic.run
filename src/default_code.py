# /// script
# dependencies = ["logfire"]
# ///

import logfire

logfire.configure()
logfire.info('Hello, {place}!', place='World')
