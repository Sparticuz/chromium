.PHONY: clean

ARCH = $(shell uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')

clean:
	rm -rf chromium.zip _/amazon/code/nodejs _/amazon/handlers/node_modules

pretest:
	unzip chromium.$(ARCH).zip -d _/amazon/code
	npm install --prefix _/amazon/handlers puppeteer-core@latest --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false

test:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node24

test-cjs:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node24cjs

test22:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node22

test20:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node20

presource:
	cp -R bin/$(ARCH)/* bin

postsource:
	rm bin/chromium.br bin/al2023.tar.br bin/swiftshader.tar.br

define build-zip
	npm install --fund=false --package-lock=false
	npm run build
	mkdir -p nodejs
	npm install --prefix nodejs/ tar-fs@3.1.2 follow-redirects@1.15.11 --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	cp -R bin/$(1)/* bin
	npm pack
	rm bin/chromium.br bin/al2023.tar.br bin/swiftshader.tar.br
	mkdir -p nodejs/node_modules/@sparticuz/chromium/
	tar --directory nodejs/node_modules/@sparticuz/chromium/ --extract --file sparticuz-chromium-*.tgz --strip-components=1
	npx clean-modules --directory nodejs "**/*.d.ts" "**/@types/**" "**/*.@(yaml|yml)" --yes
	rm sparticuz-chromium-*.tgz
	mkdir -p $(dir $@)
	zip -9 --filesync --move --recurse-paths $@ nodejs
endef

%.x64.zip:
	$(call build-zip,x64)

%.arm64.zip:
	$(call build-zip,arm64)

define pack-arch
	cd bin/$(1) && \
	cp ../fonts.tar.br . && \
	tar -cvf chromium-pack.$(1).tar al2023.tar.br chromium.br fonts.tar.br swiftshader.tar.br && \
	rm fonts.tar.br && \
	mv chromium-pack.$(1).tar ../..
endef

pack-x64:
	$(call pack-arch,x64)

pack-arm64:
	$(call pack-arch,arm64)

.DEFAULT_GOAL := chromium.x64.zip
