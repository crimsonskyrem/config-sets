#!/bin/bash
echo 'This is for testing speed of given openvpn files'
DefaultFolder=$HOME/openvpn
while getopts ":f" optname
do
    case "$optname" in
        "f")
            DefaultFolder=$HOME/openvpn/fast
            ;;
    esac
done
for file_a in ${DefaultFolder}/*; do
    if [[ -d $file_a ]];then
        break;
    fi
    tmp=$(echo $file_a|awk -F / '{print $NF}')
    echo -n $tmp:
    ping -c 4 $(awk '/remote/{print $2}' ${file_a})|tail -n 1|awk -F / '{print " "$5" ms"}'
done
