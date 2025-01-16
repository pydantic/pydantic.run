import importlib
import traceback

import micropip

logfire_configured = False

async def main(user_code: str):

    await micropip.install(['logfire'])
    importlib.invalidate_caches()

    prep_logfire()

    exec(user_code)


def prep_logfire():
    global logfire_configured
    if logfire_configured:
        return

    try:
        import logfire
    except ImportError:
        return

    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor

    from logfire._internal.config import configure

    # Prevent from creating a thread pool
    Resource.create = Resource

    def custom_logfire_configure(*, token: str | None = None, **kwargs):
        configure(
            # Avoid a BatchSpanProcessor which would try to start a thread
            send_to_logfire=False,
            additional_span_processors=[
                SimpleSpanProcessor(
                    OTLPSpanExporter(
                        endpoint='https://logfire-logs-proxy.pydantic.workers.dev/v1/traces',
                        headers={'Authorization': token or 'ZKbfrc38r3G6ZK6L61tWL6PVqmghwPgtvkC3FyThlkG4'},
                    )
                )
            ],
            inspect_arguments=False,
        )

    logfire.configure = custom_logfire_configure
    logfire_configured = True

import re
import tomllib

REGEX = r'(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$'

def read(script: str) -> dict | None:
    name = 'script'
    matches = list(
        filter(lambda m: m.group('type') == name, re.finditer(REGEX, script))
    )
    if len(matches) > 1:
        raise ValueError(f'Multiple {name} blocks found')
    elif len(matches) == 1:
        content = ''.join(
            line[2:] if line.startswith('# ') else line[1:]
            for line in matches[0].group('content').splitlines(keepends=True)
        )
        return tomllib.loads(content)
    else:
        return None


try:
    await main(user_code)  # noqa: F821,F704
except Exception:
    traceback.print_exc()
    raise
