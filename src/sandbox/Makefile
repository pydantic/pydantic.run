.DEFAULT_GOAL := all

.PHONY: .uv
.uv:
	@uv --version || echo 'Please install uv: https://docs.astral.sh/uv/getting-started/installation/'

.PHONY: install
install: .uv
	uv sync --frozen

.PHONY: format
format:
	uv run ruff format
	uv run ruff check --fix --fix-only

.PHONY: lint
lint:
	uv run ruff format --check
	uv run ruff check

.PHONY: typecheck
typecheck:
	PYRIGHT_PYTHON_IGNORE_WARNINGS=1 uv run pyright

.PHONY: all
all: format lint typecheck
