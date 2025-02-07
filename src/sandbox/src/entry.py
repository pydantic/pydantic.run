from typing import Annotated

import run_code
from fastapi import FastAPI, Header, HTTPException, Request, Response


async def on_fetch(request, env):
    import asgi

    return await asgi.fetch(app, request, env)


app = FastAPI()


@app.head('/', include_in_schema=False)
@app.get('/')
async def index() -> Response:
    return Response('Python sandbox')


@app.post('/run', include_in_schema=False)
@app.post('/run/', response_model=run_code.RunResult)
async def run(request: Request, file_name: Annotated[str, Header()] = 'main.py') -> Response:
    """Run Python, the request body is interpreted as the code to run."""
    request_body = await request.body()
    if request_body:
        code = request_body.decode()
        run_result = await run_code.run(file_name, code)
        try:
            return Response(run_result.lenient_to_json())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f'Failed to serialize response: {e}')
    else:
        raise HTTPException(status_code=400, detail='Request body is empty')
