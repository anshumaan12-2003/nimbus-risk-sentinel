import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        print("Navigating to localhost:3000...")
        try:
            await page.goto("http://localhost:3000", wait_until="networkidle", timeout=30000)
            print("Loaded page!")
            await page.screenshot(path="screenshot.png")
            print("Screenshot saved to screenshot.png")
            
            # Print console logs
            page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
            
        except Exception as e:
            print("Error loading page:", e)
            
        await browser.close()

asyncio.run(main())
