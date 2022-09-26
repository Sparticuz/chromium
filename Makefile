.PHONY: clean

clean:
	rm -rf chrome_aws_lambda.zip _/amazon/code/nodejs

pretest:
	unzip chrome_aws_lambda.zip -d _/amazon/code

test:
	sam local invoke --template _/amazon/template.yml --event _/amazon/events/example.com.json node16

.fonts.zip:
	zip -9 --filesync --move --recurse-paths .fonts.zip .fonts/

%.zip:
	npm install --fund=false --package-lock=false
	mkdir -p nodejs
	npm install --prefix nodejs/ tar-fs@2.1.1 puppeteer-core@17.1.3 --bin-links=false --fund=false --omit=optional --omit=dev --package-lock=false --save=false
	npm pack
	mkdir -p nodejs/node_modules/@sparticuz/chrome-aws-lambda/
	tar --directory nodejs/node_modules/@sparticuz/chrome-aws-lambda/ --extract --file sparticuz-chrome-aws-lambda-*.tgz --strip-components=1
	npx clean-modules --directory nodejs --include "**/*.d.ts" "**/@types/**" "**/*.@(yaml|yml)" --yes
	rm sparticuz-chrome-aws-lambda-*.tgz
	mkdir -p $(dir $@)
	zip -9 --filesync --move --recurse-paths $@ nodejs

.DEFAULT_GOAL := chrome_aws_lambda.zip
