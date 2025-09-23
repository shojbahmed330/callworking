import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        error_messages = []
        page.on("console", lambda msg: error_messages.append(f"CONSOLE: [{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: error_messages.append(f"PAGEERROR: {exc}"))

        try:
            print("Navigating to http://localhost:5173/")
            await page.goto("http://localhost:5173/", timeout=30000)
            await page.wait_for_load_state('networkidle', timeout=30000)
            print("Page loaded.")

            text_input = page.locator('input[type="text"]')
            await expect(text_input).to_be_visible(timeout=20000)
            print("Found text input.")

            print("Entering username/email...")
            await text_input.fill("sadaf@gmail.com")
            await text_input.press("Enter")

            await page.wait_for_timeout(1000)

            print("Entering password...")
            await text_input.fill("786400")
            await text_input.press("Enter")

            print("Waiting for feed screen...")
            create_post_button = page.get_by_role("button", name="What's on your mind")
            await expect(create_post_button).to_be_visible(timeout=20000)
            print("Login successful.")

            print("Looking for 'Shojib' in contacts sidebar...")
            sidebar = page.locator('aside')
            shojib_contact = sidebar.get_by_text("Shojib", exact=True)
            await expect(shojib_contact).to_be_visible(timeout=10000)

            await shojib_contact.click()
            print("Opened chat with Shojib.")

            chat_header = page.locator('header:has-text("Shojib")')
            if not await chat_header.is_visible():
                chat_header = page.locator('header').last

            video_call_button = chat_header.locator('button').nth(2)

            await expect(video_call_button).to_be_visible(timeout=10000)
            await video_call_button.click()
            print("Clicked video call button.")

            print("Waiting for potential errors on CallScreen...")
            await page.wait_for_timeout(5000)
            print("Test finished.")

        except Exception as e:
            print(f"An error occurred during Playwright execution: {e}")

        finally:
            await browser.close()
            with open("jules-scratch/verification/error.log", "w") as f:
                for msg in error_messages:
                    f.write(msg + "\n")
            print("Captured logs to error.log")

if __name__ == "__main__":
    asyncio.run(main())
