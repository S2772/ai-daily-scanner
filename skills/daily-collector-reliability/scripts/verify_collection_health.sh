#!/usr/bin/env bash
set -euo pipefail

python3 main.py collect
python3 main.py today
python3 main.py opportunities
