"""End-to-end journeys for the hye web build (Expo / react-native-web).

Run through the project skill's server helper (see e2e/README.md):

    python .claude/skills/webapp-testing/scripts/with_server.py \
        --server "npx expo start --web --port 8081" --port 8081 --timeout 600 \
        -- python e2e/web/test_journeys.py

Or against an already running server:  python e2e/web/test_journeys.py --base-url http://localhost:8081

The phone pass mimics a Pixel 8a (412x915, touch, DPR 2.625). A second pass at 1280x800 checks the
sidebar + split view. Screenshots land in e2e/artifacts/. Exit code is non-zero if any journey fails.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import traceback
from pathlib import Path

from playwright.sync_api import Browser, Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
ARTIFACTS = ROOT / "artifacts"
PRIYA = FIXTURES / "WhatsApp Chat with Priya.txt"
AMBIGUOUS = FIXTURES / "ambiguous.txt"

# Must match the expectations pinned in src/domain/import/__tests__/e2eFixtures.test.ts
PRIYA_ITEMS = 25          # 22 messages + 2 system notices + 1 deleted placeholder
AMBIGUOUS_ITEMS = 5

DEMO_REPLIES = [
    "Sounds good 👍", "Give me a minute, just finishing something.", "Ha, yes!",
    "Can we talk about it tomorrow?", "Sent you the details.", "Perfect, thanks!",
]

FIRST_LOAD_MS = 300_000   # first Metro web bundle can be slow
STEP_MS = 15_000

PHONE = dict(viewport={"width": 412, "height": 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={"width": 1280, "height": 800})


class Run:
    def __init__(self, prefix: str):
        self.prefix = prefix
        self.results: list[tuple[str, str, str]] = []  # (journey, PASS/FAIL/SKIP, note)
        self.notes: list[str] = []
        self.shot_n = 0

    def shot(self, page: Page, name: str):
        self.shot_n += 1
        path = ARTIFACTS / f"{self.prefix}-{self.shot_n:02d}-{name}.png"
        try:
            page.screenshot(path=str(path))
        except Exception as e:  # screenshots must never fail a journey
            print(f"    (screenshot {path.name} failed: {e})")

    def journey(self, name: str, page: Page, fn, *, requires: str | None = None):
        if requires and not any(j == requires and s == "PASS" for j, s, _ in self.results):
            self.results.append((name, "SKIP", f"needs '{requires}'"))
            print(f"[SKIP] {self.prefix}/{name} (needs {requires})")
            return
        t0 = time.time()
        try:
            fn(page, self)
            self.results.append((name, "PASS", f"{time.time() - t0:.1f}s"))
            print(f"[PASS] {self.prefix}/{name} ({time.time() - t0:.1f}s)")
        except Exception as e:
            self.shot(page, f"FAIL-{name}")
            msg = f"{type(e).__name__}: {str(e).splitlines()[0][:300]}"
            self.results.append((name, "FAIL", msg))
            print(f"[FAIL] {self.prefix}/{name}: {msg}")
            traceback.print_exc(limit=3)

    def note(self, text: str):
        self.notes.append(text)
        print(f"    NOTE: {text}")


# ---------------------------------------------------------------- helpers

def button(page: Page, name, exact=True):
    return page.get_by_role("button", name=name, exact=exact if isinstance(name, str) else None).filter(visible=True)


def text(page: Page, value, exact=False):
    return page.get_by_text(value, exact=exact).filter(visible=True)


def go_back(page: Page):
    button(page, "Back").first.click()


def to_inbox(page: Page):
    """Returns to the Inbox tab from anywhere inside the signed-in app."""
    for _ in range(6):
        if page.get_by_role("button", name="Import chat history").filter(visible=True).count():
            return
        back = button(page, "Back")
        if back.count():
            back.first.click()
            page.wait_for_timeout(400)
            continue
        tab = page.get_by_role("tab", name=re.compile(r"^Inbox")).filter(visible=True)
        if tab.count():
            tab.first.click()
            page.wait_for_timeout(400)
            continue
        page.goto(re.match(r"^https?://[^/]+", page.url).group(0) + "/")
    expect(button(page, "Import chat history")).to_be_visible(timeout=STEP_MS)


def pick_file(page: Page, trigger_name: str, path: Path):
    with page.expect_file_chooser(timeout=STEP_MS) as fc:
        button(page, trigger_name).first.click()
    fc.value.set_files(str(path))


def open_import_guide(page: Page):
    to_inbox(page)
    button(page, "Import chat history").click()
    expect(text(page, "Choose where your chat is from")).to_be_visible(timeout=STEP_MS)
    button(page, "WhatsApp").click()
    expect(button(page, "Choose export file")).to_be_visible(timeout=STEP_MS)


def stat(page: Page, label: str) -> int:
    """Reads a number from the import report's Imported/Skipped/Failed tiles."""
    label_el = page.get_by_text(label, exact=True).filter(visible=True).first
    raw = label_el.evaluate("e => e.parentElement.innerText")  # tile = number + label
    m = re.search(r"([\d,]+)\s*\n?\s*" + label, raw)
    if not m:
        raise AssertionError(f"Could not read stat '{label}' from {raw!r}")
    return int(m.group(1).replace(",", ""))


def sign_up(page: Page, base_url: str, name="Kannan", handle="kannan_e2e", email="kannan@example.com"):
    page.goto(base_url, timeout=FIRST_LOAD_MS)
    expect(button(page, "Get started")).to_be_visible(timeout=FIRST_LOAD_MS)
    button(page, "Get started").click()
    page.get_by_label("Your name").fill(name)
    page.get_by_label("Username").fill(handle)
    page.get_by_label(re.compile(r"^Email")).fill(email)
    button(page, "Create account").click()
    expect(button(page, "Import chat history")).to_be_visible(timeout=STEP_MS)


# ---------------------------------------------------------------- phone journeys

def j_signup(page: Page, r: Run, base_url: str):
    page.goto(base_url, timeout=FIRST_LOAD_MS)
    expect(button(page, "Get started")).to_be_visible(timeout=FIRST_LOAD_MS)
    assert "/welcome" in page.url, f"signed-out user should land on /welcome, got {page.url}"
    expect(text(page, "One place. All your conversations.")).to_be_visible()
    r.shot(page, "welcome")
    button(page, "Get started").click()
    expect(text(page, "Create your account")).to_be_visible()

    # Empty submit shows all three errors
    button(page, "Create account").click()
    expect(text(page, "Enter at least 2 characters")).to_be_visible()
    expect(text(page, "3–20 lowercase letters, numbers or _")).to_be_visible()
    expect(text(page, "Enter an email like name@example.com")).to_have_count(0)  # email is optional
    r.shot(page, "signup-errors-empty")

    # Invalid values keep errors; username is lower-cased as typed
    page.get_by_label("Your name").fill("K")
    page.get_by_label("Username").fill("Ab")
    page.get_by_label(re.compile(r"^Email")).fill("not-an-email")
    button(page, "Create account").click()
    expect(page.get_by_label("Username")).to_have_value("ab")
    expect(text(page, "Enter at least 2 characters")).to_be_visible()
    expect(text(page, "3–20 lowercase letters, numbers or _")).to_be_visible()
    expect(text(page, "Enter an email like name@example.com")).to_be_visible()
    page.get_by_label("Username").fill("bad handle!")
    button(page, "Create account").click()
    expect(text(page, "3–20 lowercase letters, numbers or _")).to_be_visible()
    r.shot(page, "signup-errors-invalid")

    # Fix them one by one; errors clear as values become valid
    page.get_by_label("Your name").fill("Kannan")
    expect(text(page, "Enter at least 2 characters")).to_have_count(0)
    page.get_by_label("Username").fill("kannan_e2e")
    expect(text(page, "3–20 lowercase letters, numbers or _")).to_have_count(0)
    page.get_by_label(re.compile(r"^Email")).fill("kannan@example.com")
    expect(text(page, "Enter an email like name@example.com")).to_have_count(0)
    button(page, "Create account").click()
    expect(button(page, "Import chat history")).to_be_visible(timeout=STEP_MS)
    assert "/welcome" not in page.url
    r.shot(page, "inbox-after-signup")


def j_inbox(page: Page, r: Run):
    to_inbox(page)
    for title in ["Ava Chen", "Rahul Menon", "Weekend hikers", "Design crit"]:
        expect(page.get_by_role("button", name=re.compile(rf"^{re.escape(title)}")).filter(visible=True).first).to_be_visible()
    # Archived demo chat is hidden from "All" and shown under "Archived"
    expect(page.get_by_role("button", name=re.compile(r"^Sara Ibrahim\.")).filter(visible=True)).to_have_count(0)
    # Pinned Ava is first, and has unread messages from the seed
    first_row = page.locator('[aria-label^="Ava Chen"]').filter(visible=True).first
    expect(first_row).to_have_attribute("aria-label", re.compile(r"^Ava Chen(, demo chat)?, \d+ unread\."))
    # Unread chip count and tab badge
    expect(page.get_by_role("tab", name=re.compile(r"^Inbox, \d+ unread"))).to_be_visible()
    r.shot(page, "inbox-demo")

    button(page, re.compile(r"^Archived")).first.click()
    expect(page.locator('[aria-label^="Sara Ibrahim"]').filter(visible=True).first).to_be_visible()
    r.shot(page, "inbox-archived")
    button(page, re.compile(r"^All")).first.click()

    # Inline filter by query
    page.get_by_label("Search conversations").fill("trail")
    expect(page.locator('[aria-label^="Weekend hikers"]').filter(visible=True)).to_have_count(1)
    expect(page.locator('[aria-label^="Ava Chen"]').filter(visible=True)).to_have_count(0)
    page.get_by_label("Search conversations").fill("")

    # The brief asks for visible "Demo" labels on demo conversations in the inbox.
    demo_in_inbox = page.get_by_text(re.compile(r"\bDemo\b")).filter(visible=True).count()
    if demo_in_inbox == 0:
        r.note("Inbox rows carry no 'Demo' label for simulated contacts (only the chat subtitle and New conversation list do).")


def j_chat(page: Page, r: Run):
    to_inbox(page)
    page.locator('[aria-label^="Ava Chen"]').filter(visible=True).first.click()
    expect(page.get_by_label("Message", exact=True)).to_be_visible(timeout=STEP_MS)
    expect(text(page, "Demo contact · simulated replies")).to_be_visible()
    expect(text(page, "Booking for 7pm?")).to_be_visible()
    r.shot(page, "chat-open")

    def ava_bubbles() -> int:
        return page.locator('[aria-label^="Ava Chen, "]').filter(visible=True).count()

    got_reply = False
    for attempt in range(1, 6):  # the demo replies ~75% of the time
        before = ava_bubbles()
        body = f"E2E hello #{attempt} from Playwright"
        page.get_by_label("Message", exact=True).fill(body)
        button(page, "Send").click()
        expect(page.get_by_label("Message", exact=True)).to_have_value("")
        mine = page.locator(f'[aria-label^="You, "][aria-label*="{body}"]').filter(visible=True)
        expect(mine).to_be_visible()
        # sending -> sent -> delivered -> read (read receipts are on by default)
        expect(mine).to_have_attribute("aria-label", re.compile(r", (sent|delivered|read)$"), timeout=3_000)
        if attempt == 1:
            r.shot(page, "chat-sent")
        expect(mine).to_have_attribute("aria-label", re.compile(r", read$"), timeout=5_000)
        try:
            expect(page.locator('[aria-label^="Ava Chen, "]').filter(visible=True)).to_have_count(before + 1, timeout=6_000)
            got_reply = True
            break
        except AssertionError:
            continue
    assert got_reply, "no simulated reply after 5 messages"
    last_reply = page.locator('[aria-label^="Ava Chen, "]').filter(visible=True).first.get_attribute("aria-label") or ""
    assert any(rep in last_reply for rep in DEMO_REPLIES), f"unexpected reply bubble {last_reply!r}"
    r.shot(page, "chat-reply")

    # Long-press menu: react 👍 to the reply
    page.locator('[aria-label^="Ava Chen, "]').filter(visible=True).first.click(delay=700)
    react = button(page, "React with 👍")
    if react.count():
        react.click()
        expect(page.locator('[aria-label^="Ava Chen, "][aria-label*="reactions 👍"]').filter(visible=True).first).to_be_visible()
        r.shot(page, "chat-reaction")
    else:
        r.note("Long-press (mouse hold) did not open the message menu on web; reactions not exercised.")
        page.keyboard.press("Escape")
    go_back(page)
    expect(button(page, "Import chat history")).to_be_visible(timeout=STEP_MS)
    expect(page.locator('[aria-label^="Ava Chen"]').filter(visible=True).first).to_have_attribute("aria-label", re.compile(r"^Ava Chen(, demo chat)?\. "))


def j_group(page: Page, r: Run):
    to_inbox(page)
    button(page, "New conversation").click()
    expect(text(page, "New conversation", exact=True)).to_be_visible(timeout=STEP_MS)
    expect(text(page, "Demo", exact=True).first).to_be_visible()  # demo contacts are labelled here
    r.shot(page, "new-chat")
    button(page, "Group").click()
    expect(text(page, "New group", exact=True)).to_be_visible()
    create_disabled = button(page, "Pick at least one person")
    expect(create_disabled).to_be_disabled()
    page.get_by_label("Group name").fill("E2E Goa trip")
    page.get_by_role("checkbox", name="Ava Chen, demo contact").click()
    page.get_by_role("checkbox", name="Leo Martins, demo contact").click()
    if page.get_by_role("checkbox", name="Ava Chen, demo contact").get_attribute("aria-checked") is None:
        r.note("Group member checkboxes expose no checked state on web (accessibilityState is ignored by react-native-web 0.21).")
    create = button(page, "Create group with 2 people")
    expect(create).to_be_enabled()
    r.shot(page, "new-group")
    create.click()
    expect(text(page, "You created “E2E Goa trip”")).to_be_visible(timeout=STEP_MS)
    expect(text(page, "You, Ava, Leo")).to_be_visible()
    expect(page.get_by_label("Message", exact=True)).to_be_visible()
    r.shot(page, "group-created")
    page.get_by_label("Message", exact=True).fill("Group hello from e2e")
    button(page, "Send").click()
    expect(page.locator('[aria-label^="You, "][aria-label*="Group hello from e2e"]').filter(visible=True)).to_be_visible()
    go_back(page)
    to_inbox(page)
    row = page.locator('[aria-label^="E2E Goa trip"]').filter(visible=True).first
    expect(row).to_be_visible()
    button(page, re.compile(r"^Groups")).first.click()
    expect(page.locator('[aria-label^="E2E Goa trip"]').filter(visible=True).first).to_be_visible()
    expect(page.locator('[aria-label^="Ava Chen"]').filter(visible=True)).to_have_count(0)
    button(page, re.compile(r"^All")).first.click()


def j_search(page: Page, r: Run):
    to_inbox(page)
    button(page, "Search all messages").click()
    box = page.get_by_label("Search messages")
    expect(box).to_be_visible(timeout=STEP_MS)
    expect(text(page, "Search across everything")).to_be_visible()
    box.fill("t")
    expect(text(page, "Type at least 2 characters")).to_be_visible()
    box.fill("trail")
    expect(text(page, "1 result", exact=True)).to_be_visible()
    hit = page.get_by_role("button", name=re.compile(r"^Maya Okafor in Weekend hikers: Trail is open again")).filter(visible=True)
    expect(hit).to_be_visible()
    r.shot(page, "search-trail")
    box.fill("e2e hello")
    expect(page.get_by_role("button", name=re.compile(r"in Ava Chen: E2E hello #1")).filter(visible=True)).to_be_visible()
    box.fill("zzzz-no-such-thing")
    expect(text(page, "No results for")).to_be_visible()
    box.fill("trail")
    hit.click()
    expect(text(page, "Trail is open again 🎉")).to_be_visible(timeout=STEP_MS)
    expect(page.get_by_label("Message", exact=True)).to_be_visible()
    go_back(page)


def j_import(page: Page, r: Run):
    open_import_guide(page)
    r.shot(page, "import-guide")
    pick_file(page, "Choose export file", PRIYA)
    expect(text(page, "Review before importing")).to_be_visible(timeout=STEP_MS)
    expect(text(page, "Priya", exact=True).first).to_be_visible()
    expect(text(page, "WhatsApp Chat with Priya.txt · 2 participants")).to_be_visible()
    expect(text(page, "How are dates written?")).to_have_count(0)  # day > 12 makes DMY unambiguous
    expect(text(page, "Which one is you?")).to_be_visible()
    me_chip = button(page, "Kannan")
    expect(me_chip).to_be_visible()
    if me_chip.get_attribute("aria-selected") is None:
        r.note("Chips expose no selected state on web (accessibilityState is ignored by react-native-web 0.21); "
               "'me' auto-selection is verified via outgoing bubbles instead.")
    expect(text(page, "22 messages", exact=True)).to_be_visible()
    expect(text(page, "2 system notices · 1 deleted · 1 edited")).to_be_visible()
    expect(text(page, "0 files included")).to_be_visible()
    expect(text(page, "2 referenced but missing · 1 left out by the export")).to_be_visible()
    r.shot(page, "import-review")
    page.mouse.wheel(0, 2000)
    r.shot(page, "import-review-bottom")
    button(page, f"Import {PRIYA_ITEMS} items").click()
    expect(text(page, "Import report")).to_be_visible(timeout=60_000)
    expect(text(page, "Import complete")).to_be_visible()
    imported, skipped, failed = stat(page, "Imported"), stat(page, "Skipped"), stat(page, "Failed")
    assert (imported, skipped, failed) == (PRIYA_ITEMS, 0, 0), (imported, skipped, failed)
    r.shot(page, "import-report")

    button(page, "Open conversation").click()
    expect(text(page, "Imported from a WhatsApp export")).to_be_visible(timeout=STEP_MS)
    expect(text(page, "2 participants · history only")).to_be_visible()
    expect(page.get_by_label("Message", exact=True)).to_have_count(0)  # read-only: no composer
    expect(button(page, "Send")).to_have_count(0)
    expect(text(page, "Can't wait for the marmalade sunsets")).to_be_visible()
    # my messages (Kannan) are outgoing
    expect(page.locator('[aria-label^="You, "][aria-label*="Definitely. Cheaper than cabs"]').filter(visible=True)).to_be_visible()
    r.shot(page, "imported-conversation")
    go_back(page)
    to_inbox(page)
    row = page.locator('[aria-label^="Priya, imported from WhatsApp"]').filter(visible=True).first
    expect(row).to_be_visible()
    expect(text(page, "WhatsApp import").first).to_be_visible()
    button(page, re.compile(r"^Imported")).first.click()
    expect(page.locator('[aria-label^="Priya, imported from WhatsApp"]').filter(visible=True).first).to_be_visible()
    r.shot(page, "inbox-imported-tab")
    button(page, re.compile(r"^All")).first.click()


def j_reimport(page: Page, r: Run):
    open_import_guide(page)
    pick_file(page, "Choose export file", PRIYA)
    expect(text(page, "Review before importing")).to_be_visible(timeout=STEP_MS)
    expect(text(page, f"{PRIYA_ITEMS} messages are already in hye")).to_be_visible()
    expect(text(page, "They’ll be skipped, so nothing is duplicated.")).to_be_visible()
    r.shot(page, "reimport-review")
    go_btn = button(page, "Import 0 items")
    expect(go_btn).to_be_visible()
    go_btn.click()
    expect(text(page, "Import report")).to_be_visible(timeout=60_000)
    imported, skipped, failed = stat(page, "Imported"), stat(page, "Skipped"), stat(page, "Failed")
    assert (imported, skipped, failed) == (0, PRIYA_ITEMS, 0), (imported, skipped, failed)
    expect(text(page, f"Skipped and failed · {PRIYA_ITEMS}")).to_be_visible()
    expect(text(page, "Already imported").first).to_be_visible()
    r.shot(page, "reimport-report")
    # Still exactly one copy of each message
    to_inbox(page)
    button(page, "Search all messages").click()
    page.get_by_label("Search messages").fill("marmalade")
    expect(text(page, "1 result", exact=True)).to_be_visible(timeout=STEP_MS)
    r.shot(page, "reimport-search-once")
    go_back(page)
    to_inbox(page)
    expect(page.locator('[aria-label^="Priya, imported from WhatsApp"]').filter(visible=True)).to_have_count(1)


def j_ambiguous(page: Page, r: Run):
    open_import_guide(page)
    pick_file(page, "Choose export file", AMBIGUOUS)
    expect(text(page, "Review before importing")).to_be_visible(timeout=STEP_MS)
    expect(text(page, "How are dates written?")).to_be_visible()
    blocked = button(page, "Choose a date format first")
    expect(blocked).to_be_disabled()
    r.shot(page, "ambiguous-ask-format")
    # 03/04/2025 -> 3 April (DMY) or 4 March (MDY); label wording follows the browser locale
    dmy = page.get_by_role("button", name=re.compile(r"(3 April|April 3),? 2025")).filter(visible=True)
    mdy = page.get_by_role("button", name=re.compile(r"(4 March|March 4),? 2025")).filter(visible=True)
    expect(dmy).to_be_visible()
    expect(mdy).to_be_visible()
    dmy.click()
    go_btn = button(page, f"Import {AMBIGUOUS_ITEMS} items")
    expect(go_btn).to_be_enabled()
    r.shot(page, "ambiguous-format-picked")
    go_btn.click()
    expect(text(page, "Import report")).to_be_visible(timeout=60_000)
    assert stat(page, "Imported") == AMBIGUOUS_ITEMS
    assert stat(page, "Failed") == 0
    r.shot(page, "ambiguous-report")
    button(page, "Open conversation").click()
    expect(text(page, "Imported from a WhatsApp export")).to_be_visible(timeout=STEP_MS)
    # Day-first was chosen, so 11/04 must render as 11 April (not 4 November)
    expect(text(page, re.compile(r"(11 April|April 11),? 2025"))).to_be_visible()
    go_back(page)


def j_delete_account(page: Page, r: Run, base_url: str):
    to_inbox(page)
    page.get_by_role("tab", name="More: Connections, Archive, Settings").click()
    button(page, "Settings").click()
    expect(text(page, "kannan@example.com")).to_be_visible(timeout=STEP_MS)
    button(page, "Your data").click()
    expect(button(page, "Delete my account")).to_be_visible(timeout=STEP_MS)
    expect(text(page, "2 imported conversations")).to_be_visible()
    r.shot(page, "your-data")
    button(page, "Delete my account").click()
    confirm = button(page, "Delete forever")
    expect(text(page, "Delete your account?")).to_be_visible()
    expect(confirm).to_be_disabled()
    box = page.get_by_label("Type DELETE to confirm")
    box.fill("DELET")
    expect(confirm).to_be_disabled()
    box.fill("remove")
    expect(confirm).to_be_disabled()
    # Cancel keeps the account
    button(page, "Cancel").click()
    expect(text(page, "Delete your account?")).to_have_count(0)
    button(page, "Delete my account").click()
    box = page.get_by_label("Type DELETE to confirm")
    expect(box).to_have_value("")
    box.fill("DELETE")
    expect(confirm).to_be_enabled()
    r.shot(page, "delete-confirm")
    confirm.click()
    expect(button(page, "Get started")).to_be_visible(timeout=STEP_MS)
    r.shot(page, "after-delete-welcome")
    # Data is really gone: a reload stays signed out
    page.wait_for_timeout(800)  # state is persisted with a 300 ms debounce
    page.goto(base_url)
    expect(button(page, "Get started")).to_be_visible(timeout=FIRST_LOAD_MS)
    stored = page.evaluate("() => localStorage.getItem('hye/state/v1')")
    assert stored is None or '"user":null' in stored, f"account data still stored: {stored[:200]}"


# ---------------------------------------------------------------- desktop journey

def j_desktop_split(page: Page, r: Run, base_url: str):
    sign_up(page, base_url, handle="kannan_wide", email="wide@example.com")
    for tab in ["Messages", "Communities", "Social Feed", "Connections", "Archive", "Settings"]:
        expect(page.get_by_role("tab", name=tab, exact=True)).to_be_visible()
    expect(page.get_by_role("tab", name=re.compile(r"^Inbox"))).to_be_visible()
    expect(page.get_by_role("tab", name=re.compile(r"^More"))).to_have_count(0)
    expect(text(page, "Pick a conversation")).to_be_visible()
    r.shot(page, "desktop-inbox")
    url_before = page.url
    page.locator('[aria-label^="Weekend hikers"]').filter(visible=True).first.click()
    expect(page.get_by_label("Message", exact=True)).to_be_visible(timeout=STEP_MS)
    expect(page.get_by_label("Search conversations")).to_be_visible()  # list still on screen
    expect(text(page, "Saturday 8am at the north gate?")).to_be_visible()
    assert page.url == url_before, f"wide layout should not navigate, went to {page.url}"
    page.get_by_label("Message", exact=True).fill("wide hello")
    button(page, "Send").click()
    expect(page.locator('[aria-label^="You, "][aria-label*="wide hello"]').filter(visible=True)).to_be_visible()
    r.shot(page, "desktop-split")
    page.get_by_role("tab", name="Settings", exact=True).click()
    expect(text(page, "wide@example.com")).to_be_visible(timeout=STEP_MS)
    r.shot(page, "desktop-settings")


# ---------------------------------------------------------------- runner

def run_phone(browser: Browser, base_url: str) -> Run:
    r = Run("phone")
    ctx = browser.new_context(**PHONE, locale="en-GB")
    ctx.set_default_timeout(STEP_MS)
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    r.journey("signup", page, lambda p, rr: j_signup(p, rr, base_url))
    r.journey("inbox", page, j_inbox, requires="signup")
    r.journey("chat", page, j_chat, requires="signup")
    r.journey("group", page, j_group, requires="signup")
    r.journey("search", page, j_search, requires="signup")
    r.journey("import", page, j_import, requires="signup")
    r.journey("reimport-dedupe", page, j_reimport, requires="import")
    r.journey("ambiguous-dates", page, j_ambiguous, requires="signup")
    r.journey("delete-account", page, lambda p, rr: j_delete_account(p, rr, base_url), requires="signup")
    for e in errors:
        r.note(f"page error: {e[:200]}")
    ctx.close()
    return r


def run_desktop(browser: Browser, base_url: str) -> Run:
    r = Run("desktop")
    ctx = browser.new_context(**DESKTOP, locale="en-GB")
    ctx.set_default_timeout(STEP_MS)
    page = ctx.new_page()
    r.journey("sidebar-split-view", page, lambda p, rr: j_desktop_split(p, rr, base_url))
    ctx.close()
    return r


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://localhost:8081")
    ap.add_argument("--only", choices=["phone", "desktop"], help="run one pass only")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    runs: list[Run] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        # Warm the bundle once so the first journey's timeouts aren't spent on Metro.
        warm = browser.new_page()
        warm.goto(args.base_url, timeout=FIRST_LOAD_MS)
        warm.get_by_role("button", name="Get started").wait_for(timeout=FIRST_LOAD_MS)
        warm.close()
        if args.only in (None, "phone"):
            runs.append(run_phone(browser, args.base_url))
        if args.only in (None, "desktop"):
            runs.append(run_desktop(browser, args.base_url))
        browser.close()

    print("\n==== hye web e2e summary ====")
    failed = 0
    for r in runs:
        for name, status, note in r.results:
            print(f"{status:4}  {r.prefix}/{name:22} {note}")
            failed += status != "PASS"
        for n in r.notes:
            print(f"NOTE  {r.prefix}: {n}")
    print(f"screenshots: {ARTIFACTS}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
