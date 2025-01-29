# [pydantic.run](https://pydantic.run)

Python browser sandbox. Write and share Python code, run it in the browser.

Built to demonstrate [Pydantic](https://docs.pydantic.dev), [PydanticAI](https://ai.pydantic.dev), and [Pydantic Logfire](https://docs.pydantic.dev/logfire).

If you choose to save code, it's stored in CloudFlare's R2 object storage, and should be available for one year.

---

## Dependencies

Dependencies are installed when code is run.

Dependencies can be either:

- defined via [inline script metadata](https://packaging.python.org/en/latest/specifications/inline-script-metadata/#inline-script-metadata) — e.g. a comment at the top of the file, as used by [uv](https://docs.astral.sh/uv/guides/scripts/#declaring-script-dependencies)
- or, inferred from imports in the code — e.g. `import pydantic` will install the `pydantic` package

### Sandbox via link

To programmatically create a sandbox, make a `GET` request to `https://pydantic.run/new`, with the `files` parameter set to a JSON object containing the files you want to show.

The response is a 302 redirect to the newly created sandbox, hence you can direct a user to a sandbox with the code you want them to see. Repeated requests with the same `files` will use the same sandbox.

`files` should be an array of objects with the following keys:

- `name` - (string) the name of the file
- `content` - (string) the content of the file
- **Optionally** `activeIndex` - (integer) indicating which file/tab is open by default, the highest value wins

Here's a minimal HTML page that provides a link to create a new sandbox with two files:

```html
<div>loading...</div>
<script>
  const files = [
    {
      name: 'main.py',
      content: 'print("This is an example!")',
      activeIndex: 1,
    },
    {
      name: 'another.py',
      content: 'x = 42\nprint(f"The answer is {x}")',
    },
  ]
  const redirectUrl = new URL('https://pydantic.run/new')
  redirectUrl.searchParams.append('files', JSON.stringify(files))
  document.querySelector('div').innerHTML = `<a href="${redirectUrl}">Click here to create a new sandbox</a>`
</script>
```

Demo [here](https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic.run/blob/main/create_sandbox_demo.html).
