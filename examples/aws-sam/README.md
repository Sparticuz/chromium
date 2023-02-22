# aws-sam-example

This project is an example of using chromium inside aws sam written from sam init Hello World template with nodeJS 16 as runtime.

### Changes from hello world template

- Installed puppeteer and @sparticuz/chromium
  - Note: it must not be in dev-dependencies
- Modified the handler to instantiate the browser pointing to the AWS layer directory (`/opt/nodejs/node_modules/@sparticuz/chromium/bin`)
- Added layer in template and fixed timeout and
- Running same example as README

### Configuration

You must create a layer with the chromium binary and replace its arn inside `template.yaml`. You can see an example on how to create it in the main project README.

### Running

Build and invoke the function.

```bash
sam build
sam local invoke
```
