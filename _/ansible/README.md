# Chromium Playbook

This Ansible playbook will launch an EC2 `c6a.12xlarge` Spot Instance and compile Chromium statically.

Once the compilation finishes, the binary will be compressed with Brotli and downloaded.

The whole process usually takes around 1 hour to on a `c6a.12xlarge` instance.

## Chromium Version

To compile a specific version of Chromium, update the `chromium_revision` variable in the Ansible inventory, i.e.:

```shell
chromium_revision=1056772
```

## Usage

```shell
AWS_REGION=us-east-1 \
AWS_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXX \
AWS_SECRET_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
make chromium
```

## Requirements

- [Ansible](http://docs.ansible.com/ansible/latest/intro_installation.html#latest-releases-via-apt-ubuntu)
- AWS SDK for Python (`boto` and `boto3`)
