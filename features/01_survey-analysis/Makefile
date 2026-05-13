CODEX_HOME ?= $(HOME)/.codex
ROOT := $(CURDIR)
PIPELINE := ./ops/run_schema_change_pipeline.sh

OLD ?=
NEW ?=
CANONICAL ?=
SCAN_TERM ?=
PUSH ?=0
FORCE ?=0
VERSION_DESC ?=
REDEPLOY_ID ?=
DEPLOY ?=0
BOOTSTRAP_SCRIPT_ID ?=

.PHONY: smoke schema-scan pipeline

smoke:
	$(PIPELINE) --mode smoke --root "$(ROOT)"

schema-scan:
	$(PIPELINE) --mode scan --root "$(ROOT)" \
	$(if $(OLD),--old "$(OLD)") \
	$(if $(NEW),--new "$(NEW)") \
	$(if $(CANONICAL),--canonical "$(CANONICAL)") \
	$(if $(SCAN_TERM),--term "$(SCAN_TERM)")

pipeline:
	$(PIPELINE) --mode pipeline --root "$(ROOT)" \
	$(if $(OLD),--old "$(OLD)") \
	$(if $(NEW),--new "$(NEW)") \
	$(if $(CANONICAL),--canonical "$(CANONICAL)") \
	$(if $(SCAN_TERM),--term "$(SCAN_TERM)") \
	$(if $(BOOTSTRAP_SCRIPT_ID),--bootstrap-script-id "$(BOOTSTRAP_SCRIPT_ID)") \
	$(if $(filter 1,$(PUSH)),--push) \
	$(if $(filter 1,$(FORCE)),--force) \
	$(if $(VERSION_DESC),--version-desc "$(VERSION_DESC)") \
	$(if $(REDEPLOY_ID),--redeploy-id "$(REDEPLOY_ID)") \
	$(if $(filter 1,$(DEPLOY)),--deploy)
