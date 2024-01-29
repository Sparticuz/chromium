# Chromium as a Layer for AWS SAM

1. Install AWS SAM CLI: https://github.com/aws/aws-sam-cli/

1. Ensure Docker is installed and running: https://www.docker.com/

1. Build the project:

   ```sh
   sam build
   ```

1. Invoke the AWS Lambda Function locally with:

   ```sh
   sam local invoke ExampleFunction
   ```

   This example connects to https://www.example.com and outputs the page's title as the function result. See the source code in [`app.mjs`](functions/exampleFunction/app.mjs) for more details.
