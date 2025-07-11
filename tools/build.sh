# build.sh
#!/bin/bash
set -e # exit immediately if error

echo "🧹 Cleaning build directory..."
rm -rf build/**

echo "📦 Building ESM..."
cp package.json package.json.orig
cp tsconfig.build.json tsconfig.build.json.orig
jq '.exclude += ["./source/paths.cjs.ts"]' tsconfig.build.json > tsconfig.build.json.tmp && mv tsconfig.build.json.tmp tsconfig.build.json
npx tsc -p tsconfig.build.json --outDir build/esm
# Restore original package.json and tsconfig.build.json
cp package.json.orig package.json
cp tsconfig.build.json.orig tsconfig.build.json

echo "📦 Building CommonJS..."
# Update package.json and tsconfig for CommonJS build
# Use jq to modify package.json and tsconfig.build.json
# Ensure jq is installed: sudo apt install jq
jq '.type = "commonjs"' package.json > package.json.tmp && mv package.json.tmp package.json
# Replace ESM path import with CJS path import
find source -name "*.ts" -exec sed -i 's/paths\.esm/paths.cjs/g' {} \;
jq '.exclude += ["./source/paths.esm.ts"]' tsconfig.build.json > tsconfig.build.json.tmp && mv tsconfig.build.json.tmp tsconfig.build.json
npx tsc -p tsconfig.build.json --outDir build/cjs
# Rename .js files to .cjs in the CJS build
find build/cjs -name "*.js" -exec sh -c 'mv "$1" "${1%.js}.cjs"' _ {} \;
# Replace .js imports with .cjs imports in source files
find build/cjs -name "*.cjs" -exec sed -i 's/\.js"/\.cjs"/g' {} \;

# Restore original package.json and tsconfig.build.json
mv package.json.orig package.json
mv tsconfig.build.json.orig tsconfig.build.json
# Undo the source change
find source -name "*.ts" -exec sed -i 's/paths\.cjs/paths.esm/g' {} \;

echo "📋 Creating package.json files for better module resolution..."
# Create package.json for CJS directory
cat > build/cjs/package.json << 'EOF'
{
  "type": "commonjs"
}
EOF

# Create package.json for ESM directory
cat > build/esm/package.json << 'EOF'
{
  "type": "module"
}
EOF

echo '✅ Dual package build completed successfully!'
