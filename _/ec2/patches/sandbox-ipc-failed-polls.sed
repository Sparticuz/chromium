# Patch content/browser/sandbox_ipc_linux.cc
# After PLOG(WARNING) << "poll"; add failed_polls = 0;
# This prevents an infinite loop of poll warnings.
s/^\(\s*\)PLOG(WARNING) << "poll";$/\1PLOG(WARNING) << "poll"; failed_polls = 0;/
