# build.sh
#!/bin/bash
set -e # exit immediately if error

echo "🧹 Cleaning build directory..."
rm -rf build/**

echo "📦 Building CommonJS..."
jq '.type = "commonjs"' package.json > package.json.tmp && mv package.json.tmp package.json
npx tsc -p tsconfig.build.json --outDir build/cjs
find build/cjs -name "*.js" -exec sh -c 'mv "$1" "${1%.js}.cjs"' _ {} \;

echo "📦 Building ESM..."
jq '.type = "module"' package.json > package.json.tmp && mv package.json.tmp package.json
npx tsc -p tsconfig.build.json --outDir build/esm

echo '✅ Dual package build completed successfully!'
