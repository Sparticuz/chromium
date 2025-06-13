.PHONY: ansible chromium

dependencies:
	sudo pacman -S ansible docker python-boto3 zip
	echo "aws-sam-cli-bin is also required in order to test the package"

build:
	echo "Building both architectures takes roughly 5 hours"
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini

build-x64:
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini --extra-vars 'archs=["x64"]'

build-arm:
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini --extra-vars 'archs=["arm64"]'

build-arm-libs:
	/usr/bin/ansible-playbook plays/arm-libs.yml -i inventory.ini
