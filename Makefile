PYTHON ?= python3
.PHONY: all verify-rom bootstrap generate build smoke route test-tool differential run
all verify-rom bootstrap generate build smoke route test-tool differential run:
	$(PYTHON) tools/project.py $@

.PHONY: app-install app-dev app-build app-test
app-install:
	npm ci --prefix app
app-dev:
	npm --prefix app run tauri -- dev
app-build:
	npm --prefix app run tauri -- build
app-test:
	npm --prefix app run build
	npm --prefix app test
