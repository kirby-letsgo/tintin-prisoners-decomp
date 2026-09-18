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

.PHONY: sprites sprites-export sprites-test
sprites:
	$(PYTHON) tools/sprites.py capture
sprites-export:
	$(PYTHON) tools/sprites.py export
sprites-test:
	$(PYTHON) -m unittest discover -s tools -p test_sprites.py -v
