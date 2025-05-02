.PHONY: clean

clean:
	rm -rf chromium.zip _/amazon/code/nodejs _/amazon/handlers/node_modules

pretest:
	unzip chromium.zip -d _/amazon/code
	npm install --prefix _/amazon/handlers puppeteer-core@latest --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false

test:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node22

test20:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node20

%.x64.zip:
	npm install --fund=false --package-lock=false
	npm run build
	mkdir -p nodejs
	npm install --prefix nodejs/ tar-fs@3.0.8 follow-redirects@1.15.9 --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	cp -R bin/x64/* bin
	npm pack
	rm bin/chromium.br bin/al2023.tar.br bin/swiftshader.tar.br
	mkdir -p nodejs/node_modules/@sparticuz/chromium/
	tar --directory nodejs/node_modules/@sparticuz/chromium/ --extract --file sparticuz-chromium-*.tgz --strip-components=1
	npx clean-modules --directory nodejs "**/*.d.ts" "**/@types/**" "**/*.@(yaml|yml)" --yes
	rm sparticuz-chromium-*.tgz
	mkdir -p $(dir $@)
	zip -9 --filesync --move --recurse-paths $@ nodejs

%.arm64.zip:
	npm install --fund=false --package-lock=false
	npm run build
	mkdir -p nodejs
	npm install --prefix nodejs/ tar-fs@3.0.8 follow-redirects@1.15.9 --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	cp -R bin/arm64/* bin
	npm pack
	rm bin/chromium.br bin/al2023.tar.br bin/swiftshader.tar.br
	mkdir -p nodejs/node_modules/@sparticuz/chromium/
	tar --directory nodejs/node_modules/@sparticuz/chromium/ --extract --file sparticuz-chromium-*.tgz --strip-components=1
	npx clean-modules --directory nodejs "**/*.d.ts" "**/@types/**" "**/*.@(yaml|yml)" --yes
	rm sparticuz-chromium-*.tgz
	mkdir -p $(dir $@)
	zip -9 --filesync --move --recurse-paths $@ nodejs

pack-x64:
	cd bin/x64 && \
	cp ../fonts.tar.br . && \
	tar -cvf chromium-pack.x64.tar al2023.tar.br chromium.br fonts.tar.br swiftshader.tar.br && \
	rm fonts.tar.br && \
	mv chromium-pack.x64.tar ../..

pack-arm64:
	cd bin/arm64 && \
	cp ../fonts.tar.br . && \
	tar -cvf chromium-pack.arm64.tar al2023.tar.br chromium.br fonts.tar.br swiftshader.tar.br && \
	rm fonts.tar.br && \
	mv chromium-pack.arm64.tar ../..

.DEFAULT_GOAL := chromium.x64.zip
