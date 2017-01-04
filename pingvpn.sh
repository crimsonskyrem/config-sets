#!/bin/bash
echo 'vpn script is running'
active=$(nmcli con show --active |grep vpn|awk '{print $1}')
if [ -z $active ]; then
    DefaultFolder=/etc/NetworkManager/system-connections
    speed=()
    files=()
    i=0
    for file_a in ${DefaultFolder}/*; do
        if [[ -d $file_a ]];then
            break;
        fi
        tmp=$(echo $file_a|awk -F / '{print $NF}')
        echo -n $tmp:
        speed[$i]=$(ping -c 4 $(sudo awk -F '[:=]' '/remote/{print $2}' ${file_a})|tail -n 1|awk -F '[/.]' '{print $8}')
        files[$i]=$(echo ${file_a}|awk -F / '{print $5}')
        echo -n ${speed[$i]}"ms | "
        if [ ${speed[$i]} -lt 49 ]; then
            echo $tmp" is fast , skip the rest & starting connection"
            nmcli con up id $tmp
            exit;
        fi
        ((i++))
    done
    echo ""
    min=${speed[0]}
    pos=0
    index=$[${#speed[*]}-1]
    for j in `seq 1 $index`; do
        if [ $min -gt ${speed[$j]} ]; then
            min=${speed[$j]}
            pos=$j
        fi
    done
    echo "starting connection to "${files[$pos]}
    nmcli con up id ${files[$pos]}
else
    echo "vpn connection already exist! connection id is "$active
    echo "do you wanna close it? (y/n)"
    old_stty_cfg=$(stty -g)
    stty raw -echo
    answer=$( while ! head -c 1 | grep -i '[ny]' ;do true ;done )
    stty $old_stty_cfg
    if echo "$answer" | grep -iq "^y" ;then
        echo "closing..."
        nmcli con down id $active
    fi
fi

