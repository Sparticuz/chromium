.PHONY: test-lambda pack-x64 pack-arm64 FORCE

ARCH ?= $(shell uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')
SAM_ARCH = $(if $(filter x64,$(ARCH)),x86_64,$(ARCH))
SAM_FUNCTION ?= node26

test-lambda: chromium.$(ARCH).zip
	rm -rf _/amazon/code/nodejs
	unzip "$<" -d _/amazon/code
	npm install --prefix _/amazon/handlers puppeteer-core@latest --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	sam local invoke "$(SAM_FUNCTION)" --template _/amazon/template.yml --event _/amazon/events/example.com.json \
		--parameter-overrides "Architecture=$(SAM_ARCH)"

define build-zip
	npm ci --fund=false
	npm run build
	mkdir -p nodejs
	npm install --prefix nodejs/ modern-tar@0.8.6 --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	cp -R bin/$(1)/* bin
	npm pack
	rm -f bin/chromium.br bin/al2023.tar.br bin/swiftshader.tar.br
	mkdir -p nodejs/node_modules/@sparticuz/chromium/
	tar --directory nodejs/node_modules/@sparticuz/chromium/ --extract --file sparticuz-chromium-*.tgz --strip-components=1
	npx clean-modules --directory nodejs "**/*.d.ts" "**/@types/**" "**/*.@(yaml|yml)" --yes
	rm sparticuz-chromium-*.tgz
	mkdir -p $(dir $@)
	@set -eu; \
	tmp=$$(mktemp -d "$(dir $@).chromium-layer.XXXXXX"); \
	trap 'rm -rf "$$tmp"' EXIT; \
	zip -9 --move --recurse-paths "$$tmp/layer.zip" nodejs; \
	mv -f "$$tmp/layer.zip" "$@"
endef

%.x64.zip: FORCE
	$(call build-zip,x64)

%.arm64.zip: FORCE
	$(call build-zip,arm64)

FORCE:

define build-pack
	cd bin/$(1) && \
	cp ../fonts.tar.br . && \
	tar -cvf chromium-pack.$(1).tar al2023.tar.br chromium.br fonts.tar.br swiftshader.tar.br && \
	rm fonts.tar.br && \
	mv chromium-pack.$(1).tar ../..
endef

pack-x64:
	$(call build-pack,x64)

pack-arm64:
	$(call build-pack,arm64)

.DEFAULT_GOAL := chromium.$(ARCH).zip
