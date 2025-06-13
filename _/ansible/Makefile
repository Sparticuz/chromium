.PHONY: linux-dependencies python-dependencies build get-chrome build-chrome compress-and-download-chrome teardown

linux-dependencies:
	sudo apt install python3-pip zip
	echo "Docker is also required in order to test the package, please install docker or Docker Desktop"

python-dependencies:
	pip install ansible boto boto3 aws-sam-cli

build:
	ansible-playbook plays/chromium.yml -i inventory.ini

only-get-chrome:
	ansible-playbook plays/chromium.yml -i inventory.ini --tags get-chrome

only-build-chrome:
	ansible-playbook plays/chromium.yml -i inventory.ini --tags build-chrome

only-compress-and-download-chrome:
	ansible-playbook plays/chromium.yml -i inventory.ini --tags compress-and-download-chrome

only-teardown:
	ansible-playbook plays/chromium.yml -i inventory.ini --tags teardown
