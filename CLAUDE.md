# CLAUDE.md

## Updating

To pull, build, and restart the relay seamlessly (and get a Telegram ping when it's back), run:

```bash
setsid nohup /home/exedev/bin/safe-update-relay >/dev/null 2>&1 < /dev/null &
```

The `setsid nohup … &` prefix is required so the script survives `pm2 restart` killing its caller.
