.PHONY: ansible chromium

dependencies:
	pip3 install ansible boto boto3 aws-sam-cli
	echo "Docker is also required in order to test the package, please install docker or Docker Desktop"

chromium:
	ansible-playbook plays/chromium.yml -i inventory.ini
