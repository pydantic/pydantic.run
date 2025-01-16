import importlib
import traceback
from typing import Any

import micropip
import re
import tomllib

logfire_configured = False

async def main(user_code: str):
    dependencies = script_dependencies(user_code)
    if dependencies:
        await micropip.install(dependencies)
        importlib.invalidate_caches()

    if 'logfire' in dependencies:
        prep_logfire()

    exec(compile(user_code, 'user_code.py', 'exec'))


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


def script_dependencies(script: str) -> list[str]:
    metadata = read_script_metadata(script)
    if dependencies := metadata.get('dependencies'):
        assert isinstance(dependencies, list), 'dependencies must be a list'
        assert all(isinstance(dep, str) for dep in dependencies), 'dependencies must be a list of strings'
        return dependencies
    else:
        return []


def read_script_metadata(script: str) -> dict[str, Any]:
    """read PEP 723 script metadata.

    Copied from https://packaging.python.org/en/latest/specifications/inline-script-metadata/#reference-implementation
    """
    name = 'script'
    magic_comment_regex = r'(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$'
    matches = list(
        filter(lambda m: m.group('type') == name, re.finditer(magic_comment_regex, script))
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
        return {}


try:
    await main(user_code)  # noqa: F821,F704
except Exception:
    traceback.print_exc()
    raise
