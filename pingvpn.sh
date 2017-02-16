#!/bin/bash

OPT_T=false
OPT_S=false
DefaultFolder=/etc/NetworkManager/system-connections

function HELP {
    echo "This is help message"
    echo "for now there is 2 options available"
    echo "    -s for selection mode, this will ping every remote server, and then manually select your ideal server"
    echo "    -t for speed test mode, this will only ping remote server, and exit."
    exit
}

function CONNECT {
    echo "starting connection to "$1
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
        if [ $OPT_T = false ]; then
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
    read -p 'type number to connect: ' num
    while [ $num -gt $[$seq-1] ]
    do
        read -p 'Wrong argument, please try again: ' num
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
            echo 'Speed test mode, only ping remote'
            OPT_T=true
            PING
            exit
            ;;
        s)
            OPT_S=true
            OPT_T=true
            echo 'Selection mode, ping every domain, then manually select remote server'
            ;;
        h)
            HELP
            ;;
        \?)
            echo 'Wrong argument,try -h for more help'
            exit
            ;;
    esac
done
MAIN
