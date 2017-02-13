#!/bin/bash

echo 'vpn script is running'

OPT_T=false
OPT_S=false
DefaultFolder=/etc/NetworkManager/system-connections

function HELP {
    echo "This is help message"
    echo -e \\n""\\n
    exit
}

function CONNECT {
    nmcli con up id $1
}

function STRAIGHT {
    if [ $1 -lt 49 ]; then
        echo $2 " is fast , skip the rest & starting connection"
        CONNECT $2
        exit
    fi
}

function PING {
    speed=()
    files=()
    i=0
    for file_a in ${DefaultFolder}/*; do
        if [[ -d $file_a ]];then
            break;
        fi
        tmp=$(echo $file_a|awk -F / '{print $NF}')
        echo -n $tmp:
        tmpSpeed=$(ping -c 4 $(sudo awk -F '[:=]' '/remote/{print $2}' ${file_a})|tail -n 1|awk -F '[/.]' '{print $8}')
        if [ -z $tmpSpeed ]; then
            speed[$i]=9999
            echo -n "Unreachable | "
        else
            speed[$i]=$tmpSpeed
            echo -n $tmpSpeed"ms | "
        fi
        if [ $OPT_S = false ]; then
            STRAIGHT ${speed[$i]} $tmp
        fi
        files[$i]=$(echo ${file_a}|awk -F / '{print $5}')
        ((i++))
    done
}

function FINDMIN {
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
    CONNECT ${files[$pos]}

}

function SELECT {
    echo ""
    echo 'select mode'
    domain=()
    seq=0
    for file_a in ${DefaultFolder}/*; do
        tmp=$(echo $file_a|awk -F / '{print $NF}')
        echo $seq"."$tmp
        domain[$seq]=$tmp
        ((seq++))
    done
    read -p 'type number to connect:' num
    while [ $num -gt $[$seq-1] ]
    do
        read -p 'your input is wrong, please try again:' num
    done
    CONNECT ${domain[$num]}
}

function MAIN {
    active=$(nmcli con show --active |grep vpn|awk '{print $1}')
    if [ -z $active ]; then
        PING
        if [ $OPT_S = true ]; then
            SELECT
        else
            FINDMIN
        fi
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
}


while getopts 'tsh' FLAG; do
    case $FLAG in
        t)
            echo 'speed testing mode, only ping remote'
            OPT_T=true
            PING
            exit
            ;;
        s)
            OPT_S=true
            echo 'selection mode, ping every domain,and manually choose'
            ;;
        h)
            HELP
            ;;
        \?)
            echo 'wrong argument,please type -h for more help'
            exit
            ;;
    esac
done
MAIN
