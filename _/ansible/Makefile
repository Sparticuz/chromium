.PHONY: ansible chromium

dependencies:
	sudo pacman -S ansible docker python-boto3 zip
	echo "aws-sam-cli-bin is also required in order to test the package"

build:
	/usr/bin/ansible-playbook plays/chromium.yml -i inventory.ini
