"""
Logic for installing dependencies in Pyodide and running user code.

Some of this is taken from https://github.com/alexmojaki/pyodide-worker-runner/blob/master/lib/pyodide_worker_runner.py
"""
from __future__ import annotations as _annotations
import importlib
import logging
import os
import re
import sys
import traceback
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypedDict, Iterable, Literal
import importlib.util

import tomllib
from pyodide.code import find_imports  # noqa
import pyodide_js  # noqa

__all__ = ('install_deps',)


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
    sys.setrecursionlimit(400)
    cwd = Path.cwd()
    for file in files:
        (cwd / file['name']).write_text(file['content'])

    # For now, until all logfire endpoints set CORS headers
    # waiting for https://github.com/pydantic/platform/pull/7353 and follow up for `/v1/info`
    os.environ['LOGFIRE_BASE_URL'] = 'https://logfire-logs-proxy.pydantic.workers.dev'

    dependencies: list[str] | None = None
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

    if dependencies:
        # pygments seems to be required to get rich to work properly, ssl is required for FastAPI and HTTPX
        install_pygments = False
        install_ssl = False
        for d in dependencies:
            if d.startswith(('logfire', 'rich')):
                install_pygments = True
            elif d.startswith(('fastapi', 'httpx')):
                install_ssl = True
            if install_pygments and install_ssl:
                break

        if install_pygments:
            dependencies.append('pygments')
        if install_ssl:
            dependencies.append('ssl')

        import micropip  # noqa
        with _micropip_logging() as logs_filename:
            try:
                await micropip.install(dependencies, keep_going=True)
                importlib.invalidate_caches()
            except Exception:
                with open(logs_filename) as f:
                    logs = f.read()
                return Error(message=f'{logs}\n{traceback.format_exc()}')

    return Success(message=', '.join(dependencies))


@contextmanager
def _micropip_logging() -> Iterable[str]:
    from micropip import logging as micropip_logging  # noqa

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


def _find_pep723_dependencies(script: str) -> list[str] | None:
    """Extract dependencies from a script with PEP 723 metadata."""
    metadata = _read_pep723_metadata(script)
    dependencies = metadata.get('dependencies')
    if dependencies is None:
        return None
    else:
        assert isinstance(dependencies, list), 'dependencies must be a list'
        assert all(isinstance(dep, str) for dep in dependencies), 'dependencies must be a list of strings'
        return dependencies


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


async def _find_import_dependencies(files: list[File]) -> list[str]:
    """Find dependencies in imports."""
    deps: list[str] = []
    for file in files:
        try:
            imports: list[str] = find_imports(file['content'])
        except SyntaxError:
            pass
        else:
            deps.extend(_find_imports_to_install(imports))
    return deps


TO_PACKAGE_NAME: dict[str, str] = pyodide_js._api._import_name_to_package_name.to_py()


def _find_imports_to_install(imports: list[str]) -> Iterable[str]:
    """Given a list of module names being imported, return packages that are not installed."""
    for module in imports:
        try:
            importlib.import_module(module)
        except ModuleNotFoundError:
            if package_name := TO_PACKAGE_NAME.get(module):
                yield package_name
            elif '.' not in module:
                yield module
