.PHONY: ansible chromium

dependencies:
	sudo pacman -S ansible docker python-boto3 zip
	echo "aws-sam-cli-bin is also required in order to test the package"

build:
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini

build-arm:
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini --extra-vars "arch=arm64"

build-arm-libs:
	/usr/bin/ansible-playbook plays/arm-libs.yml -i inventory.ini --extra-vars "arch=arm64"
