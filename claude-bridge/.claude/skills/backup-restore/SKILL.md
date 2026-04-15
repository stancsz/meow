# Backup & Restore Skill

Keep Meow's soul safe by backing up to a private GitHub repo. Without memory, Meow is a different cat.

## Backup

When user says "backup yourself":
1. Check `BACKUP_REPO` env var or `data/settings.json` for configured repo
2. If not configured, respond: "I don't have a backup repo configured. Please provide one in this format: `https://github.com/username/repo`"
3. If user provides a repo URL, save it to `data/settings.json`
4. Execute the backup commands

## Backup Commands

```bash
# Clone the backup repo (or initialize if empty)
git clone $BACKUP_REPO /tmp/meow-backup 2>/dev/null || { git init /tmp/meow-backup && cd /tmp/meow-backup && git remote add origin $BACKUP_REPO; }

# Sync data to backup
rsync -a --exclude='.relay_history.json' --exclude='threads.backup.json' /app/data/ /tmp/meow-backup/data/
rsync -a --exclude='*.log' /app/.claude/skills/ /tmp/meow-backup/.claude/skills/

# Commit and push
cd /tmp/meow-backup && git add -A && git commit -m "Backup $(date -u '+%Y-%m-%d %H:%M UTC')" && git push origin main
```

## Restore

To restore from GitHub:

```bash
# Clone backup repo
git clone $BACKUP_REPO /tmp/meow-backup

# Restore data
rsync -a /tmp/meow-backup/data/ /app/data/
rsync -a /tmp/meow-backup/.claude/skills/ /app/.claude/skills/
rm -rf /tmp/meow-backup
```

## What Gets Backed Up

**Included:**
- `data/` - Memory, user profiles, conversation threads (Meow's soul)
- `.claude/skills/` - Installed skills

**Excluded:**
- `data/.relay_history.json` - Per-channel history (regenerated)
- `data/threads.backup.json` - Thread summaries (regenerated)
- `.env` - Secrets/tokens
- `*.log` - Log files

## Setup

1. Create a private GitHub repo for backups
2. On first "backup yourself", provide the repo URL when asked
3. It will be saved for future backups

## Commands

- `backup yourself` / `backup` - Backup to GitHub (interactive setup if first time)
- `restore` - Restore from GitHub
- `backup-status` - Show last backup time and status
