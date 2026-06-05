# List available commands
default:
    @just --list

# Open the game in Chrome
open:
    open -a "Google Chrome" index.html

# Show working copy status
status:
    jj status

# Show recent commit log
log:
    jj log

# Show diff of working copy
diff:
    jj diff

# Commit work with a message
commit msg:
    jj commit -m "{{msg}}"
