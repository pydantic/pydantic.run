"""
Logic for installing dependencies in Pyodide and running user code.

Some of this is taken from https://github.com/alexmojaki/pyodide-worker-runner/blob/master/lib/pyodide_worker_runner.py
"""
from __future__ import annotations as _annotations
import importlib
import logging
import re
import sys
import traceback
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypedDict, Iterable, Literal
import importlib.util

import micropip  # noqa
from micropip import logging as micropip_logging  # noqa
import tomllib
from pyodide.code import find_imports  # noqa
import pyodide_js  # noqa

__all__ = ('install_deps',)

sys.setrecursionlimit(400)
# user a dict here to maintain order
_all_dependencies: dict[str, None] = {}
_logfire_configured = False


class File(TypedDict):
    name: str
    content: str
    activeIndex: int


@dataclass
class Success:
    message: str
    kind: Literal['success'] = 'success'


@dataclass
class Error:
    message: str
    kind: Literal['error'] = 'error'


async def install_deps(files: list[File]) -> Success | Error:
    cwd = Path.cwd()
    for file in cwd.iterdir():
        if file.name != 'run.py' and file.is_file():
            file.unlink()
    for file in files:
        (cwd / file['name']).write_text(file['content'])

    dependencies: dict[str, None] = {}
    active: File | None = None
    highest = -1
    for file in files:
        active_index = file['activeIndex']
        if active_index > highest:
            active = file
            highest = active_index

    if active:
        dependencies = _find_pep723_dependencies(active['content'])
    if dependencies is None:
        dependencies = await _find_import_dependencies(files)
    new_dependencies = {dep: None for dep in dependencies if dep not in _all_dependencies}

    if new_dependencies:
        with _micropip_logging() as file_name:
            try:
                await micropip.install(new_dependencies.keys(), keep_going=True)
                importlib.invalidate_caches()
            except Exception:
                with open(file_name) as f:
                    logs = f.read()
                return Error(message=f'{logs}\n{traceback.format_exc()}')

        _all_dependencies.update(new_dependencies)
        if 'logfire' in new_dependencies:
            _prep_logfire()

    return Success(message=', '.join(_all_dependencies.keys()))


@contextmanager
def _micropip_logging() -> Iterable[str]:
    micropip_logging.setup_logging()
    logger = logging.getLogger('micropip')
    logger.handlers.clear()
    logger.setLevel(logging.INFO)

    file_name = 'micropip.log'
    handler = logging.FileHandler(file_name)
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)
    try:
        yield file_name
    finally:
        logger.removeHandler(handler)


def _prep_logfire():
    global _logfire_configured
    if _logfire_configured:
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
    _logfire_configured = True


def _find_pep723_dependencies(script: str) -> dict[str, None] | None:
    """Extract dependencies from a script with PEP 723 metadata."""
    metadata = _read_pep723_metadata(script)
    dependencies = metadata.get('dependencies')
    if dependencies is None:
        return None
    else:
        assert isinstance(dependencies, list), 'dependencies must be a list'
        assert all(isinstance(dep, str) for dep in dependencies), 'dependencies must be a list of strings'
        return {dep: None for dep in dependencies}


def _read_pep723_metadata(script: str) -> dict[str, Any]:
    """Read PEP 723 script metadata.

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


async def _find_import_dependencies(files: list[File]) -> dict[str, None]:
    """Find dependencies in imports."""
    deps: dict[str, None] = {}
    for file in files:
        try:
            imports: list[str] = find_imports(file['content'])
        except SyntaxError:
            pass
        else:
            deps.update(_find_imports_to_install(imports))
    return deps


def _find_imports_to_install(imports: list[str]) -> dict[str, None]:
    """Given a list of module names being imported, return package that are not installed."""
    to_package_name = pyodide_js._api._import_name_to_package_name.to_py()

    to_install: dict[str, None] = {}
    for module in imports:
        try:
            importlib.import_module(module)
        except ModuleNotFoundError:
            to_install[to_package_name.get(module, module)] = None
    return to_install
