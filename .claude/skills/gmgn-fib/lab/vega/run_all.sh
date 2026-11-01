#!/bin/sh
# pure python3, no deps. each script prints its own table.
cd "$(dirname "$0")"
for s in p1 p2 p2s p2b p3 p3b p4 p4b p4c p5 p6; do echo "##### $s"; python3 $s.py; done
