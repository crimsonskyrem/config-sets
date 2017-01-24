sudo mount -t vboxsf VM_Connected ~/VM_Connected

VBoxClient-all

if ! pgrep -u "$USER" ssh-agent > /dev/null; then
    ssh-agent > ~/.ssh-agent-thing
fi
if [[ "$SSH_AGENT_PID" == "" ]]; then
    eval "$(<~/.ssh-agent-thing)"
fi

ssh-add ~/.ssh/id_rsa
