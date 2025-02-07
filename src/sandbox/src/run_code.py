from __future__ import annotations as _annotations

import importlib
import importlib.util
import inspect
import io
import sys
import time
import traceback
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict

from pydantic import BaseModel, Discriminator

__all__ = 'run', 'RunResult'


async def run(file_name: str, code: str) -> RunResult:
    stream_builder = StreamBuilder()
    stdout_buffer = StreamIO(stream_builder, 'out')
    stderr_buffer = StreamIO(stream_builder, 'err')
    with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
        stream_builder.start_time = time.perf_counter()
        mode, result = await run_code(file_name, code)
    return RunResult(
        stream=stream_builder.get_done(),
        mode=mode,
        result=result,
        run_time=time.perf_counter() - stream_builder.start_time,
    )


class RunMode(StrEnum):
    main = 'main'
    async_main = 'async-main'
    no_main_function = 'no-main-function'
    unknown = 'unknown'


class Stdout(TypedDict):
    s: Literal['out']
    v: str
    t: float


class Stderr(TypedDict):
    s: Literal['err']
    v: str
    t: float


class RunError(BaseModel):
    status: Literal['error'] = 'error'
    error: str


class RunSuccess(BaseModel):
    status: Literal['success'] = 'success'
    return_value: Any = None


class RunResult(BaseModel):
    stream: list[Annotated[Stdout | Stderr, Discriminator('s')]]
    mode: RunMode
    result: Annotated[RunError | RunSuccess, Discriminator('status')]
    run_time: float

    def lenient_to_json(self) -> bytes:
        return self.__pydantic_serializer__.to_json(self, indent=2, fallback=fallback)


def fallback(value: Any) -> Any:
    tp: Any = type(value)
    module = tp.__module__
    if module == 'numpy':
        if tp.__name__ in ('ndarray', 'matrix'):
            return value.tolist()
        else:
            return value.item()
    elif module == 'pyodide.ffi':
        return value.to_py()
    else:
        raise TypeError(f'`{value!r}` is not JSON serializable')


@dataclass(slots=True)
class StreamBuilder:
    stream: list[Stdout | Stderr] = field(default_factory=list)
    last_key: Literal['out', 'err'] | None = None
    last_text: list[str] = field(default_factory=list)
    last_time: float = 0.0
    start_time: float = 0.0

    def write(self, text: str, key: Literal['out', 'err']) -> int:
        if self.last_key is None:
            self.last_key = key
            self.last_text.append(text)
            self.last_time = time.perf_counter()
        elif self.last_key == key and (time.perf_counter() - self.last_time) < 0.01:
            self.last_text.append(text)
        else:
            self._stream_append()
            self.last_key = key
            self.last_text.clear()
            self.last_text.append(text)
            self.last_time = time.perf_counter()
        return len(text)

    def get_done(self) -> list[Stdout | Stderr]:
        if self.last_key:
            self._stream_append()
        return self.stream

    def _stream_append(self) -> None:
        # noinspection PyTypeChecker
        self.stream.append(
            {  # pyright: ignore[reportArgumentType]
                's': self.last_key,
                'v': ''.join(self.last_text),
                't': self.last_time - self.start_time,
            }
        )


@dataclass(slots=True)
class StreamIO(io.StringIO):
    stream_builder: StreamBuilder
    key: Literal['out', 'err']

    def write(self, text: str) -> int:
        return self.stream_builder.write(text, self.key)


async def run_code(file_name: str, code: str) -> tuple[RunMode, RunError | RunSuccess]:
    file_path = Path(file_name)
    file_path.write_text(code)
    spec = importlib.util.spec_from_file_location(file_name, file_path)
    assert spec, f'Failed to create spec for {file_name}'
    assert spec.loader, f'Failed to create loader for {file_name}'
    module = importlib.util.module_from_spec(spec)
    run_mode = RunMode.unknown
    return_value = None

    try:
        spec.loader.exec_module(module)
        main_function = getattr(module, 'main', None)
        if main_function:
            if inspect.iscoroutinefunction(main_function):
                run_mode = RunMode.async_main
                return_value = await main_function()
            else:
                run_mode = RunMode.main
                return_value = main_function()
        else:
            run_mode = RunMode.no_main_function
    except SyntaxError as e:
        return run_mode, RunError(error=''.join(traceback.format_exception_only(SyntaxError, e)))
    except BaseException:
        exc_type, exc_value, exc_traceback = sys.exc_info()
        tb = traceback.extract_tb(exc_traceback)
        tb = [f for f in tb[1:] if not is_importlib(f)]

        formatted_traceback = ''.join(traceback.format_list(tb) + traceback.format_exception_only(exc_type, exc_value))
        return run_mode, RunError(error=formatted_traceback)
    else:
        if run_mode == RunMode.no_main_function:
            return run_mode, RunSuccess()
        else:
            return run_mode, RunSuccess(return_value=return_value)


def is_importlib(f: traceback.FrameSummary) -> bool:
    return f.filename.startswith('<frozen importlib')
