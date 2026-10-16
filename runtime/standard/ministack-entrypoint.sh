#!/bin/sh
set -eu

state_dir="${STATE_DIR:-/tmp/ministack-state}"
s3_data_dir="${S3_DATA_DIR:-/tmp/ministack-s3-data}"
mkdir -p "$state_dir" "$s3_data_dir"
chown -R ministack:ministack "$state_dir" "$s3_data_dir"

exec su -p -s /bin/sh ministack -c 'exec python /opt/ministack/ministack_overlay.py'
