# Chromium Playbook

This Ansible playbook will launch an EC2 `c6a.12xlarge` Spot Instance and compile Chromium statically.

Once the compilation finishes, the binary will be compressed with Brotli and downloaded.

The whole process usually takes around 1 hour to on a `c6a.12xlarge` instance.

## Chromium Version

To compile a specific version of Chromium, update the `chromium_revision` variable in the Ansible inventory, i.e.:

```shell
chromium_revision=1056772
```

See here for chrome versions: https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Linux

## Usage

```shell
# setup required deps (linux or go your own way)
make linux-dependencies
# setup build reqs
make python-dependencies

AWS_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXX \
AWS_SECRET_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
make build
```

## Requirements

- [Ansible](http://docs.ansible.com/ansible/latest/intro_installation.html#latest-releases-via-apt-ubuntu)
- AWS SDK for Python (`boto` and `boto3`)


## Troubleshooting

#### Dangling images?

See what's running with the following (replacing the region as needed.)
```shell
aws ec2 describe-instances --region us-west-2 --filters "Name=tag:Name,Values=Chromium" --query "Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]" --output table
```

#### Host already running?

Add your ip under the `[aws]` section in `inventory.ini`

```ini
[aws]
your.instance.ip.address
```
