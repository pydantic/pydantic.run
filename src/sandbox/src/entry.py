import sys
from typing import Annotated, Any

import pyodide
from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

import run_code


async def on_fetch(request: Any, env: Any) -> Any:
    import asgi

    return await asgi.fetch(app, request, env)


app = FastAPI()


@app.head('/', include_in_schema=False)
@app.get('/', include_in_schema=False)
async def index() -> HTMLResponse:
    v = await versions()
    return HTMLResponse(f"""
<h1>Python sandbox</h1>
<p>
  See <a href="https://github.com/pydantic/pydantic.run">github.com/pydantic/pydantic.run</a> for more information.
</p>

<p>
  API docs: <a href="redoc">here</a> (built by FastAPI)
</p>
<p>
  Python version: <b><pre>{v.python_version}</pre></b>
</p>
<p>
  Pyodide version: <b>{v.pyodide_version}</b>
</p>
""")


class Versions(BaseModel):
    python_version: str
    pyodide_version: str


@app.head('/versions', include_in_schema=False)
@app.head('/versions/', include_in_schema=False)
@app.get('/versions', include_in_schema=False)
@app.get('/versions/', response_model=Versions)
async def versions() -> Versions:
    """Get Python and Pyodide versions."""
    return Versions(python_version=sys.version, pyodide_version=pyodide.__version__)


run_responses: dict[int | str, dict[str, Any]] = {
    200: {
        'description': 'Code executed',
        'model': run_code.RunResult,
    },
    400: {
        'description': 'Failed to serialize response',
        'content': {
            'application/json': {
                'schema': {
                    'type': 'object',
                    'properties': {
                        'message': {'type': 'string'},
                    },
                }
            }
        },
    },
    422: {
        'description': 'Request body is empty',
        'content': {
            'application/json': {
                'schema': {
                    'type': 'object',
                    'properties': {
                        'message': {'type': 'string', 'const': 'Request body is empty'},
                    },
                }
            }
        },
    },
}


@app.post('/run', include_in_schema=False)
@app.post('/run/', response_model=run_code.RunResult, responses=run_responses)
async def run(request: Request, file_name: Annotated[str, Header()] = 'main.py') -> Response:
    """Run Python, the request body is interpreted as the code to run."""
    request_body = await request.body()
    if request_body:
        code = request_body.decode()
        run_result = await run_code.run(file_name, code)
        try:
            return Response(run_result.lenient_to_json())
        except ValueError as e:
            return JSONResponse(status_code=400, content={'message': f'Failed to serialize response: {e}'})
    else:
        return JSONResponse(status_code=422, content={'message': 'Request body is empty'})
