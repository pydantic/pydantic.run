# [pydantic.run](https://pydantic.run)

Python browser sandbox. Write and share Python code, run it in the browser.

Built to demonstrate [Pydantic](https://docs.pydantic.dev), [PydanticAI](https://ai.pydantic.dev), and [Pydantic Logfire](https://docs.pydantic.dev/logfire).

If you choose to save code, it's stored in CloudFlare's R2 object storage, and should be available for one year.

---

## Usage

Most of the UI is self-explanatory.

The only extra functionality requiring documentation is programmatically creating a sandbox.

To create a sandbox, make a `GET` request to `https://pydantic.run/new`, with the `files` parameter set to a JSON object containing the files you want to create.

The response is a 302 redirect to the newly created sandbox, hence you can direct a user to a sandbox with the code you want them to see. Repeated requests with the same `files` will use the same sandbox.

`files` should be a list of dicts with the following keys:

- `name` - the name of the file
- `content` - the content of the file
- **Optionally** `activeIndex` - integer indicating which tab is open by default, the highest index is selected by default

Here's a minimal HTML page that provides a link to create a new sandbox with two files:

```html
<div id="root">loading...</div>
<script>
  files = [
    {
      name: 'README.md',
      content: '# Example\n\nThis is an example.',
    },
    {
      name: 'main.py',
      content: 'print("This is an example!")',
      activeIndex: 1,
    },
  ]
  const redirectUrl = new URL('https://pydantic.run/new')
  redirectUrl.searchParams.append('files', JSON.stringify(files))
  const root = document.getElementById('root')
  root.innerHTML = `<a href="${redirectUrl}">Click here to create a new sandbox</a>`
</script>
```
