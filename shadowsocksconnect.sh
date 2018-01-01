#!/bin/zsh

ssdir=~/.bandwagon

nohup ss-local -c $ssdir/config.json > $ssdir/ss.log 2>&1 &

sudo systemctl start privoxy

nohup chromium %U --proxy-server=127.0.0.1:8888 > $ssdir/proxy.log 2>&1 &
