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
from urllib.parse import urlparse

import tomllib

import micropip  # noqa
from micropip import transaction  # noqa
from micropip.wheelinfo import WheelInfo, Tag, Version  # noqa

from pyodide.code import find_imports  # noqa
import pyodide_js  # noqa

__all__ = ('prepare_env',)


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


async def prepare_env(files: list[File]) -> Success | Error:
    # This is a temporary hack to install jiter from a URL until
    # https://github.com/pyodide/pyodide/pull/5388 is released.
    real_find_wheel = transaction.find_wheel

    def custom_find_wheel(metadata: Any, req: Any) -> Any:
        if metadata.name == 'jiter':
            known_version = Version('0.8.2')
            if known_version in metadata.releases:
                tag = Tag('cp312', 'cp312', 'emscripten_3_1_58_wasm32')
                filename = f'{metadata.name}-{known_version}-{tag}.whl'
                url = f'https://files.pydantic.run/{filename}'
                return WheelInfo(
                    name=metadata.name,
                    version=known_version,
                    filename=filename,
                    build=(),
                    tags=frozenset({tag}),
                    url=url,
                    parsed_url=urlparse(url),
                )
        return real_find_wheel(metadata, req)

    transaction.find_wheel = custom_find_wheel
    # end `transaction.find_wheel` hack

    sys.setrecursionlimit(400)

    os.environ.update(
        OPENAI_BASE_URL='https://proxy.pydantic.run/proxy/openai',
        OPENAI_API_KEY='proxy-key',
    )

    cwd = Path.cwd()
    for file in files:
        (cwd / file['name']).write_text(file['content'])

    # For now, until all logfire endpoints set CORS headers
    # waiting for https://github.com/pydantic/platform/pull/7353 and follow up for `/v1/info`
    os.environ['LOGFIRE_BASE_URL'] = 'https://logfire-logs-proxy.pydantic.workers.dev'

    active: File | None = None
    highest = -1
    for file in files:
        active_index = file['activeIndex']
        if active_index > highest:
            active = file
            highest = active_index

    dependencies: list[str] | None = None
    if active:
        python_code = active['content']
        dependencies = _find_pep723_dependencies(python_code)
        if dependencies is None:
            dependencies = await _find_import_dependencies(python_code)

    if dependencies:
        # pygments seems to be required to get rich to work properly, ssl is required for FastAPI and HTTPX
        install_pygments = False
        install_ssl = False
        for d in dependencies:
            if d.startswith(('logfire', 'rich')):
                install_pygments = True
            elif d.startswith(('fastapi', 'httpx', 'pydantic_ai')):
                install_ssl = True
            if install_pygments and install_ssl:
                break

        install_dependencies = dependencies.copy()
        if install_pygments:
            install_dependencies.append('pygments')
        if install_ssl:
            install_dependencies.append('ssl')

        with _micropip_logging() as logs_filename:
            try:
                await micropip.install(install_dependencies, keep_going=True)
                importlib.invalidate_caches()
            except Exception:
                with open(logs_filename) as f:
                    logs = f.read()
                return Error(message=f'{logs}\n{traceback.format_exc()}')

    # temporary hack until the debug prints in https://github.com/encode/httpx/pull/3330 are used/merged
    try:
        from httpx import AsyncClient
    except ImportError:
        pass
    else:
        original_send = AsyncClient.send

        def print_monkeypatch(*args, **kwargs):
            pass

        async def send_monkeypatch_print(self, *args, **kwargs):
            import builtins
            original_print = builtins.print
            builtins.print = print_monkeypatch
            try:
                return await original_send(self, *args, **kwargs)
            finally:
                builtins.print = original_print

        AsyncClient.send = send_monkeypatch_print
    # end temporary hack for httpx debug prints

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


def _find_pep723_dependencies(code: str) -> list[str] | None:
    """Extract dependencies from a script with PEP 723 metadata."""
    metadata = _read_pep723_metadata(code)
    dependencies = metadata.get('dependencies')
    if dependencies is None:
        return None
    else:
        assert isinstance(dependencies, list), 'dependencies must be a list'
        assert all(isinstance(dep, str) for dep in dependencies), 'dependencies must be a list of strings'
        return dependencies


def _read_pep723_metadata(code: str) -> dict[str, Any]:
    """Read PEP 723 script metadata.

    Copied from https://packaging.python.org/en/latest/specifications/inline-script-metadata/#reference-implementation
    """
    name = 'script'
    magic_comment_regex = r'(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$'
    matches = list(
        filter(lambda m: m.group('type') == name, re.finditer(magic_comment_regex, code))
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


async def _find_import_dependencies(code: str) -> list[str] | None:
    """Find dependencies in imports."""
    try:
        imports: list[str] = find_imports(code)
    except SyntaxError:
        return
    else:
        return list(_find_imports_to_install(imports))


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
