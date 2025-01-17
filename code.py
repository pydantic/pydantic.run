# /// script
# dependencies = ["logfire", "pydantic"]
# ///

import logfire

from pydantic import BaseModel

logfire.configure()
logfire.info('Hello, {place}!', place='World')

logfire.instrument_pydantic()


class Delivery(BaseModel):
    timestamp: str
    dimensions: tuple[int, int]


# this will record details of a successful validation to logfire
m = Delivery(timestamp='hello', dimensions=['10', '20'])
print(repr(m.timestamp))
print(m.dimensions)
