# Browser Test

Verify a feature works on the live site using Nova Act.

## Input
The user will describe what to test (e.g., "test the bracket page loads and reordering works").

## Workflow

1. Source test credentials from `.ralph/.test-creds`
2. Write a temporary Nova Act test script at `/tmp/test_feature.py`
3. The script should:
   - Use `headless=True`
   - Navigate to https://worldcup.edgecdec.com
   - Log in using test credentials if testing authenticated pages
   - Perform the specified verification steps
   - Use `max_steps=5` per `act()` call
4. Run with `/opt/homebrew/bin/python3.13 /tmp/test_feature.py`
5. Report pass/fail with details
6. Delete the temp script after

## Nova Act Notes
- `ActResult` only has a `metadata` attribute — no `.response` or `.success`
- Success = `act()` completes without raising an exception
- Use `starting_page` not `starting_url` in the constructor
- The site does NOT have Cloudflare blocking — failures are real bugs
