# Troubleshooting Guide

Common issues and solutions for the FSE Deployment Cost Calculator.

---

## Authentication Issues

### Session Error / Redirect Loop

**Symptoms:**
- "Session Error" screen appears
- Console shows `[AUTH] Redirect loop detected (count=2)`
- Page keeps redirecting between `index.html` and `app.html`

**Cause:**
The authentication flow fails when:
1. Supabase auth check times out or fails
2. User is not approved in `app_users` table
3. SessionStorage counter reaches threshold (2 redirects)

**Solutions:**

1. **For users:** Click "Clear & Retry" button, or clear browser data and try again

2. **For developers:** Use dev mode bypass by visiting:
   ```
   https://cozmcode.github.io/project-cost-estimates/app.html?dev=true
   ```

3. **If deploying changes:** Ensure changes are committed AND pushed to GitHub. Local changes won't affect GitHub Pages.

---

### "clearAllAndRetry is not defined" Error

**Symptoms:**
- Clicking "Clear & Retry" button does nothing
- Console shows `ReferenceError: clearAllAndRetry is not defined`

**Cause:**
Function definitions in the auth check script must be placed BEFORE any early `return` statements. If a function is defined after `return`, it won't exist when the error UI calls it.

**Solution:**
Ensure `window.clearAllAndRetry` is defined at the top of the auth check script, before the redirect loop guard that may `return` early.

**Code pattern to follow:**
```javascript
(async function() {
    // 1. Dev mode check (with early return)
    if (isDevMode) { ... return; }

    // 2. Define helper functions BEFORE redirect loop guard
    window.clearAllAndRetry = function() { ... };

    // 3. Redirect loop guard (with early return that shows error UI)
    if (redirectCount >= 2) { ... return; }

    // 4. Main auth logic
    ...
})();
```

---

## Deployment Issues

### Changes Not Appearing on GitHub Pages

**Symptoms:**
- Made code changes but live site still shows old behaviour
- Browser shows cached version

**Cause:**
1. Changes not committed/pushed to GitHub
2. GitHub Pages deployment still in progress
3. Browser caching old files

**Solutions:**

1. **Verify changes are pushed:**
   ```bash
   git status  # Should show "nothing to commit"
   git log -1  # Should show your latest commit
   ```

2. **Wait for GitHub Pages deployment** (typically 1-2 minutes)

3. **Hard refresh browser:**
   - Mac: Cmd + Shift + R
   - Windows: Ctrl + Shift + R
   - Or open incognito/private window

4. **Check GitHub Actions** for deployment status at:
   ```
   https://github.com/cozmcode/project-cost-estimates/actions
   ```

---

## Voice Feature Issues

### Voice Button Missing

**Symptoms:**
- Voice button not visible in header
- `toggleVoice is not defined` error

**Cause:**
Voice button HTML was accidentally removed during edits. This has happened multiple times.

**Solution:**
Verify these elements exist in `app.html`:

1. **Desktop voice button** (around line 466-471):
   ```html
   <button class="voice-btn" id="voiceBtn" onclick="toggleVoice()">
       <svg class="w-5 h-5 mic-icon" ...>...</svg>
       <span id="voiceBtnText">Voice</span>
   </button>
   ```

2. **Mobile voice button** (around line 424-430):
   ```html
   <button id="voiceBtnMobile" onclick="toggleVoice()" ...>
       <svg ...microphone icon...>...</svg>
   </button>
   ```

**Pre-commit check:**
```bash
grep -n "voiceBtn\|voiceBtnMobile\|toggleVoice" app.html
```
Should return multiple matches for both button IDs and onclick handlers.

---

## Browser-Specific Issues

### Safari/Mobile Session Problems

**Symptoms:**
- Auth works on Chrome but fails on Safari
- Mobile browsers show session errors

**Cause:**
Safari has stricter cookie/storage policies, especially in private mode.

**Solutions:**
1. Use dev mode: `?dev=true`
2. Ensure user is not in private browsing mode
3. Clear all site data and retry

---

## Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Session Error loop | Add `?dev=true` to URL |
| Changes not live | `git push` and wait 2 mins |
| Button not working | Check function defined before `return` |
| Voice button gone | Search for `voiceBtn` in app.html |
| Browser cache | Cmd+Shift+R or incognito |
